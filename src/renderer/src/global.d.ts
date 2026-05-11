// Global Window augmentation for the Electron renderer process.
// This file must NOT contain any import/export statements so it's
// treated as a script (ambient declaration) by TypeScript.

interface RestoreProgress {
  step: number;
  total: number;
  current: number;
  label: string;
}

interface SetupResult {
  status?: 'created' | 'restored';
  channelId?: string;
  error?: string;
}

interface Window {
  electronAPI: {
    // Generic settings store
    getSetting: (key: string) => Promise<any>;
    setSetting: (key: string, value: any) => Promise<void>;

    // Telegram authentication (all Telegram logic stays in main process)
    checkAuth: () => Promise<{ authenticated: boolean }>;
    sendPhoneCode: (phoneNumber: string) => Promise<{
      phoneCodeHash?: string;
      error?: string;
    }>;
    signIn: (
      phoneNumber: string,
      phoneCodeHash: string,
      code: string
    ) => Promise<{ success?: boolean; needs2FA?: boolean; error?: string }>;
    signIn2FA: (password: string) => Promise<{ success?: boolean; error?: string }>;
    signOut: () => Promise<{ success: boolean }>;

    // Storage setup
    setupStorage: () => Promise<SetupResult>;
    onRestoreProgress: (cb: (progress: RestoreProgress) => void) => any;
    offRestoreProgress: (handler: any) => void;

    // Data Access
    getPhotos: () => Promise<any[]>;

    // Upload
    selectFiles: () => Promise<string[]>;
    uploadFiles: (filePaths: string[]) => Promise<{ success: boolean }>;
    onUploadProgress: (cb: (data: { fileId: string; status: string; progress: number; speed: string }) => void) => any;
    offUploadProgress: (handler: any) => void;
    onUploadComplete: (cb: () => void) => any;
    offUploadComplete: (handler: any) => void;
    onUploadFileError?: (cb: (data: { fileId: string; filePath: string; error: string }) => void) => any;

    // Albums
    getAlbums: () => Promise<any[]>;
    createAlbum: (name: string) => Promise<{ success: boolean; albumId?: string; error?: string }>;
    renameAlbum: (id: string, name: string) => Promise<{ success: boolean; error?: string }>;
    deleteAlbum: (id: string) => Promise<{ success: boolean; error?: string }>;
    getAlbumPhotos: (albumId: string) => Promise<any[]>;
    addPhotosToAlbum: (albumId: string, photoIds: string[]) => Promise<{ success: boolean; error?: string }>;
    removePhotosFromAlbum: (albumId: string, photoIds: string[]) => Promise<{ success: boolean; error?: string }>;
    setAlbumCover: (albumId: string, photoId: string) => Promise<{ success: boolean; error?: string }>;

    // Trash & Favorites
    getFavorites: () => Promise<any[]>;
    getTrash: () => Promise<any[]>;
    toggleFavorite: (photoId: string, isFavorite: boolean) => Promise<{ success: boolean; error?: string }>;
    moveToTrash: (photoIds: string[]) => Promise<{ success: boolean; error?: string }>;
    restoreFromTrash: (photoIds: string[]) => Promise<{ success: boolean; error?: string }>;
    emptyTrashItem: (photoIds: string[]) => Promise<{ success: boolean; error?: string }>;

    // Sync
    syncFromTelegram: () => Promise<{ success: boolean; message?: string; error?: string }>;
    onSyncProgress: (cb: (data: { status: string; progress: number }) => void) => any;
    offSyncProgress: (handler: any) => void;

    // Settings & Account
    getAccountInfo: () => Promise<{ username?: string; phone?: string; firstName?: string; lastName?: string; error?: string }>;
    getStorageInfo: () => Promise<{ totalPhotos: number; totalSizeBytes: number; error?: string }>;
    clearLocalCache: () => Promise<{ success: boolean; clearedCount?: number; error?: string }>;
    getSessions: () => Promise<any[] | { error: string }>;
    revokeOtherSessions: () => Promise<{ success: boolean; error?: string }>;
    selectSyncFolder: () => Promise<{ success: boolean; folderPath?: string; canceled?: boolean; error?: string }>;
    getSyncFolders: () => Promise<string[]>;
    addSyncFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
    removeSyncFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
    getAppVersion: () => Promise<string>;
    checkForUpdates: () => Promise<any>;
    openExternal: (url: string) => Promise<void>;
    downloadThumb: (photoId: string, fileId: string) => Promise<{ url?: string; error?: string }>;
    clearAndSwitchAccount: () => Promise<{ success: boolean; error?: string }>;
    cleanupDuplicateMessages: () => Promise<{ success: boolean; deleted?: number; error?: string }>;
    copyToClipboard: (photoId: string) => Promise<{ success?: boolean; error?: string }>;
    showInFolder: (photoId: string) => Promise<{ success?: boolean; error?: string }>;
    requestVideo: (photoId: string) => Promise<{ url?: string; error?: string }>;
    // PIN lock
    setPin: (pin: string) => Promise<{ success?: boolean; error?: string }>;
    clearPin: () => Promise<{ success: boolean }>;
    verifyPin: (pin: string) => Promise<{ valid: boolean }>;
  };
}
