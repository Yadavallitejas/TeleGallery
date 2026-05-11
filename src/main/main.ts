import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, Notification, safeStorage, session, shell, protocol, net, clipboard, nativeImage } from 'electron';
import * as path from 'path';
import fs from 'fs/promises';
import os from 'os';
import Store from 'electron-store';
import { DatabaseService } from './services/DatabaseService';
import * as dotenv from 'dotenv';
import sharp from 'sharp';
import crypto from 'crypto';
import type { FSWatcher } from 'chokidar';
import { autoUpdater } from 'electron-updater';

// Load .env from project root (works in dev; in prod, omit or bundle separately)
dotenv.config({ path: path.join(app.getAppPath(), '.env') });

// Lazy-import GramJS to avoid ESM issues at top-level
let TelegramClient: any;
let StringSession: any;
let Api: any;

async function loadGramJS() {
  if (!TelegramClient) {
    const gram = await import('telegram');
    const sessions = await import('telegram/sessions');
    const tl = await import('telegram/tl');
    TelegramClient = gram.TelegramClient;
    StringSession = sessions.StringSession;
    Api = tl.Api;
  }
}

const isDev = !app.isPackaged;

// Register thumb:// as a privileged scheme before app is ready
// This lets the renderer load local thumbnails without file:// CSP issues
protocol.registerSchemesAsPrivileged([
  { scheme: 'thumb', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: false } }
]);

process.on('uncaughtException', (err) => {
  const logPath = path.join(app.getPath('userData'), 'crash.log');
  require('fs').appendFileSync(logPath, `[${new Date().toISOString()}] Uncaught Exception: ${err.stack}\n`);
});

process.on('unhandledRejection', (reason, promise) => {
  const logPath = path.join(app.getPath('userData'), 'crash.log');
  require('fs').appendFileSync(logPath, `[${new Date().toISOString()}] Unhandled Rejection at: ${promise}, reason: ${reason}\n`);
});

const store = new Store();

let mainWindow: BrowserWindow | null = null;
// DatabaseService handles DB connection
let tgClient: any = null;

let tray: Tray | null = null;
let forceQuit = false;
let syncNotificationCount = 0;
let syncNotificationTimer: NodeJS.Timeout | null = null;

function buildTrayMenu() {
  if (!tray) return;
  const autoSync = store.get('auto_sync_enabled') as boolean | undefined;
  let totalPhotos = 0;
  if (DatabaseService.getInstance().db) {
     const row = DatabaseService.getInstance().get("SELECT value FROM sync_state WHERE key = 'total_photos'");
     totalPhotos = row ? parseInt((row as any).value, 10) : 0;
  }
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open TeleGallery', click: () => mainWindow?.show() },
    { label: `Sync status: ${totalPhotos} photos synced`, enabled: false },
    { label: autoSync ? 'Pause sync' : 'Resume sync', click: () => {
        store.set('auto_sync_enabled', !autoSync);
        updateSyncFolderWatcher();
        buildTrayMenu();
    } },
    { type: 'separator' },
    { label: 'Quit', click: () => { forceQuit = true; app.quit(); } }
  ]);
  tray.setContextMenu(contextMenu);
}

function notifySync(count: number) {
  syncNotificationCount += count;
  if (syncNotificationTimer) clearTimeout(syncNotificationTimer);
  syncNotificationTimer = setTimeout(() => {
    if (Notification.isSupported()) {
      new Notification({
        title: 'TeleGallery Sync',
        body: `${syncNotificationCount} new photos/videos synced to TeleGallery`
      }).show();
    }
    syncNotificationCount = 0;
    buildTrayMenu();
  }, 2000);
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Master Index structure Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

const CHANNEL_TITLE = 'TeleGallery_Storage';
const CHANNEL_DESCRIPTION = 'TeleGallery app storage - do not delete';
/** Stores { id: string, accessHash: string } as JSON Ã¢â‚¬â€ both values required for Telegram API */
const STORE_KEY_CHANNEL = 'tg-storage-channel';
/** Legacy key Ã¢â‚¬â€ kept only for one-time migration during tg-setup-storage */
const STORE_KEY_CHANNEL_ID = 'tg-storage-channel-id';
const STORE_KEY_SESSION = 'tg-session';

interface MasterIndex {
  version: number;
  total_photos: number;
  photos: any[];
  albums: Array<{ id: string; name: string; cover?: string; count: number }>;
  photo_albums: Array<{ photo_id: string; album_id: string }>;
  settings: { theme: string; auto_sync: boolean };
  last_synced: string;
  app_version: string;
}

function buildFreshIndex(): MasterIndex {
  return {
    version: 1,
    total_photos: 0,
    photos: [],
    albums: [],
    photo_albums: [],
    settings: { theme: 'light', auto_sync: false },
    last_synced: new Date().toISOString(),
    app_version: '1.0.0',
  };
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Telegram helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function getApiCredentials() {
  const envApiId = process.env.TELEGRAM_API_ID;
  const envApiHash = process.env.TELEGRAM_API_HASH;
  
  if (envApiId && envApiHash) {
    return { apiId: parseInt(envApiId, 10), apiHash: envApiHash };
  }

  try {
    const encApiId = store.get('api_id_enc') as string;
    const encApiHash = store.get('api_hash_enc') as string;
    if (encApiId && encApiHash && safeStorage.isEncryptionAvailable()) {
      return {
        apiId: parseInt(safeStorage.decryptString(Buffer.from(encApiId, 'base64')), 10),
        apiHash: safeStorage.decryptString(Buffer.from(encApiHash, 'base64'))
      };
    }
  } catch(e) {
    console.warn('Failed to decrypt API credentials from store');
  }

  throw new Error('TELEGRAM_API_ID and TELEGRAM_API_HASH must be set in .env file or safeStorage');
}

async function getTelegramClient(sessionStr = ''): Promise<any> {
  await loadGramJS();
  const { apiId, apiHash } = getApiCredentials();
  const session = new StringSession(sessionStr);
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 3,
    useWSS: false,
  });
  await client.connect();
  return client;
}

