import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Generic settings store
  getSetting: (key: string) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key: string, value: any) => ipcRenderer.invoke('set-setting', key, value),

  // ── Telegram authentication ────────────────────────────────────────────────
  checkAuth: (): Promise<{ authenticated: boolean }> =>
    ipcRenderer.invoke('tg-check-auth'),

  sendPhoneCode: (phoneNumber: string): Promise<{ phoneCodeHash?: string; error?: string }> =>
    ipcRenderer.invoke('tg-send-phone-code', phoneNumber),

  signIn: (
    phoneNumber: string,
    phoneCodeHash: string,
    code: string
  ): Promise<{ success?: boolean; needs2FA?: boolean; error?: string }> =>
    ipcRenderer.invoke('tg-sign-in', phoneNumber, phoneCodeHash, code),

  signIn2FA: (password: string): Promise<{ success?: boolean; error?: string }> =>
    ipcRenderer.invoke('tg-sign-in-2fa', password),

  signOut: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('tg-sign-out'),

  // ── Storage setup ─────────────────────────────────────────────────────────
  setupStorage: (): Promise<{
    status?: 'created' | 'restored';
    channelId?: string;
    error?: string;
  }> => ipcRenderer.invoke('tg-setup-storage'),

  /** Subscribe to incremental progress events pushed from main process. */
  onRestoreProgress: (
    cb: (progress: {
      step: number;
      total: number;
      current: number;
      label: string;
    }) => void
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => cb(data);
    ipcRenderer.on('tg-restore-progress', handler);
    return handler; // return so caller can remove it
  },

  /** Unsubscribe a progress listener. */
  offRestoreProgress: (handler: any) => {
    ipcRenderer.removeListener('tg-restore-progress', handler);
  },

  // ── Data Access ──────────────────────────────────────────────────────────
  getPhotos: (): Promise<any[]> => ipcRenderer.invoke('tg-get-photos'),

  // ── Upload ───────────────────────────────────────────────────────────────
  selectFiles: (): Promise<string[]> => ipcRenderer.invoke('tg-select-files'),
  uploadFiles: (filePaths: string[]): Promise<{ success: boolean }> => ipcRenderer.invoke('tg-upload-files', filePaths),

  onUploadProgress: (
    cb: (data: { fileId: string; status: string; progress: number; speed: string }) => void
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => cb(data);
    ipcRenderer.on('tg-upload-progress', handler);
    return handler;
  },
  offUploadProgress: (handler: any) => {
    ipcRenderer.removeListener('tg-upload-progress', handler);
  },

  onUploadComplete: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('tg-upload-complete', handler);
    return handler;
  },
  offUploadComplete: (handler: any) => {
    ipcRenderer.removeListener('tg-upload-complete', handler);
  },

  onUploadFileError: (cb: (data: { fileId: string; filePath: string; error: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => cb(data);
    ipcRenderer.on('tg-upload-file-error', handler);
    return handler;
  },

  // ── Albums ──────────────────────────────────────────────────────────────
  getAlbums: () => ipcRenderer.invoke('tg-get-albums'),
  createAlbum: (name: string) => ipcRenderer.invoke('tg-create-album', name),
  renameAlbum: (id: string, name: string) => ipcRenderer.invoke('tg-rename-album', id, name),
  deleteAlbum: (id: string) => ipcRenderer.invoke('tg-delete-album', id),
  getAlbumPhotos: (albumId: string) => ipcRenderer.invoke('tg-get-album-photos', albumId),
  addPhotosToAlbum: (albumId: string, photoIds: string[]) => ipcRenderer.invoke('tg-add-photos-to-album', albumId, photoIds),
  removePhotosFromAlbum: (albumId: string, photoIds: string[]) => ipcRenderer.invoke('tg-remove-photos-from-album', albumId, photoIds),
  setAlbumCover: (albumId: string, photoId: string) => ipcRenderer.invoke('tg-set-album-cover', albumId, photoId),

  // ── Trash & Favorites ───────────────────────────────────────────────────
  getFavorites: () => ipcRenderer.invoke('tg-get-favorites'),
  getTrash: () => ipcRenderer.invoke('tg-get-trash'),
  toggleFavorite: (photoId: string, isFavorite: boolean) => ipcRenderer.invoke('tg-toggle-favorite', photoId, isFavorite),
  moveToTrash: (photoIds: string[]) => ipcRenderer.invoke('tg-move-to-trash', photoIds),
  restoreFromTrash: (photoIds: string[]) => ipcRenderer.invoke('tg-restore-from-trash', photoIds),
  emptyTrashItem: (photoIds: string[]) => ipcRenderer.invoke('tg-empty-trash-item', photoIds),

  // ── Sync ────────────────────────────────────────────────────────────────
  syncFromTelegram: () => ipcRenderer.invoke('tg-sync'),
  onSyncProgress: (cb: any) => {
    const handler = (_event: any, data: any) => cb(data);
    ipcRenderer.on('tg-sync-progress', handler);
    return handler;
  },
  offSyncProgress: (handler: any) => {
    ipcRenderer.removeListener('tg-sync-progress', handler);
  },

  // Settings & Account
  getAccountInfo: () => ipcRenderer.invoke('tg-get-account-info'),
  getProfilePhoto: () => ipcRenderer.invoke('tg-get-profile-photo'),
  getStorageInfo: () => ipcRenderer.invoke('tg-get-storage-info'),
  clearLocalCache: () => ipcRenderer.invoke('tg-clear-local-cache'),
  getSessions: () => ipcRenderer.invoke('tg-get-sessions'),
  revokeOtherSessions: () => ipcRenderer.invoke('tg-revoke-other-sessions'),
  selectSyncFolder: () => ipcRenderer.invoke('tg-select-sync-folder'),
  getSyncFolders: () => ipcRenderer.invoke('tg-get-sync-folders'),
  addSyncFolder: (folderPath: string) => ipcRenderer.invoke('tg-add-sync-folder', folderPath),
  removeSyncFolder: (folderPath: string) => ipcRenderer.invoke('tg-remove-sync-folder', folderPath),
  getAppVersion: () => ipcRenderer.invoke('tg-get-app-version'),
  checkForUpdates: () => ipcRenderer.invoke('tg-check-for-updates'),
  openExternal: (url: string) => ipcRenderer.invoke('tg-open-external', url),
  downloadThumb: (photoId: string, fileId: string) => ipcRenderer.invoke('tg-download-thumb', photoId, fileId),
  requestFullImage: (photoId: string) => ipcRenderer.invoke('tg-request-full-image', photoId),
  clearAndSwitchAccount: () => ipcRenderer.invoke('tg-clear-and-switch-account'),
  cleanupDuplicateMessages: () => ipcRenderer.invoke('tg-cleanup-duplicates'),
  copyToClipboard: (photoId: string) => ipcRenderer.invoke('tg-copy-to-clipboard', photoId),
  showInFolder: (photoId: string) => ipcRenderer.invoke('tg-show-in-folder', photoId),
  requestVideo: (photoId: string) => ipcRenderer.invoke('tg-request-video', photoId),
  saveFile: (photoId: string) => ipcRenderer.invoke('tg-save-file', photoId),

  // ── PIN lock ─────────────────────────────────────────────────────────────
  setPin: (pin: string) => ipcRenderer.invoke('tg-set-pin', pin),
  clearPin: () => ipcRenderer.invoke('tg-clear-pin'),
  verifyPin: (pin: string) => ipcRenderer.invoke('tg-verify-pin', pin),
});
