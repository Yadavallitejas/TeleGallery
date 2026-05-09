/**
 * Pure, side-effect-free helpers used throughout the main process.
 * Extracted here so they can be unit-tested without booting Electron or Telegram.
 */

// ─── Image extension filter ───────────────────────────────────────────────────

export const VALID_MEDIA_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.heic',
  '.mp4', '.mov', '.avi', '.mkv',
]);

export function isValidMediaFile(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return VALID_MEDIA_EXTS.has(ext);
}

// ─── Date normalisation ───────────────────────────────────────────────────────

/**
 * Converts a date value from the master-index JSON to a Unix timestamp (seconds).
 *   - Already a number  → returned as-is (assumed to already be Unix seconds)
 *   - ISO string        → converted via Date.getTime() / 1000
 *   - null / NaN / ""   → falls back to `fallbackUnix` (default: now)
 */
export function toUnixSeconds(raw: unknown, fallbackUnix?: number): number {
  const fallback = fallbackUnix ?? Math.floor(Date.now() / 1000);
  if (raw === null || raw === undefined || raw === '') return fallback;
  if (typeof raw === 'number') {
    return isNaN(raw) ? fallback : raw;
  }
  if (typeof raw === 'string') {
    const ms = new Date(raw).getTime();
    if (isNaN(ms)) return fallback;
    return Math.floor(ms / 1000);
  }
  return fallback;
}

// ─── Photo date formatting ────────────────────────────────────────────────────

/**
 * Returns a locale string for display from a unix-seconds timestamp.
 * Falls back to '—' if the value is missing or zero.
 */
export function formatUnixDate(unixSeconds?: number): string {
  if (!unixSeconds) return '—';
  const d = new Date(unixSeconds * 1000);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Byte formatting ─────────────────────────────────────────────────────────

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ─── Telegram error mapping ───────────────────────────────────────────────────

export function mapTelegramError(err: unknown): string {
  const msg: string = (err as any)?.message ?? String(err);
  if (msg.includes('PHONE_CODE_INVALID'))   return 'The code you entered is incorrect. Please try again.';
  if (msg.includes('PHONE_CODE_EXPIRED'))   return 'The code has expired. Please request a new one.';
  if (msg.includes('FLOOD_WAIT')) {
    const seconds = msg.match(/FLOOD_WAIT_(\d+)/)?.[1] ?? '?';
    return `Too many attempts. Please wait ${seconds} seconds before trying again.`;
  }
  if (msg.includes('PHONE_NUMBER_BANNED'))  return 'This phone number has been banned from Telegram.';
  if (msg.includes('PHONE_NUMBER_INVALID')) return 'Invalid phone number. Please check the number and try again.';
  if (msg.includes('SESSION_PASSWORD_NEEDED')) return 'Two-factor authentication required.';
  if (msg.includes('CHANNEL_INVALID'))      return 'Storage channel is invalid. Please reconnect your account.';
  if (msg.includes('NETWORK') || msg.includes('ECONNREFUSED'))
    return 'Network error. Please check your internet connection.';
  return `Unexpected error: ${msg}`;
}

// ─── Channel storage helpers (pure serialisation/deserialisation) ─────────────

export interface ChannelRef {
  id: string;
  accessHash: string;
}

export function parseChannelRef(raw: string | undefined): ChannelRef | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.id && parsed?.accessHash) return parsed as ChannelRef;
    return null;
  } catch {
    return null;
  }
}

export function serializeChannelRef(id: string | bigint, accessHash: string | bigint): string {
  return JSON.stringify({ id: id.toString(), accessHash: accessHash.toString() });
}