function mapTelegramError(err: any): string {
  const msg: string = err?.message ?? String(err);
  if (msg.includes('PHONE_CODE_INVALID')) return 'The code you entered is incorrect. Please try again.';
  if (msg.includes('PHONE_CODE_EXPIRED')) return 'The code has expired. Please request a new one.';
  if (msg.includes('FLOOD_WAIT')) {
    const seconds = msg.match(/FLOOD_WAIT_(\d+)/)?.[1] ?? '?';
    return `Too many attempts. Please wait ${seconds} seconds before trying again.`;
  }
  if (msg.includes('PHONE_NUMBER_BANNED')) return 'This phone number has been banned from Telegram.';
  if (msg.includes('PHONE_NUMBER_INVALID')) return 'Invalid phone number. Please check the number and try again.';
  if (msg.includes('SESSION_PASSWORD_NEEDED')) return 'Two-factor authentication required.';
  if (msg.includes('NETWORK') || msg.includes('ECONNREFUSED')) return 'Network error. Please check your internet connection.';
  if (msg.includes('TELEGRAM_API_ID') || msg.includes('TELEGRAM_API_HASH')) return msg;
  return `Unexpected error: ${msg}`;
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Storage channel helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

/** Sends a progress event to the renderer. */
function sendProgress(step: number, total: number, current: number, label: string) {
  mainWindow?.webContents.send('tg-restore-progress', { step, total, current, label });
}

/**
 * Persists the channel's id + access_hash so we can reconstruct a valid
 * InputChannel on every subsequent launch without needing the entity object.
 */
function saveStorageChannel(entity: any) {
  store.set(STORE_KEY_CHANNEL, JSON.stringify({
    id: entity.id.toString(),
    accessHash: entity.accessHash?.toString() ?? '0',
  }));
  // Also keep legacy key for backward compat with older code paths (cleared on next save)
  store.delete(STORE_KEY_CHANNEL_ID);
}

/**
 * Returns a proper GramJS InputChannel built from the persisted id+accessHash.
 * If the accessHash is stale/missing, falls back to a live getDialogs lookup.
 */
async function getStorageChannel(): Promise<any> {
  await loadGramJS();

  const raw = store.get(STORE_KEY_CHANNEL) as string | undefined;
  if (raw) {
    try {
      const { id, accessHash } = JSON.parse(raw);
      const channelId = BigInt(id);
      const hash = BigInt(accessHash);
      // Validate: Telegram always assigns a non-zero accessHash to channels you own
      if (hash !== BigInt(0)) {
        return new Api.InputChannel({ channelId, accessHash: hash });
      }
    } catch { /* fall through to live lookup */ }
  }

  // Legacy migration: old store used only the id string
  const legacyId = store.get(STORE_KEY_CHANNEL_ID) as string | undefined;

  // Live lookup Ã¢â‚¬â€ find the entity and persist it properly this time
  const entity = await findStorageChannel();
  if (!entity) throw new Error('TeleGallery_Storage channel not found. Please re-run setup.');
  saveStorageChannel(entity);
  return new Api.InputChannel({
    channelId: BigInt(entity.id.toString()),
    accessHash: BigInt(entity.accessHash?.toString() ?? '0'),
  });
}

/**
 * Looks for an existing "TeleGallery_Storage" channel in the user's dialogs.
 * Returns the channel entity or null if not found.
 */
async function findStorageChannel(): Promise<any | null> {
  const dialogs = await tgClient.getDialogs({ limit: 200 });
  for (const dialog of dialogs) {
    const entity = dialog.entity;
    if (
      entity &&
      (entity.className === 'Channel' || entity.className === 'Chat') &&
      entity.title === CHANNEL_TITLE
    ) {
      return entity;
    }
  }
  return null;
}

/**
 * Creates a new private channel and returns the entity.
 */
async function createStorageChannel(): Promise<any> {
  await loadGramJS();
  const result = await tgClient.invoke(
    new Api.channels.CreateChannel({
      title: CHANNEL_TITLE,
      about: CHANNEL_DESCRIPTION,
      megagroup: false,
      broadcast: true,
    })
  );
  const channel = result.chats[0];
  return channel;
}

/**
 * Posts the master index JSON as a message, then pins it.
 * Returns the message ID.
 */
async function writeMasterIndex(channelInput: any, index: MasterIndex): Promise<number> {
  await loadGramJS();
  // channelInput can be an InputChannel, entity object, or BigInt id
  // Normalise: get the live entity so we have a valid peer to send messages to
  let channel: any;
  if (channelInput && typeof channelInput === 'object' && channelInput.className === 'InputChannel') {
    const result = await tgClient.invoke(new Api.channels.GetChannels({ id: [channelInput] }));
    channel = result.chats[0];
  } else if (channelInput && typeof channelInput === 'object' && channelInput.id) {
    // Already a full entity
    channel = channelInput;
  } else {
    // BigInt id fallback Ã¢â‚¬â€ reconstruct via getStorageChannel
    const inputCh = await getStorageChannel();
    const result = await tgClient.invoke(new Api.channels.GetChannels({ id: [inputCh] }));
    channel = result.chats[0];
  }

  index.version = (index.version || 0) + 1;
  const jsonStr = JSON.stringify(index, null, 2);
  let msgId: number;

  try {
    await tgClient.invoke(new Api.messages.UnpinAllMessages({ peer: channel }));
  } catch (e) {
    console.warn('Could not unpin old messages', e);
  }

  if (jsonStr.length < 4000) {
    const text = `[TeleGallery Master Index]\n${jsonStr}`;
    const sendResult = await tgClient.sendMessage(channel, { message: text });
    msgId = sendResult.id;
  } else {
    const tmpFile = path.join(os.tmpdir(), 'master_index.json');
    await fs.writeFile(tmpFile, jsonStr);
    
    const sendResult = await tgClient.sendFile(channel, {
      file: tmpFile,
      caption: '[TeleGallery Master Index]',
      forceDocument: true
    });
    msgId = sendResult.id;
    await fs.unlink(tmpFile).catch(() => {});
  }

  await tgClient.invoke(
    new Api.channels.UpdatePinnedMessage({
      channel,
      id: msgId,
      silent: true,
    })
  );

  return msgId;
}

/**
 * Reads the pinned message from the channel and parses the master index JSON.
 * Returns null if no valid pinned index exists.
 */
async function readMasterIndex(channelEntity: any): Promise<MasterIndex | null> {
  try {
    const fullChannel = await tgClient.invoke(
      new Api.channels.GetFullChannel({ channel: channelEntity })
    );
    const pinnedMsgId: number | null = fullChannel.fullChat?.pinnedMsgId ?? null;
    if (!pinnedMsgId) return null;

    const msgs = await tgClient.invoke(
      new Api.channels.GetMessages({
        channel: channelEntity,
        id: [new Api.InputMessageID({ id: pinnedMsgId })],
      })
    );

    const msg = msgs.messages?.[0];
    if (!msg) return null;

    let text = '';

    if (msg.media && msg.media.className === 'MessageMediaDocument') {
      const buffer = await tgClient.downloadMedia(msg);
      if (buffer) {
        text = buffer.toString('utf-8');
      }
    } else if (msg.message) {
      text = msg.message;
      const jsonStart = text.indexOf('{');
      if (jsonStart !== -1) {
        text = text.slice(jsonStart);
      }
    }

    if (!text) return null;

    return JSON.parse(text) as MasterIndex;
  } catch (err) {
    console.error('[readMasterIndex]', err);
    return null;
  }
}

/**
 * Populates the local SQLite database from the master index.
 * Sends progress events as it goes.
 */
async function restoreFromIndex(index: MasterIndex): Promise<void> {
  const dbService = DatabaseService.getInstance();
  const db = dbService.db;
  const totalSteps = index.albums.length + 1; // albums + settings
  let step = 0;

  sendProgress(step, totalSteps, 0, 'Reading your libraryÃ¢â‚¬Â¦');
  await delay(300); // small pause so UI shows the first step

  // Restore settings
  db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('theme', ?)").run(
    index.settings.theme
  );
  db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('auto_sync', ?)").run(
    index.settings.auto_sync ? '1' : '0'
  );
  db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('total_photos', ?)").run(
    String(index.total_photos)
  );
  db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('last_synced', ?)").run(
    index.last_synced
  );
  step++;
  sendProgress(step, totalSteps, 0, 'Restoring settingsÃ¢â‚¬Â¦');
  await delay(200);

  // Restore albums
  const insertAlbum = db.prepare(`
    INSERT OR REPLACE INTO albums (id, name, cover_photo_id, created_at, updated_at)
    VALUES (@id, @name, @cover, @created_at, @updated_at)
  `);

  for (const album of index.albums) {
    insertAlbum.run({ 
      id: album.id, 
      name: album.name, 
      cover: album.cover ?? null, 
      created_at: Math.floor(Date.now() / 1000), 
      updated_at: Math.floor(Date.now() / 1000) 
    });
    step++;
    sendProgress(step, totalSteps, album.count, `Restoring album "${album.name}"Ã¢â‚¬Â¦`);
    await delay(150);
  }

  // Restore photo_albums mappings
  db.prepare('DELETE FROM photo_albums').run();
  if (index.photo_albums && index.photo_albums.length > 0) {
    const insertMapping = db.prepare('INSERT INTO photo_albums (photo_id, album_id) VALUES (?, ?)');
    for (const mapping of index.photo_albums) {
      try {
        insertMapping.run(mapping.photo_id, mapping.album_id);
      } catch (err) {
        console.warn('Failed to insert photo_album mapping', mapping, err);
      }
    }
  }

  sendProgress(totalSteps, totalSteps, index.total_photos, 'All done!');
  await delay(600); // let the user see 100% for a moment
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Window Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function createWindow() {
  // Remove default Electron menu (File, Edit, View, Window, Help)
  Menu.setApplicationMenu(null);

  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('[main] Preload path:', preloadPath);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b0f1a',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    titleBarStyle: 'default',
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    // Open DevTools in dev mode to diagnose renderer errors
    if (isDev) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    }
  });

  mainWindow.on('close', (e) => {
    if (!forceQuit) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  // Handle page load errors gracefully
  mainWindow.webContents.on('did-fail-load', (_e, errCode, errDesc, url) => {
    console.error(`[window] Failed to load ${url}: ${errCode} ${errDesc}`);
    // Retry after a short delay in dev mode
    if (isDev) {
      setTimeout(() => {
        const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
        mainWindow?.loadURL(devServerUrl).catch(() => {});
      }, 2000);
    }
  });

  // Fix 9: Block any attempt to open new browser windows — all navigation is in-app
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (isDev) {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../index.html'));
  }
}

function setupDatabase() {
  DatabaseService.getInstance().init();
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ App lifecycle Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

app.whenReady().then(() => {
  // Only apply strict CSP in production Ã¢â‚¬â€ in dev Vite needs to inject scripts
  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' thumb: data: blob: https:; connect-src 'self' https: ws: wss:;"]
        }
      });
    });
  }

  // Register thumb:// protocol handler â€” serves files ONLY from thumbcache directory
  protocol.handle('thumb', async (request) => {
    try {
      const url = new URL(request.url);
      const host = url.host; // 'local' for thumbs, 'video' for video files
      const filename = decodeURIComponent(url.pathname.replace(/^\//,''));
      const baseFilename = require('path').basename(filename);

      let cacheDir: string;
      if (host === 'video') {
        cacheDir = require('path').join(app.getPath('userData'), 'videocache');
      } else {
        cacheDir = require('path').join(app.getPath('userData'), 'thumbcache');
      }

      // Security: only serve files directly inside the cache dir (no path traversal)
      const absPath = require('path').resolve(cacheDir, baseFilename);
      if (!absPath.startsWith(cacheDir)) {
        return new Response('Forbidden', { status: 403 });
      }
      return net.fetch('file:///' + absPath.replace(/\\/g, '/'));
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  });

  setupDatabase();
  createWindow();
  autoDeleteTrash();
  updateSyncFolderWatcher();

  try {
    const iconPath = path.join(app.getAppPath(), 'build/icon.ico');
    const { statSync } = require('fs');
    const stat = statSync(iconPath, { throwIfNoEntry: false });
    if (stat && stat.size > 100) {
      tray = new Tray(iconPath);
    } else {
      throw new Error('icon.ico is missing or empty');
    }
    tray.setToolTip('TeleGallery');
    buildTrayMenu();
    tray.on('double-click', () => mainWindow?.show());
  } catch (e) {
    console.warn('Tray icon failed to load (icon.ico may be missing or invalid). Tray disabled.', e);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });
});

app.on('window-all-closed', () => {
  if (forceQuit && process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  if (fileWatcher) {
    await fileWatcher.close().catch(() => {});
    fileWatcher = null;
  }
  DatabaseService.getInstance().close();
  if (tgClient) {
    try { await tgClient.disconnect(); } catch { /* ignore */ }
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Fix 5: Auto-Sync Folder Watcher Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Watches user-configured folders with chokidar. Per-file 3-second debounce
// prevents duplicate queuing from rapid OS events (e.g. camera transfer bursts).
// Authorisation is checked before every upload to handle session expiry.

let fileWatcher: FSWatcher | null = null;
const pendingFiles = new Map<string, ReturnType<typeof setTimeout>>();

async function updateSyncFolderWatcher() {
  const syncFolders = (store.get('sync_folders', []) as string[]);
  const legacySyncFolder = store.get('sync_folder') as string | undefined;
  const autoSync = store.get('auto_sync_enabled') as boolean | undefined;
  const allFolders = Array.from(
    new Set([...syncFolders, ...(legacySyncFolder ? [legacySyncFolder] : [])])
  ).filter(Boolean);

  // Always tear down the existing watcher first
  if (fileWatcher) {
    await fileWatcher.close().catch(() => {});
    fileWatcher = null;
    pendingFiles.forEach(t => clearTimeout(t));
    pendingFiles.clear();
  }

  if (!autoSync || allFolders.length === 0) {
    console.log('[watcher] Auto-sync disabled or no folders Ã¢â‚¬â€ watcher stopped.');
    return;
  }

  const VALID_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.heic', '.mp4', '.mov', '.avi', '.mkv']);
  const DEBOUNCE_MS = 3000;

  const chokidar = await import('chokidar');
  fileWatcher = chokidar.watch(allFolders, {
    // Ignore dotfiles and the thumbcache directory to avoid feedback loops
    ignored: /(^|[/\\])(\.|thumbcache)/,
    persistent: true,
    ignoreInitial: true,   // don't re-upload files that already existed
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
  });

  fileWatcher.on('add', async (filePath: string) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!VALID_EXTS.has(ext)) return;

    // Debounce: reset timer if same path fires again within DEBOUNCE_MS
    const existingTimer = pendingFiles.get(filePath);
    if (existingTimer) clearTimeout(existingTimer);

    pendingFiles.set(filePath, setTimeout(async () => {
      pendingFiles.delete(filePath);
      try {
        // 1. Confirm file still exists
        const stats = await fs.stat(filePath).catch(() => null);
        if (!stats) return;

        // 2. Dedup by filename + size (already uploaded on a previous run)
        const db = DatabaseService.getInstance();
        const alreadyInDb = db.get<{ id: string }>(
          'SELECT id FROM photos WHERE filename = ? AND size_bytes = ?',
          path.basename(filePath), stats.size
        );
        if (alreadyInDb) return;

        // 3. Ensure live, authorised Telegram session
        if (!tgClient) {
          const savedSession = store.get(STORE_KEY_SESSION, '') as string;
          if (!savedSession) return;
          tgClient = await getTelegramClient(savedSession).catch(() => null);
          if (!tgClient) return;
        }
        const isAuthorized = await tgClient.isUserAuthorized().catch(() => false);
        if (!isAuthorized) {
          console.warn('[watcher] Session expired Ã¢â‚¬â€ skipping auto-upload of', filePath);
          return;
        }

        // 4. Queue via the same pipeline as the manual Upload button
        console.log('[watcher] Queuing auto-upload:', filePath);
        await runUploadQueue([filePath]);
      } catch (err) {
        console.error('[watcher] Error processing file:', filePath, err);
      }
    }, DEBOUNCE_MS));
  });

  fileWatcher.on('error', (err: any) => console.error('[watcher] Chokidar error:', err));
  console.log(`[watcher] Watching ${allFolders.length} folder(s):`, allFolders);

  // Initial scan: upload any files already in folders that aren't yet in the DB.
  // Delayed by 8s so the Telegram client has time to connect on app startup.
  setTimeout(async () => {
    const VALID_EXTS_INIT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.heic', '.mp4', '.mov', '.avi', '.mkv']);
    const db = DatabaseService.getInstance();
    const toUpload: string[] = [];

    const scanExisting = async (dir: string) => {
      let entries: import('fs').Dirent[];
      try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await scanExisting(fullPath);
        } else if (entry.isFile() && VALID_EXTS_INIT.has(path.extname(entry.name).toLowerCase())) {
          try {
            const stat = await fs.stat(fullPath);
            const exists = db.get<{ id: string }>(
              'SELECT id FROM photos WHERE filename = ? AND size_bytes = ?',
              path.basename(fullPath), stat.size
            );
            if (!exists) toUpload.push(fullPath);
          } catch { /* skip */ }
        }
      }
    };

    for (const folder of allFolders) {
      await scanExisting(folder).catch(e => console.warn('[watcher] Initial scan error:', folder, e));
    }

    if (toUpload.length > 0) {
      console.log(`[watcher] Initial scan found ${toUpload.length} unsynced file(s) â€” queuing upload`);
      // Ensure client is alive
      if (!tgClient) {
        const savedSession = store.get(STORE_KEY_SESSION, '') as string;
        if (savedSession) tgClient = await getTelegramClient(savedSession).catch(() => null);
      }
      if (tgClient) {
        const authorized = await tgClient.isUserAuthorized().catch(() => false);
        if (authorized) await runUploadQueue(toUpload);
      }
    } else {
      console.log('[watcher] Initial scan: all existing files already synced.');
    }
  }, 8000);
}
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬


// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Generic IPC Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

ipcMain.handle('get-setting', (_event, key: string) => store.get(key));
ipcMain.handle('set-setting', (_event, key: string, value: any) => {
  store.set(key, value);
  if (key === 'auto_sync_enabled' || key === 'sync_folder') {
    updateSyncFolderWatcher();
  }
});
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Telegram auth IPC Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

ipcMain.handle('tg-check-auth', async () => {
  try {
    let savedSession = store.get(STORE_KEY_SESSION, '') as string;
    if (!savedSession) return { authenticated: false };

    if (safeStorage.isEncryptionAvailable()) {
      try {
        savedSession = safeStorage.decryptString(Buffer.from(savedSession, 'base64'));
      } catch(e) {
         // Might be an old unencrypted session, try encrypting it now
         const encrypted = safeStorage.encryptString(savedSession);
         store.set(STORE_KEY_SESSION, encrypted.toString('base64'));
      }
    }

    tgClient = await getTelegramClient(savedSession);
    const isAuthorized = await tgClient.isUserAuthorized();
    if (!isAuthorized) {
      store.delete(STORE_KEY_SESSION);
      return { authenticated: false };
    }
    return { authenticated: true };
  } catch (err: any) {
    console.error('[tg-check-auth]', err);
    store.delete(STORE_KEY_SESSION);
    return { authenticated: false };
  }
});

ipcMain.handle('tg-send-phone-code', async (_event, phoneNumber: string) => {
  if (typeof phoneNumber !== 'string') return { error: 'Invalid input' };
  try {
    tgClient = await getTelegramClient('');
    const result = await tgClient.sendCode(
      { apiId: getApiCredentials().apiId, apiHash: getApiCredentials().apiHash },
      phoneNumber
    );
    return { phoneCodeHash: result.phoneCodeHash };
  } catch (err: any) {
    console.error('[tg-send-phone-code]', err);
    return { error: mapTelegramError(err) };
  }
});

ipcMain.handle(
  'tg-sign-in',
  async (_event, phoneNumber: string, phoneCodeHash: string, code: string) => {
    if (typeof phoneNumber !== 'string' || typeof phoneCodeHash !== 'string' || typeof code !== 'string') return { error: 'Invalid input' };
    try {
      if (!tgClient) return { error: 'Session expired. Please restart the login process.' };

      await loadGramJS();
      try {
        await tgClient.invoke(new Api.auth.SignIn({ phoneNumber, phoneCodeHash, phoneCode: code }));
      } catch (signInErr: any) {
        const msg: string = signInErr?.message ?? String(signInErr);
        if (msg.includes('SESSION_PASSWORD_NEEDED')) {
          // Account has 2FA Ã¢â‚¬â€ don't save session yet, tell renderer to ask for password
          return { needs2FA: true };
        }
        throw signInErr;
      }

      const sessionString = tgClient.session.save();
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(sessionString);
        store.set(STORE_KEY_SESSION, encrypted.toString('base64'));
      } else {
        store.set(STORE_KEY_SESSION, sessionString);
      }
      return { success: true };
    } catch (err: any) {
      console.error('[tg-sign-in]', err);
      return { error: mapTelegramError(err) };
    }
  }
);

ipcMain.handle('tg-sign-in-2fa', async (_event, password: string) => {
  if (typeof password !== 'string') return { error: 'Invalid input' };
  try {
    if (!tgClient) return { error: 'Session expired. Please restart the login process.' };
    await loadGramJS();

    // Get the 2FA password hint and SRP params
    const passwordInfo = await tgClient.invoke(new Api.account.GetPassword());
    const { computeCheck } = await import('telegram/Password');
    const passwordCheck = await computeCheck(passwordInfo, password);
    await tgClient.invoke(new Api.auth.CheckPassword({ password: passwordCheck }));

    const sessionString = tgClient.session.save();
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(sessionString);
      store.set(STORE_KEY_SESSION, encrypted.toString('base64'));
    } else {
      store.set(STORE_KEY_SESSION, sessionString);
    }
    return { success: true };
  } catch (err: any) {
    console.error('[tg-sign-in-2fa]', err);
    const msg: string = err?.message ?? String(err);
    if (msg.includes('PASSWORD_HASH_INVALID')) {
      return { error: 'Incorrect password. Please try again.' };
    }
    return { error: mapTelegramError(err) };
  }
});

ipcMain.handle('tg-sign-out', async () => {
  // Helper: wipe all account-specific local data
  const clearLocalData = async () => {
    store.delete(STORE_KEY_SESSION);
    store.delete(STORE_KEY_CHANNEL);      // clear stale channel so next login starts fresh
    store.delete(STORE_KEY_CHANNEL_ID);   // legacy key
    store.delete('sync_folders');
    store.delete('sync_folder');
    store.delete('auto_sync_enabled');
    store.delete('pin_hash');

    // Wipe all photo/album data from local SQLite
    try {
      const db = DatabaseService.getInstance().db;
      db.prepare('DELETE FROM photos').run();
      db.prepare('DELETE FROM albums').run();
      db.prepare('DELETE FROM photo_albums').run();
      db.prepare('DELETE FROM sync_state').run();
    } catch (dbErr) {
      console.warn('[tg-sign-out] Could not clear DB:', dbErr);
    }

    // Delete local thumbnail cache
    const thumbCacheDir = path.join(app.getPath('userData'), 'thumbcache');
    await fs.rm(thumbCacheDir, { recursive: true, force: true }).catch(() => {});
  };

  try {
    // Stop folder watcher
    if (fileWatcher) {
      await fileWatcher.close().catch(() => {});
      fileWatcher = null;
      pendingFiles.forEach(t => clearTimeout(t));
      pendingFiles.clear();
    }

    if (tgClient) {
      await loadGramJS();
      await tgClient.invoke(new Api.auth.LogOut());
      await tgClient.disconnect();
      tgClient = null;
    }
    await clearLocalData();
    return { success: true };
  } catch (err: any) {
    console.error('[tg-sign-out]', err);
    tgClient = null;
    await clearLocalData();
    return { success: true };
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Storage setup IPC Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

/**
 * tg-setup-storage
 *
 * Called immediately after a successful login (or on every app launch when
 * the user is already authenticated).  Finds or creates the private storage
 * channel, pins the master index, and Ã¢â‚¬â€ when restoring Ã¢â‚¬â€ streams progress
 * events back to the renderer via 'tg-restore-progress'.
 *
 * Returns:
 *   { status: 'created' | 'restored', channelId: string }  on success
 *   { error: string }                                       on failure
 */
ipcMain.handle('tg-setup-storage', async () => {
  try {
    if (!tgClient) {
      // Re-connect using saved session (called from AuthGuard on subsequent launches)
      const savedSession = store.get(STORE_KEY_SESSION, '') as string;
      if (!savedSession) return { error: 'Not authenticated.' };
      tgClient = await getTelegramClient(savedSession);
    }

    await loadGramJS();

    sendProgress(0, 4, 0, 'Looking for your storage channelÃ¢â‚¬Â¦');
    await delay(300);

    let channel = await findStorageChannel();
    let channelIdStr: string;

    if (!channel) {
      // Ã¢â€â‚¬Ã¢â€â‚¬ First-ever launch: create channel Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
      sendProgress(1, 4, 0, 'Creating private storage channelÃ¢â‚¬Â¦');
      await delay(200);

      channel = await createStorageChannel();
      channelIdStr = channel.id.toString();
      saveStorageChannel(channel); // persists id + accessHash

      sendProgress(2, 4, 0, 'Writing master indexÃ¢â‚¬Â¦');
      await delay(200);

      const index = buildFreshIndex();
      await writeMasterIndex(channel, index); // pass full entity

      sendProgress(4, 4, 0, 'Storage ready!');
      await delay(400);

      return { status: 'created', channelId: channelIdStr };
    } else {
      // Ã¢â€â‚¬Ã¢â€â‚¬ Returning user / device switch: read & restore Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
      channelIdStr = channel.id.toString();
      saveStorageChannel(channel); // always refresh persisted hash

      sendProgress(1, 4, 0, 'Found your channel. Reading indexÃ¢â‚¬Â¦');
      await delay(200);

      const index = await readMasterIndex(channel);

      if (!index) {
        // Channel exists but no pinned index Ã¢â‚¬â€ write a fresh one
        const freshIndex = buildFreshIndex();
        await writeMasterIndex(channel, freshIndex);
        sendProgress(4, 4, 0, 'Storage ready!');
        await delay(400);
        return { status: 'created', channelId: channelIdStr };
      }

      sendProgress(2, 4, index.total_photos, 'Restoring your libraryÃ¢â‚¬Â¦');
      await delay(200);

      await restoreFromIndex(index);

      return { status: 'restored', channelId: channelIdStr };
    }
  } catch (err: any) {
    console.error('[tg-setup-storage]', err);
    return { error: mapTelegramError(err) };
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Data Access IPC Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

ipcMain.handle('tg-get-photos', () => {
  try {
    const rows = DatabaseService.getInstance().all(
      'SELECT * FROM photos WHERE is_deleted = 0 ORDER BY date_taken DESC'
    ) as any[];
    return rows.map(row => ({
      ...row,
      thumb_url: row.local_thumb_path
        ? 'thumb://local/' + encodeURIComponent(require('path').basename(row.local_thumb_path))
        : null,
      date_taken_iso: new Date(row.date_taken * 1000).toISOString(),
    }));
  } catch (err) {
    console.error('Error fetching photos:', err);
    return [];
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ File Upload IPC Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

ipcMain.handle('tg-select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Media', extensions: ['jpg', 'jpeg', 'png', 'gif', 'mp4', 'mov', 'heic'] }
    ]
  });
  return result.filePaths;
});

// Fix 7: Global upload queue so concurrent uploads don't get dropped
let uploadQueueRunning = false;
const pendingUploadPaths: string[] = [];

ipcMain.handle('tg-upload-files', async (_event, filePaths: string[]) => {
  try {
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      return { error: 'No files provided' };
    }
    // Normalize paths for Windows (handles mixed slashes)
    const normalized = filePaths.map(p => path.normalize(p));

    if (uploadQueueRunning) {
      // Queue new uploads instead of ignoring
      pendingUploadPaths.push(...normalized);
      return { success: true, queued: true };
    }

    // Connection check before upload
    if (!tgClient) {
      const savedSession = store.get(STORE_KEY_SESSION, '') as string;
      if (!savedSession) return { error: 'Not authenticated' };
      tgClient = await getTelegramClient(savedSession);
    }
    try {
      const authorized = await tgClient.isUserAuthorized();
      if (!authorized) {
        store.delete(STORE_KEY_SESSION);
        return { error: 'Session expired. Please log in again.' };
      }
    } catch {
      // Reconnect
      const savedSession = store.get(STORE_KEY_SESSION, '') as string;
      if (savedSession) tgClient = await getTelegramClient(savedSession).catch(() => null);
      if (!tgClient) return { error: 'Could not connect to Telegram' };
    }

    uploadQueueRunning = true;
    runUploadQueue(normalized).catch(err => {
      console.error('[upload] Queue error:', err);
    }).finally(() => {
      uploadQueueRunning = false;
      // Drain pending
      if (pendingUploadPaths.length > 0) {
        const next = pendingUploadPaths.splice(0);
        ipcMain.emit('internal-upload', null, next);
      }
    });
    return { success: true };
  } catch (err: any) {
    console.error('[tg-upload-files]', err);
    mainWindow?.webContents.send('tg-upload-error', { error: err.message });
    return { error: err.message };
  }
});

// Internal handler for draining the pending queue
ipcMain.on('internal-upload', (_event, filePaths: string[]) => {
  uploadQueueRunning = true;
  runUploadQueue(filePaths).catch(err => {
    console.error('[upload] Queue drain error:', err);
  }).finally(() => {
    uploadQueueRunning = false;
    if (pendingUploadPaths.length > 0) {
      const next = pendingUploadPaths.splice(0);
      ipcMain.emit('internal-upload', null, next);
    }
  });
});


// Used to notify UI of upload progress
function sendUploadProgress(fileId: string, status: string, progress: number, speed: string = '', filename: string = '') {
  mainWindow?.webContents.send('tg-upload-progress', { fileId, status, progress, speed, filename });
}

async function runUploadQueue(filePaths: string[]) {
  await loadGramJS();

  let channelEntity: any;
  try {
    const inputCh = await getStorageChannel();
    const result = await tgClient.invoke(new Api.channels.GetChannels({ id: [inputCh] }));
    channelEntity = result.chats[0];
  } catch (err: any) {
    mainWindow?.webContents.send('tg-upload-error', { error: 'Could not reach storage channel: ' + err.message });
    return;
  }

  // Read current index once at the start
  let masterIndex = await readMasterIndex(channelEntity);
  if (!masterIndex) masterIndex = buildFreshIndex();

  const queue = [...filePaths];
  const maxConcurrent = 2;
  let activeCount = 0;

  return new Promise<void>((resolve) => {
    const checkQueue = async () => {
      if (queue.length === 0 && activeCount === 0) {
        masterIndex!.last_synced = new Date().toISOString();
        await writeMasterIndex(channelEntity, masterIndex!).catch(err =>
          console.error('[upload] Could not update master index:', err)
        );
        mainWindow?.webContents.send('tg-upload-complete');
        resolve();
        return;
      }

      while (queue.length > 0 && activeCount < maxConcurrent) {
        const filePath = queue.shift()!;
        activeCount++;

        processAndUploadFile(filePath, channelEntity, masterIndex!)
          .then(() => { activeCount--; checkQueue(); })
          .catch((err) => {
            console.error(`[upload] Failed for ${filePath}:`, err);
            const fileId = path.basename(filePath);
            sendUploadProgress(fileId, 'Error', 0);
            mainWindow?.webContents.send('tg-upload-file-error', {
              fileId,
              filePath,
              error: err.message,
            });
            activeCount--;
            checkQueue();
          });

        await delay(1000);
      }
    };

    checkQueue();
  });
}

// Keep startUploadQueue as alias for watcher compatibility
const startUploadQueue = runUploadQueue;


async function processAndUploadFile(filePath: string, channelEntity: any, index: MasterIndex) {
  const fileId = crypto.randomUUID();
  const fileName = path.basename(filePath);
  sendUploadProgress(fileId, 'Processing', 0, '', fileName);

  try {
    const stat = await fs.stat(filePath);
    let width = 0;
    let height = 0;
    let exifDateUnix = 0; // Will be set from EXIF if available

    // a. Generate Thumbnail and save to persistent thumbcache (NOT uploaded to Telegram)
    const thumbCacheDir = path.join(app.getPath('userData'), 'thumbcache');
    await fs.mkdir(thumbCacheDir, { recursive: true });
    const localThumbPath = path.join(thumbCacheDir, `${fileId}.jpg`);

    try {
      const metadata = await sharp(filePath).metadata();
      width = metadata.width || 0;
      height = metadata.height || 0;

      // Extract EXIF DateTimeOriginal for accurate capture date
      // sharp exposes raw EXIF data; parse the DateTimeOriginal tag if present
      if (metadata.exif) {
        try {
          // Parse EXIF buffer manually: look for DateTimeOriginal (0x9003) tag
          // Format: 'YYYY:MM:DD HH:MM:SS'
          const exifStr = metadata.exif.toString('binary');
          const dtMatch = exifStr.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
          if (dtMatch) {
            const [, yr, mo, dy, hh, mm, ss] = dtMatch;
            const exifDate = new Date(`${yr}-${mo}-${dy}T${hh}:${mm}:${ss}`);
            if (!isNaN(exifDate.getTime()) && exifDate.getTime() < Date.now()) {
              exifDateUnix = Math.floor(exifDate.getTime() / 1000);
            }
          }
        } catch { /* ignore EXIF parse errors */ }
      }

      await sharp(filePath)
        .resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(localThumbPath);
    } catch (e) {
      console.warn(`Could not generate thumb for ${filePath}`, e);
      // Fallback: use original as thumb
      await fs.copyFile(filePath, localThumbPath).catch(() => {});
    }

    // b. Upload ONLY the original file to Telegram (no separate thumb upload = no double message)
    sendUploadProgress(fileId, 'Uploading', 20, '', fileName);
    const originalUploadResult = await uploadWithRetry(channelEntity, filePath, (progress: number) => {
      sendUploadProgress(fileId, 'Uploading', 20 + (progress * 0.8), '', fileName);
    });

    // c. Build metadata for master index
    // Date priority: EXIF DateTimeOriginal > file birthtime (creation) > file mtime (last modified)
    // Always clamp to now to handle corrupted future timestamps
    const nowUnix = Math.floor(Date.now() / 1000);
    let dateTakenUnix: number;
    if (exifDateUnix > 0) {
      dateTakenUnix = Math.min(exifDateUnix, nowUnix);
    } else {
      // Prefer birthtime (original creation) over mtime (last-modified / copy time)
      const birthtimeUnix = Math.floor((stat.birthtimeMs || stat.mtimeMs) / 1000);
      const mtimeUnix = Math.floor(stat.mtime.getTime() / 1000);
      // Use the earlier of birthtime/mtime (the actual older date), clamped to now
      dateTakenUnix = Math.min(Math.min(birthtimeUnix, mtimeUnix), nowUnix);
    }
    const photoMeta = {
      id: fileId,
      filename: fileName,
      date_taken: new Date(dateTakenUnix * 1000).toISOString(),
      date_uploaded: new Date().toISOString(),
      file_id: originalUploadResult.id.toString(),
      thumb_file_id: '',
      size_bytes: stat.size,
      width,
      height,
      album_ids: '[]',
      is_favorite: 0,
      is_deleted: 0
    };

    // d. Save to local SQLite (including local_thumb_path)
    const dbService = DatabaseService.getInstance();
    dbService.db.prepare(`
      INSERT INTO photos (
        id, telegram_message_id, file_id, thumb_file_id, filename, size_bytes,
        width, height, date_taken, date_uploaded, is_favorite, is_deleted, deleted_at, local_thumb_path
      ) VALUES (
        @id, @telegram_message_id, @file_id, @thumb_file_id, @filename, @size_bytes,
        @width, @height, @date_taken, @date_uploaded, @is_favorite, @is_deleted, @deleted_at, @local_thumb_path
      )
    `).run({
      id: fileId,
      telegram_message_id: originalUploadResult.id,
      file_id: originalUploadResult.id.toString(),
      thumb_file_id: '',
      filename: fileName,
      size_bytes: stat.size,
      width,
      height,
      date_taken: dateTakenUnix,
      date_uploaded: Math.floor(Date.now() / 1000),
      is_favorite: 0,
      is_deleted: 0,
      deleted_at: null,
      local_thumb_path: localThumbPath,
    });

    // e. Append to Master Index (metadata only, no extra Telegram messages)
    index.total_photos += 1;
    index.photos = index.photos || [];
    index.photos.push(photoMeta);

    sendUploadProgress(fileId, 'Done', 100, '', fileName);
    // Emit new photo data so gallery refreshes immediately
    mainWindow?.webContents.send('tg-upload-complete');
    notifySync(1);

  } catch (error) {
    sendUploadProgress(fileId, 'Error', 0);
    throw error;
  }
}

async function uploadWithRetry(channelEntity: any, filePath: string, onProgress: (progress: number) => void): Promise<any> {
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      // Use CustomFile for upload
      const { CustomFile } = require('telegram/client/uploads');
      const fileBuffer = await fs.readFile(filePath);
      const toUpload = new CustomFile(path.basename(filePath), fileBuffer.length, filePath, fileBuffer);
      
      const result = await tgClient.sendFile(channelEntity, {
        file: toUpload,
        workers: 1,
        progressCallback: (progress: number) => {
          onProgress(progress * 100);
        }
      });
      return result;
    } catch (e: any) {
      attempt++;
      console.warn(`Upload attempt ${attempt} failed for ${filePath}:`, e);
      if (e.message?.includes('FLOOD_WAIT')) {
        const waitMatch = e.message.match(/FLOOD_WAIT_(\d+)/);
        const waitTime = waitMatch ? parseInt(waitMatch[1], 10) * 1000 : 5000;
        await delay(waitTime);
      } else {
        await delay(2000);
      }
      if (attempt === maxRetries) throw e;
    }
  }
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Synchronization IPC Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”

ipcMain.handle('tg-sync', async () => {
  // Step 1: Scan sync folders and upload any local files NOT yet in the DB
  const syncFolders = (store.get('sync_folders', []) as string[]);
  const legacySyncFolder = store.get('sync_folder') as string | undefined;
  const allSyncFolders = Array.from(new Set([...syncFolders, ...(legacySyncFolder ? [legacySyncFolder] : [])])).filter(Boolean);

  if (allSyncFolders.length > 0) {
    sendSyncProgress('Scanning sync foldersâ€¦', 5);
    const VALID_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.heic', '.mp4', '.mov', '.avi', '.mkv']);
    const db = DatabaseService.getInstance();
    const unsynced: string[] = [];

    for (const folder of allSyncFolders) {
      try {
        // Recursively read the folder
        const scanDir = async (dir: string) => {
          let entries: import('fs').Dirent[];
          try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              await scanDir(fullPath);
            } else if (entry.isFile() && VALID_EXTS.has(path.extname(entry.name).toLowerCase())) {
              try {
                const stat = await fs.stat(fullPath);
                const existing = db.get<{ id: string }>(
                  'SELECT id FROM photos WHERE filename = ? AND size_bytes = ?',
                  path.basename(fullPath), stat.size
                );
                if (!existing) unsynced.push(fullPath);
              } catch { /* skip unreadable files */ }
            }
          }
        };
        await scanDir(folder);
      } catch (e) {
        console.warn('[sync] Could not scan folder:', folder, e);
      }
    }

    if (unsynced.length > 0) {
      sendSyncProgress(`Uploading ${unsynced.length} new file(s)â€¦`, 10);
      // Re-use the upload pipeline (does Telegram auth check internally)
      try {
        // Ensure Telegram client is alive before upload
        if (!tgClient) {
          const savedSession = store.get(STORE_KEY_SESSION, '') as string;
          if (savedSession) tgClient = await getTelegramClient(savedSession).catch(() => null);
        }
        if (tgClient) {
          await runUploadQueue(unsynced);
        }
      } catch (e) {
        console.error('[sync] Upload during sync failed:', e);
      }
    } else {
      sendSyncProgress('All local files already synced', 15);
    }
  }

  // Step 2: Pull master index from Telegram and update local DB
  return await syncFromTelegram();
});

function sendSyncProgress(status: string, progress: number) {
  mainWindow?.webContents.send('tg-sync-progress', { status, progress });
}

async function syncFromTelegram() {
  if (!DatabaseService.getInstance().db) return { success: false, error: 'DB not initialized' };

  // Re-connect client if it is not alive (e.g. called from background auto-sync)
  if (!tgClient) {
    const savedSession = store.get(STORE_KEY_SESSION, '') as string;
    if (!savedSession) return { success: false, error: 'Not authenticated' };
    try {
      tgClient = await getTelegramClient(savedSession);
      const ok = await tgClient.isUserAuthorized();
      if (!ok) return { success: false, error: 'Session expired' };
    } catch (e: any) {
      return { success: false, error: 'Could not connect: ' + e.message };
    }
  }

  // Check that the channel has been set up (uses the current STORE_KEY_CHANNEL JSON key)
  const rawChannel = store.get(STORE_KEY_CHANNEL) as string | undefined;
  if (!rawChannel) return { success: false, error: 'No channel set up. Please complete setup first.' };

  try {
    sendSyncProgress('Connecting to Telegramâ€¦', 0);
    await loadGramJS();
    const inputCh = await getStorageChannel();
    const result = await tgClient.invoke(new Api.channels.GetChannels({ id: [inputCh] }));
    const channelEntity = result.chats[0];

    sendSyncProgress('Reading master indexÃ¢â‚¬Â¦', 10);
    const masterIndex = await readMasterIndex(channelEntity);
    
    if (!masterIndex) {
      sendSyncProgress('No index found to sync', 100);
      return { success: true, message: 'No index found to sync.' };
    }

    const db = DatabaseService.getInstance().db;
    const localVersionRow = db.prepare("SELECT value FROM sync_state WHERE key = 'version'").get() as { value: string } | undefined;
    const localVersion = localVersionRow ? parseInt(localVersionRow.value, 10) : 0;

    if (masterIndex.version <= localVersion) {
      sendSyncProgress('Already up to date', 100);
      return { success: true, message: 'Up to date' };
    }

    sendSyncProgress('Syncing metadataÃ¢â‚¬Â¦', 30);
    
    // Sync settings & albums via existing restore logic but quietly
    db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('theme', ?)").run(masterIndex.settings.theme);
    db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('auto_sync', ?)").run(masterIndex.settings.auto_sync ? '1' : '0');
    db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('total_photos', ?)").run(String(masterIndex.total_photos));
    db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('last_synced', ?)").run(masterIndex.last_synced);

    const insertAlbum = db.prepare(`
      INSERT OR REPLACE INTO albums (id, name, cover_photo_id, created_at, updated_at)
      VALUES (@id, @name, @cover, @created_at, @updated_at)
    `);
    for (const album of masterIndex.albums) {
      insertAlbum.run({ 
        id: album.id, 
        name: album.name, 
        cover: album.cover ?? null,
        created_at: Math.floor(Date.now() / 1000), 
        updated_at: Math.floor(Date.now() / 1000) 
      });
    }

    db.prepare('DELETE FROM photo_albums').run();
    if (masterIndex.photo_albums && masterIndex.photo_albums.length > 0) {
      const insertMapping = db.prepare('INSERT INTO photo_albums (photo_id, album_id) VALUES (?, ?)');
      for (const mapping of masterIndex.photo_albums) {
        try {
          insertMapping.run(mapping.photo_id, mapping.album_id);
        } catch (err) {
          console.warn('Failed to insert photo_album mapping during sync', mapping, err);
        }
      }
    }
    
    // Sync photos
    sendSyncProgress('Syncing photosÃ¢â‚¬Â¦', 50);
    if (masterIndex.photos && masterIndex.photos.length > 0) {
      const existingPhotos = new Set(
        (db.prepare('SELECT id FROM photos').all() as { id: string }[]).map(r => r.id)
      );

      const insertPhoto = db.prepare(`
        INSERT INTO photos (
          id, telegram_message_id, file_id, thumb_file_id, filename, size_bytes, 
          width, height, date_taken, date_uploaded, is_favorite, is_deleted, deleted_at
        ) VALUES (
          @id, @telegram_message_id, @file_id, @thumb_file_id, @filename, @size_bytes,
          @width, @height, @date_taken, @date_uploaded, @is_favorite, @is_deleted, @deleted_at
        )
      `);

      let added = 0;
      for (let i = 0; i < masterIndex.photos.length; i++) {
        const photo = masterIndex.photos[i];
        if (!existingPhotos.has(photo.id)) {
          insertPhoto.run({
            id: photo.id,
            telegram_message_id: parseInt(photo.file_id) || 0,
            file_id: photo.file_id,
            thumb_file_id: photo.thumb_file_id || '',
            filename: photo.filename,
            size_bytes: photo.size_bytes || 0,
            width: photo.width || 0,
            height: photo.height || 0,
            date_taken: (() => {
              const raw = photo.date_taken;
              if (!raw) return Math.floor(Date.now() / 1000);
              if (typeof raw === 'number') return raw; // already unix seconds
              const parsed = new Date(raw).getTime();
              if (isNaN(parsed)) return Math.floor(Date.now() / 1000);
              // If the ISO string parses to a very large ms value, convert to seconds
              return Math.floor(parsed / 1000);
            })(),
            date_uploaded: (() => {
              const raw = photo.date_uploaded;
              if (!raw) return Math.floor(Date.now() / 1000);
              if (typeof raw === 'number') return raw;
              const parsed = new Date(raw).getTime();
              return isNaN(parsed) ? Math.floor(Date.now() / 1000) : Math.floor(parsed / 1000);
            })(),
            is_favorite: photo.is_favorite ? 1 : 0,
            is_deleted: photo.is_deleted ? 1 : 0,
            deleted_at: photo.deleted_at || null
          });
          added++;
        } else {
          db.prepare('UPDATE photos SET is_favorite = ?, is_deleted = ?, deleted_at = ? WHERE id = ?').run(
            photo.is_favorite ? 1 : 0,
            photo.is_deleted ? 1 : 0,
            photo.deleted_at || null,
            photo.id
          );
        }
        if (i % 100 === 0) {
          sendSyncProgress(`Synced ${i} photosÃ¢â‚¬Â¦`, 50 + Math.floor((i / masterIndex.photos.length) * 40));
        }
      }
      console.log(`Synced ${added} missing photos from Master Index.`);
    }

    db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('version', ?)").run(String(masterIndex.version));
    
    sendSyncProgress('Sync complete', 100);
    return { success: true };
  } catch (err: any) {
    console.error('Sync failed:', err);
    sendSyncProgress('Sync failed', 100);
    return { success: false, error: err.message };
  }
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Albums IPC Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

async function updateMasterIndexAlbums(updater: (index: MasterIndex) => void) {
  await loadGramJS();
  const inputCh = await getStorageChannel();
  const result = await tgClient.invoke(new Api.channels.GetChannels({ id: [inputCh] }));
  const channelEntity = result.chats[0];
  let masterIndex = await readMasterIndex(channelEntity);
  if (!masterIndex) masterIndex = buildFreshIndex();
  if (!masterIndex.photo_albums) masterIndex.photo_albums = [];

  updater(masterIndex);
  
  masterIndex.last_synced = new Date().toISOString();
  await writeMasterIndex(channelEntity, masterIndex);
}

ipcMain.handle('tg-get-albums', () => {
  try {
    const db = DatabaseService.getInstance().db;
    const rows = db.prepare(`
      SELECT 
        a.id, a.name, a.cover_photo_id, a.created_at, a.updated_at,
        COUNT(pa.photo_id) as photo_count,
        p.local_thumb_path as cover_local_thumb
      FROM albums a
      LEFT JOIN photo_albums pa ON a.id = pa.album_id
      LEFT JOIN photos p ON a.cover_photo_id = p.id
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `).all();
    return (rows as any[]).map(row => ({
      ...row,
      cover_thumb_url: row.cover_local_thumb
        ? 'thumb://local/' + encodeURIComponent(require('path').basename(row.cover_local_thumb))
        : null,
    }));
  } catch (err) {
    console.error('Error fetching albums:', err);
    return [];
  }
});

ipcMain.handle('tg-create-album', async (_event, name: string) => {
  try {
    if (typeof name !== 'string' || !name.trim()) return { success: false, error: 'Invalid name' };
    const trimmedName = name.trim();
    const id = crypto.randomUUID();
    const db = DatabaseService.getInstance().db;
    const now = Math.floor(Date.now() / 1000);

    // Server-side dedup: reject if same name was created within the last 5 seconds
    // Catches rapid-fire IPC calls that slip past the UI isSubmitting guard
    const recentDuplicate = db.prepare(
      'SELECT id FROM albums WHERE name = ? AND created_at >= ?'
    ).get(trimmedName, now - 5) as { id: string } | undefined;
    if (recentDuplicate) {
      console.warn('[tg-create-album] Dedup: returning existing album', recentDuplicate.id);
      return { success: true, albumId: recentDuplicate.id };
    }
    
    db.prepare('INSERT INTO albums (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(id, trimmedName, now, now);

    await updateMasterIndexAlbums((index) => {
      index.albums.push({ id, name: trimmedName, count: 0 });
    });
    
    return { success: true, albumId: id };
  } catch (err: any) {
    console.error('Error creating album:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('tg-rename-album', async (_event, id: string, name: string) => {
  try {
    const db = DatabaseService.getInstance().db;
    const now = Math.floor(Date.now() / 1000);
    
    db.prepare('UPDATE albums SET name = ?, updated_at = ? WHERE id = ?').run(name, now, id);

    await updateMasterIndexAlbums((index) => {
      const album = index.albums.find(a => a.id === id);
      if (album) album.name = name;
    });
    
    return { success: true };
  } catch (err: any) {
    console.error('Error renaming album:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('tg-delete-album', async (_event, id: string) => {
  try {
    const db = DatabaseService.getInstance().db;
    db.transaction(() => {
      db.prepare('DELETE FROM photo_albums WHERE album_id = ?').run(id);
      db.prepare('DELETE FROM albums WHERE id = ?').run(id);
    })();

    await updateMasterIndexAlbums((index) => {
      index.albums = index.albums.filter(a => a.id !== id);
      index.photo_albums = index.photo_albums.filter(pa => pa.album_id !== id);
    });
    
    return { success: true };
  } catch (err: any) {
    console.error('Error deleting album:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('tg-get-album-photos', (_event, albumId: string) => {
  try {
    const db = DatabaseService.getInstance().db;
    const rows = db.prepare(`
      SELECT p.* 
      FROM photos p
      INNER JOIN photo_albums pa ON p.id = pa.photo_id
      WHERE pa.album_id = ? AND p.is_deleted = 0
      ORDER BY p.date_taken DESC
    `).all(albumId);
    return rows;
  } catch (err) {
    console.error('Error fetching album photos:', err);
    return [];
  }
});

ipcMain.handle('tg-add-photos-to-album', async (_event, albumId: string, photoIds: string[]) => {
  try {
    const db = DatabaseService.getInstance().db;
    const insertMapping = db.prepare('INSERT OR IGNORE INTO photo_albums (photo_id, album_id) VALUES (?, ?)');
    
    db.transaction(() => {
      for (const pid of photoIds) {
        insertMapping.run(pid, albumId);
      }
    })();

    await updateMasterIndexAlbums((index) => {
      const album = index.albums.find(a => a.id === albumId);
      for (const pid of photoIds) {
        if (!index.photo_albums.some(pa => pa.photo_id === pid && pa.album_id === albumId)) {
          index.photo_albums.push({ photo_id: pid, album_id: albumId });
          if (album) album.count = (album.count || 0) + 1;
        }
      }
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error adding photos to album:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('tg-remove-photos-from-album', async (_event, albumId: string, photoIds: string[]) => {
  try {
    const db = DatabaseService.getInstance().db;
    const deleteMapping = db.prepare('DELETE FROM photo_albums WHERE photo_id = ? AND album_id = ?');
    
    db.transaction(() => {
      for (const pid of photoIds) {
        deleteMapping.run(pid, albumId);
      }
    })();

    await updateMasterIndexAlbums((index) => {
      const album = index.albums.find(a => a.id === albumId);
      for (const pid of photoIds) {
        const initialLen = index.photo_albums.length;
        index.photo_albums = index.photo_albums.filter(pa => !(pa.photo_id === pid && pa.album_id === albumId));
        if (index.photo_albums.length < initialLen && album && album.count > 0) {
          album.count -= 1;
        }
      }
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error removing photos from album:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('tg-set-album-cover', async (_event, albumId: string, photoId: string) => {
  try {
    const db = DatabaseService.getInstance().db;
    db.prepare('UPDATE albums SET cover_photo_id = ? WHERE id = ?').run(photoId, albumId);

    await updateMasterIndexAlbums((index) => {
      const album = index.albums.find(a => a.id === albumId);
      if (album) album.cover = photoId;
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error setting album cover:', err);
    return { success: false, error: err.message };
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Trash & Favorites Auto-delete and IPC Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

async function autoDeleteTrash() {
  try {
    const db = DatabaseService.getInstance().db;
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
    
    const photosToDelete = db.prepare('SELECT id FROM photos WHERE is_deleted = 1 AND deleted_at < ?').all(thirtyDaysAgo) as { id: string }[];
    if (photosToDelete.length > 0) {
      console.log(`Auto-deleting ${photosToDelete.length} photos from trash...`);
      const photoIds = photosToDelete.map(p => p.id);
      
      await loadGramJS();
      const inputCh = await getStorageChannel().catch(() => null);
      if (!inputCh) return;
      const result = await tgClient.invoke(new Api.channels.GetChannels({ id: [inputCh] }));
      const channelEntity = result.chats[0];

      let masterIndex = await readMasterIndex(channelEntity);
      if (!masterIndex) return;

      const photosToDeleteMeta = masterIndex.photos.filter(p => photoIds.includes(p.id));
      const messageIdsToDelete = photosToDeleteMeta.flatMap(p => {
        const ids = [parseInt(p.file_id)];
        if (p.thumb_file_id) ids.push(parseInt(p.thumb_file_id));
        return ids.filter(id => !isNaN(id));
      });

      if (messageIdsToDelete.length > 0) {
        await tgClient.invoke(new Api.channels.DeleteMessages({
          channel: channelEntity,
          id: messageIdsToDelete
        }));
      }

      masterIndex.photos = masterIndex.photos.filter(p => !photoIds.includes(p.id));
      if (masterIndex.photo_albums) {
        masterIndex.photo_albums = masterIndex.photo_albums.filter(pa => !photoIds.includes(pa.photo_id));
      }
      masterIndex.total_photos = masterIndex.photos.length;
      masterIndex.last_synced = new Date().toISOString();

      await writeMasterIndex(channelEntity, masterIndex);

      db.transaction(() => {
        const delPhoto = db.prepare('DELETE FROM photos WHERE id = ?');
        const delPhotoAlbums = db.prepare('DELETE FROM photo_albums WHERE photo_id = ?');
        for (const pid of photoIds) {
          delPhoto.run(pid);
          delPhotoAlbums.run(pid);
        }
      })();
      console.log('Auto-delete completed.');
    }
  } catch (err) {
    console.error('Auto-delete failed:', err);
  }
}

ipcMain.handle('tg-get-favorites', () => {
  try {
    const rows = DatabaseService.getInstance().all(
      'SELECT * FROM photos WHERE is_deleted = 0 AND is_favorite = 1 ORDER BY date_taken DESC'
    ) as any[];
    return rows.map(row => ({
      ...row,
      thumb_url: row.local_thumb_path
        ? 'thumb://local/' + encodeURIComponent(require('path').basename(row.local_thumb_path))
        : null,
      date_taken_iso: new Date(row.date_taken * 1000).toISOString(),
    }));
  } catch (err) {
    console.error('Error fetching favorites:', err);
    return [];
  }
});

ipcMain.handle('tg-get-trash', () => {
  try {
    const rows = DatabaseService.getInstance().all(
      'SELECT * FROM photos WHERE is_deleted = 1 ORDER BY deleted_at DESC'
    ) as any[];
    return rows.map(row => ({
      ...row,
      thumb_url: row.local_thumb_path
        ? 'thumb://local/' + encodeURIComponent(require('path').basename(row.local_thumb_path))
        : null,
      date_taken_iso: new Date(row.date_taken * 1000).toISOString(),
    }));
  } catch (err) {
    console.error('Error fetching trash:', err);
    return [];
  }
});

// We need a wrapper to update just the photos without messing with albums, or reuse updateMasterIndexAlbums concept for photos
async function updateMasterIndexPhotos(updater: (index: MasterIndex) => void) {
  await loadGramJS();
  const inputCh = await getStorageChannel();
  const result = await tgClient.invoke(new Api.channels.GetChannels({ id: [inputCh] }));
  const channelEntity = result.chats[0];
  let masterIndex = await readMasterIndex(channelEntity);
  if (!masterIndex) throw new Error('No master index found');
  
  updater(masterIndex);
  
  masterIndex.last_synced = new Date().toISOString();
  await writeMasterIndex(channelEntity, masterIndex);
}

ipcMain.handle('tg-toggle-favorite', async (_event, photoId: string, isFavorite: boolean) => {
  try {
    const db = DatabaseService.getInstance().db;
    db.prepare('UPDATE photos SET is_favorite = ? WHERE id = ?').run(isFavorite ? 1 : 0, photoId);
    
    await updateMasterIndexPhotos((index) => {
      const p = index.photos.find(p => p.id === photoId);
      if (p) p.is_favorite = isFavorite ? 1 : 0;
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('tg-move-to-trash', async (_event, photoIds: string[]) => {
  try {
    const db = DatabaseService.getInstance().db;
    const now = Math.floor(Date.now() / 1000);
    const stmt = db.prepare('UPDATE photos SET is_deleted = 1, deleted_at = ? WHERE id = ?');

    db.transaction(() => {
      for (const pid of photoIds) {
        stmt.run(now, pid);
      }
    })();

    await updateMasterIndexPhotos((index) => {
      for (const pid of photoIds) {
        const p = index.photos.find(p => p.id === pid);
        if (p) {
          p.is_deleted = 1;
          p.deleted_at = now;
        }
      }
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('tg-restore-from-trash', async (_event, photoIds: string[]) => {
  try {
    const db = DatabaseService.getInstance().db;
    const stmt = db.prepare('UPDATE photos SET is_deleted = 0, deleted_at = NULL WHERE id = ?');
    
    db.transaction(() => {
      for (const pid of photoIds) {
        stmt.run(pid);
      }
    })();
    
    await updateMasterIndexPhotos((index) => {
      for (const pid of photoIds) {
        const p = index.photos.find(p => p.id === pid);
        if (p) {
          p.is_deleted = 0;
          p.deleted_at = null;
        }
      }
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('tg-empty-trash-item', async (_event, photoIds: string[]) => {
  try {
    const db = DatabaseService.getInstance().db;
    await loadGramJS();
    const inputCh = await getStorageChannel();
    const result = await tgClient.invoke(new Api.channels.GetChannels({ id: [inputCh] }));
    const channelEntity = result.chats[0];

    let masterIndex = await readMasterIndex(channelEntity);
    if (!masterIndex) throw new Error("Failed to read master index");

    const photosToDeleteMeta = masterIndex.photos.filter(p => photoIds.includes(p.id));
    const messageIdsToDelete = photosToDeleteMeta.flatMap(p => {
      const ids = [parseInt(p.file_id)];
      if (p.thumb_file_id) ids.push(parseInt(p.thumb_file_id));
      return ids.filter(id => !isNaN(id));
    });

    if (messageIdsToDelete.length > 0) {
      await tgClient.invoke(new Api.channels.DeleteMessages({
        channel: channelEntity,
        id: messageIdsToDelete
      }));
    }

    masterIndex.photos = masterIndex.photos.filter(p => !photoIds.includes(p.id));
    if (masterIndex.photo_albums) {
      masterIndex.photo_albums = masterIndex.photo_albums.filter(pa => !photoIds.includes(pa.photo_id));
    }
    masterIndex.total_photos = masterIndex.photos.length;
    masterIndex.last_synced = new Date().toISOString();

    await writeMasterIndex(channelEntity, masterIndex);

    db.transaction(() => {
      const delPhoto = db.prepare('DELETE FROM photos WHERE id = ?');
      const delPhotoAlbums = db.prepare('DELETE FROM photo_albums WHERE photo_id = ?');
      for (const pid of photoIds) {
        delPhoto.run(pid);
        delPhotoAlbums.run(pid);
      }
    })();
    return { success: true };
  } catch (err: any) {
    console.error('[tg-empty-trash-item]', err);
    return { error: err.message };
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Settings & Account IPC Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

ipcMain.handle('tg-get-account-info', async () => {
  try {
    await loadGramJS();
    if (!tgClient || !tgClient.connected) throw new Error('Not connected');
    const me = await tgClient.getMe();
    return {
      username: me.username,
      phone: me.phone,
      firstName: me.firstName,
      lastName: me.lastName
    };
  } catch (err: any) {
    console.error('[tg-get-account-info]', err);
    return { error: err.message };
  }
});

ipcMain.handle('tg-get-storage-info', () => {
  try {
    const db = DatabaseService.getInstance().db;
    const row = db.prepare('SELECT COUNT(*) as totalPhotos, SUM(size_bytes) as totalSizeBytes FROM photos WHERE is_deleted = 0').get() as any;
    return {
      totalPhotos: row?.totalPhotos || 0,
      totalSizeBytes: row?.totalSizeBytes || 0
    };
  } catch (err: any) {
    console.error('[tg-get-storage-info]', err);
    return { error: err.message };
  }
});

ipcMain.handle('tg-clear-local-cache', async () => {
  try {
    const db = DatabaseService.getInstance().db;
    const rows = db.prepare('SELECT id, local_thumb_path FROM photos WHERE local_thumb_path IS NOT NULL').all() as any[];
    
    let clearedCount = 0;
    for (const row of rows) {
      if (row.local_thumb_path) {
        try {
          await fs.unlink(row.local_thumb_path);
          clearedCount++;
        } catch (e) {
          // ignore if file doesn't exist
        }
      }
    }

    db.prepare('UPDATE photos SET local_thumb_path = NULL WHERE local_thumb_path IS NOT NULL').run();
    return { success: true, clearedCount };
  } catch (err: any) {
    console.error('[tg-clear-local-cache]', err);
    return { error: err.message };
  }
});

ipcMain.handle('tg-get-sessions', async () => {
  try {
    await loadGramJS();
    const result = await tgClient.invoke(new Api.account.GetAuthorizations());
    return result.authorizations.map((auth: any) => ({
      hash: auth.hash.toString(),
      deviceModel: auth.deviceModel,
      platform: auth.platform,
      appVersion: auth.appVersion,
      appName: auth.appName,
      dateActive: auth.dateActive,
      dateCreated: auth.dateCreated,
      country: auth.country,
      current: auth.current
    }));
  } catch (err: any) {
    console.error('[tg-get-sessions]', err);
    return { error: err.message };
  }
});

ipcMain.handle('tg-revoke-other-sessions', async () => {
  try {
    await loadGramJS();
    await tgClient.invoke(new Api.auth.ResetAuthorizations());
    return { success: true };
  } catch (err: any) {
    console.error('[tg-revoke-other-sessions]', err);
    return { error: err.message };
  }
});

ipcMain.handle('tg-select-sync-folder', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return { success: true, folderPath: result.filePaths[0] };
    }
    return { success: false, canceled: true };
  } catch (err: any) {
    console.error('[tg-select-sync-folder]', err);
    return { error: err.message };
  }
});

ipcMain.handle('tg-get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('tg-check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdatesAndNotify();
    if (result && result.updateInfo) {
      return { updateAvailable: true, version: result.updateInfo.version };
    }
    return { updateAvailable: false };
  } catch (err: any) {
    console.error('[tg-check-for-updates]', err);
    return { error: err.message };
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ openExternal Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

ipcMain.handle('tg-open-external', async (_event, url: string) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    await shell.openExternal(url);
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Multi-folder sync management Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

const STORE_KEY_SYNC_FOLDERS = 'sync_folders';

ipcMain.handle('tg-get-sync-folders', () => {
  return (store.get(STORE_KEY_SYNC_FOLDERS, []) as string[]);
});

ipcMain.handle('tg-add-sync-folder', async (_event, folderPath: string) => {
  try {
    if (typeof folderPath !== 'string' || !folderPath) return { success: false, error: 'Invalid path' };
    const folders = (store.get(STORE_KEY_SYNC_FOLDERS, []) as string[]);
    if (!folders.includes(folderPath)) {
      folders.push(folderPath);
      store.set(STORE_KEY_SYNC_FOLDERS, folders);
      updateSyncFolderWatcher();
    }
    return { success: true, folderPath };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('tg-remove-sync-folder', (_event, folderPath: string) => {
  try {
    const folders = (store.get(STORE_KEY_SYNC_FOLDERS, []) as string[]).filter(f => f !== folderPath);
    store.set(STORE_KEY_SYNC_FOLDERS, folders);
    updateSyncFolderWatcher();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Download thumbnail for photo viewer Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

ipcMain.handle('tg-download-thumb', async (_event, photoId: string, _fileId: string) => {
  try {
    // Return existing local thumb if available
    const row = DatabaseService.getInstance().get<any>(
      'SELECT local_thumb_path FROM photos WHERE id = ?', photoId
    );
    if (row?.local_thumb_path) {
      const url = 'thumb://local/' + encodeURIComponent(require('path').basename(row.local_thumb_path));
      return { url };
    }
    return { error: 'No local thumbnail available' };
  } catch (err: any) {
    return { error: err.message };
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Clear and switch account Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬



// --- Download video from Telegram for local playback ---

const videoCache = new Map<string, string>(); // photoId -> local file path

ipcMain.handle('tg-request-video', async (_event, photoId: string) => {
  try {
    // Return cached path if available
    if (videoCache.has(photoId)) {
      const cached = videoCache.get(photoId)!;
      // Verify file still exists
      try {
        await fs.access(cached);
        return { url: 'thumb://video/' + encodeURIComponent(require('path').basename(cached)) };
      } catch {
        videoCache.delete(photoId);
      }
    }

    const row = DatabaseService.getInstance().get<any>(
      'SELECT file_id, original_filename, filename FROM photos WHERE id = ?', photoId
    );
    if (!row) return { error: 'Photo not found' };

    await loadGramJS();
    if (!tgClient) return { error: 'Not connected' };

    const inputCh = await getStorageChannel();
    const result = await tgClient.invoke(new Api.channels.GetChannels({ id: [inputCh] }));
    const channelEntity = result.chats[0];

    const fileId = parseInt(row.file_id);
    if (isNaN(fileId)) return { error: 'Invalid file ID' };

    const messages = await tgClient.getMessages(channelEntity, { ids: [fileId] });
    if (!messages || messages.length === 0 || !messages[0]?.media) {
      return { error: 'File not found on Telegram' };
    }

    const msg = messages[0];
    const videoCacheDir = path.join(app.getPath('userData'), 'videocache');
    await fs.mkdir(videoCacheDir, { recursive: true });

    const ext = (row.original_filename || row.filename || 'video.mp4').split('.').pop() || 'mp4';
    const outPath = path.join(videoCacheDir, `${photoId}.${ext}`);

    // Check if already downloaded
    try {
      await fs.access(outPath);
      videoCache.set(photoId, outPath);
      return { url: 'thumb://video/' + encodeURIComponent(require('path').basename(outPath)) };
    } catch { /* not cached, download */ }

    // Download the video file
    const buffer = await tgClient.downloadMedia(msg, { outputFile: outPath });
    if (!buffer && !(await fs.access(outPath).then(() => true).catch(() => false))) {
      return { error: 'Download failed' };
    }

    videoCache.set(photoId, outPath);
    return { url: 'thumb://video/' + encodeURIComponent(require('path').basename(outPath)) };
  } catch (err: any) {
    console.error('[tg-request-video]', err);
    return { error: err.message };
  }
});

// --- Copy image/video thumbnail to system clipboard ---

ipcMain.handle('tg-copy-to-clipboard', async (_event, photoId: string) => {
  try {
    const row = DatabaseService.getInstance().get<any>(
      'SELECT local_thumb_path FROM photos WHERE id = ?', photoId
    );
    if (!row?.local_thumb_path) return { error: 'No local thumbnail available' };
    const img = nativeImage.createFromPath(row.local_thumb_path);
    if (img.isEmpty()) return { error: 'Could not load image' };
    clipboard.writeImage(img);
    return { success: true };
  } catch (err: any) {
    console.error('[tg-copy-to-clipboard]', err);
    return { error: err.message };
  }
});

// --- Show file in system file explorer ---

ipcMain.handle('tg-show-in-folder', async (_event, photoId: string) => {
  try {
    const row = DatabaseService.getInstance().get<any>(
      'SELECT local_thumb_path FROM photos WHERE id = ?', photoId
    );
    if (row?.local_thumb_path) {
      shell.showItemInFolder(row.local_thumb_path);
      return { success: true };
    }
    return { error: 'No local file available' };
  } catch (err: any) {
    console.error('[tg-show-in-folder]', err);
    return { error: err.message };
  }
});

ipcMain.handle('tg-clear-and-switch-account', async () => {
  try {
    // 1. Stop the folder watcher to prevent uploads during reset
    if (fileWatcher) {
      await fileWatcher.close().catch(() => {});
      fileWatcher = null;
      pendingFiles.forEach(t => clearTimeout(t));
      pendingFiles.clear();
    }

    // 2. Log out from Telegram and disconnect
    if (tgClient) {
      await loadGramJS();
      try { await tgClient.invoke(new Api.auth.LogOut()); } catch { /* ignore */ }
      await tgClient.disconnect();
      tgClient = null;
    }

    // 3. Delete ALL account-specific keys from electron-store
    store.delete(STORE_KEY_SESSION);
    store.delete(STORE_KEY_CHANNEL);       // Fix 6: was deleting the legacy key â€” now clears the real one
    store.delete(STORE_KEY_CHANNEL_ID);    // legacy key â€” belt-and-suspenders
    store.delete('sync_folders');
    store.delete('sync_folder');
    store.delete('auto_sync_enabled');
    store.delete('pin_hash');

    // 4. Clear local thumbnail cache
    const thumbCacheDir = path.join(app.getPath('userData'), 'thumbcache');
    await fs.rm(thumbCacheDir, { recursive: true, force: true }).catch(() => {});

    // 5. Wipe all local DB data for this account
    const db = DatabaseService.getInstance().db;
    db.prepare('DELETE FROM photos').run();
    db.prepare('DELETE FROM albums').run();
    db.prepare('DELETE FROM photo_albums').run();
    db.prepare('DELETE FROM sync_state').run();

    return { success: true };
  } catch (err: any) {
    console.error('[tg-clear-and-switch-account]', err);
    return { success: false, error: err.message };
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Cleanup duplicate Telegram messages Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

ipcMain.handle('tg-cleanup-duplicates', async () => {
  try {
    if (!tgClient) return { success: false, error: 'Not connected' };
    await loadGramJS();

    const inputCh = await getStorageChannel();
    const result = await tgClient.invoke(new Api.channels.GetChannels({ id: [inputCh] }));
    const channelEntity = result.chats[0];
    const masterIndex = await readMasterIndex(channelEntity);
    if (!masterIndex) return { success: false, error: 'No master index' };

    // Get all messages in channel
    const messages = await tgClient.getMessages(channelEntity, { limit: 500 });
    const masterIndexMsgIds = new Set<number>();

    // Find all pinned messages (keep those)
    const fullChannel = await tgClient.invoke(
      new Api.channels.GetFullChannel({ channel: channelEntity })
    );
    const pinnedMsgId: number = fullChannel.fullChat?.pinnedMsgId ?? 0;
    if (pinnedMsgId) masterIndexMsgIds.add(pinnedMsgId);

    // Valid file message IDs from master index
    const validFileIds = new Set(masterIndex.photos.flatMap((p: any) => [p.file_id].filter(Boolean)));

    // Delete messages that are NOT the pinned index AND NOT a known photo file
    const toDelete: number[] = [];
    for (const msg of messages) {
      if (masterIndexMsgIds.has(msg.id)) continue;
      if (msg.media && validFileIds.has(msg.id?.toString())) continue;
      // Text-only messages (metadata spam) or unrecognised Ã¢â‚¬â€ delete
      if (!msg.media || msg.message) {
        toDelete.push(msg.id);
      }
    }

    if (toDelete.length > 0) {
      await tgClient.invoke(new Api.channels.DeleteMessages({ channel: channelEntity, id: toDelete }));
    }

    return { success: true, deleted: toDelete.length };
  } catch (err: any) {
    console.error('[tg-cleanup-duplicates]', err);
    return { success: false, error: err.message };
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ PIN lock Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

ipcMain.handle('tg-set-pin', async (_event, pin: string) => {
  if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) return { error: 'Invalid PIN' };
  try {
    const hash = crypto.createHash('sha256').update(`telegallery-pin:${pin}`).digest('base64');
    if (safeStorage.isEncryptionAvailable()) {
      store.set('pin_hash', safeStorage.encryptString(hash).toString('base64'));
    } else {
      store.set('pin_hash', hash);
    }
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
});

ipcMain.handle('tg-clear-pin', () => {
  store.delete('pin_hash');
  return { success: true };
});

ipcMain.handle('tg-verify-pin', (_event, pin: string) => {
  if (typeof pin !== 'string') return { valid: false };
  try {
    const stored = store.get('pin_hash') as string | undefined;
    if (!stored) return { valid: false };
    const hash = crypto.createHash('sha256').update(`telegallery-pin:${pin}`).digest('base64');
    let storedHash = stored;
    if (safeStorage.isEncryptionAvailable()) {
      try { storedHash = safeStorage.decryptString(Buffer.from(stored, 'base64')); } catch { /* not encrypted */ }
    }
    return { valid: hash === storedHash };
  } catch {
    return { valid: false };
  }
});
