import { useState, useEffect, useRef } from 'react';
import {
  RefreshCcw, CheckCircle2, AlertCircle, RefreshCw,
  User, HardDrive, Monitor, Shield, Info, Folder, LogOut,
  Smartphone, X, Plus, Lock, Eye, EyeOff, Github,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppearance } from '../context/AppearanceContext';

export default function Settings() {
  const navigate = useNavigate();
  const { theme, gridSize, setTheme, setGridSize } = useAppearance();
  const [activeTab, setActiveTab] = useState('account');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);

  const [account, setAccount] = useState<any>(null);
  const [storage, setStorage] = useState({ totalPhotos: 0, totalSizeBytes: 0 });
  const [sessions, setSessions] = useState<any[]>([]);
  const [appVersion, setAppVersion] = useState('');

  // Settings (non-appearance)
  const [autoSync, setAutoSync] = useState(false);
  const [syncFolders, setSyncFolders] = useState<string[]>([]);
  const [uploadQuality, setUploadQuality] = useState('original');

  // PIN lock
  const [pinEnabled, setPinEnabled] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState('');

  const pinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setAutoSync(await window.electronAPI.getSetting('auto_sync_enabled') || false);
    const folders = await window.electronAPI.getSetting('sync_folders') || [];
    setSyncFolders(Array.isArray(folders) ? folders : []);
    setUploadQuality(await window.electronAPI.getSetting('upload_quality') || 'original');
    // theme and gridSize are managed by AppearanceContext — no need to load here
    const pinHash = await window.electronAPI.getSetting('pin_hash');
    setPinEnabled(!!pinHash);

    const acc = await window.electronAPI.getAccountInfo();
    setAccount(acc);
    setStorage(await window.electronAPI.getStorageInfo());
    const sess = await window.electronAPI.getSessions();
    if (Array.isArray(sess)) setSessions(sess);
    setAppVersion(await window.electronAPI.getAppVersion());
  };

  // ── Theme: delegate to AppearanceContext ────────────────────────────────────
  const handleThemeChange = (t: string) => {
    setTheme(t as any);
  };

  // ── Grid size: delegate to AppearanceContext ─────────────────────────────────
  const handleGridChange = (g: string) => {
    setGridSize(g as any);
  };

  // ── Multi-folder sync ────────────────────────────────────────────────────────
  const handleAddFolder = async () => {
    const result = await window.electronAPI.selectSyncFolder();
    if (result.success && result.folderPath) {
      await window.electronAPI.addSyncFolder(result.folderPath);
      setSyncFolders(prev => [...new Set([...prev, result.folderPath as string])]);
    }
  };

  const handleRemoveFolder = async (folder: string) => {
    await window.electronAPI.removeSyncFolder(folder);
    setSyncFolders(prev => prev.filter(f => f !== folder));
  };

  // ── PIN lock ─────────────────────────────────────────────────────────────────
  const handleSavePin = async () => {
    setPinError('');
    if (newPin.length < 4 || newPin.length > 6) {
      setPinError('PIN must be 4–6 digits');
      return;
    }
    if (!/^\d+$/.test(newPin)) {
      setPinError('PIN must contain only digits');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('PINs do not match');
      return;
    }
    // Hash with built-in crypto (PBKDF2)
    await window.electronAPI.setPin(newPin);
    setPinEnabled(true);
    setShowPinSetup(false);
    setNewPin(''); setConfirmPin('');
  };

  const handleDisablePin = async () => {
    if (confirm('Disable PIN lock? The app will open without a PIN.')) {
      await window.electronAPI.clearPin();
      setPinEnabled(false);
    }
  };

  // ── Logout vs Switch Account ─────────────────────────────────────────────────
  const handleLogout = async () => {
    if (!confirm('Log out? Your local gallery cache will be kept.')) return;
    await window.electronAPI.signOut();
    navigate('/login', { replace: true });
  };

  const handleSwitchAccount = async () => {
    if (!confirm('Switch account? This will clear ALL local data including thumbnails and gallery cache.')) return;
    await window.electronAPI.clearAndSwitchAccount();
    navigate('/login', { replace: true });
  };

  const handleSyncNow = async () => {
    setIsSyncing(true); setSyncResult(null);
    try {
      const result = await window.electronAPI.syncFromTelegram();
      setSyncResult(result);
    } catch (err: any) {
      setSyncResult({ success: false, error: err.message });
    } finally { setIsSyncing(false); }
  };

  const handleClearCache = async () => {
    const res = await window.electronAPI.clearLocalCache();
    if (res.success) alert(`Cleared ${res.clearedCount} cached thumbnails.`);
  };

  const handleRevokeSessions = async () => {
    if (confirm('Log out of all other Telegram devices?')) {
      const res = await window.electronAPI.revokeOtherSessions();
      if (res.success) { alert('All other sessions revoked.'); loadData(); }
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const TAB_BTN = (tab: string, icon: any, label: string) => {
    const Icon = icon;
    return (
      <button
        key={tab}
        onClick={() => setActiveTab(tab)}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
          activeTab === tab ? 'bg-primary text-primary-foreground' : 'text-muted hover:bg-muted-bg'
        }`}
      >
        <Icon size={20} /> {label}
      </button>
    );
  };

  return (
    <div className="flex h-full bg-background overflow-hidden">
      {/* Sidebar */}
      <div className="w-56 border-r border-border p-4 space-y-1 shrink-0">
        <h1 className="text-xl font-bold mb-6 px-2 text-foreground">Settings</h1>
        {TAB_BTN('account', User, 'Account')}
        {TAB_BTN('sync', RefreshCcw, 'Sync')}
        {TAB_BTN('storage', HardDrive, 'Storage')}
        {TAB_BTN('appearance', Monitor, 'Appearance')}
        {TAB_BTN('security', Shield, 'Security')}
        {TAB_BTN('about', Info, 'About')}
      </div>

      {/* Content */}
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-8">

          {/* ── ACCOUNT ── */}
          {activeTab === 'account' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-2xl font-bold text-foreground">Telegram Account</h2>
              <div className="bg-muted-bg border border-border rounded-2xl p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-primary/20 text-primary rounded-full flex items-center justify-center text-2xl font-bold">
                    {account?.firstName?.[0] || 'U'}
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">{account?.firstName} {account?.lastName}</h3>
                    <p className="text-muted text-sm">@{account?.username || 'No username'} · {account?.phone}</p>
                  </div>
                </div>
                <div className="flex gap-3 pt-4 border-t border-border">
                  <button onClick={handleLogout} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 font-medium transition-colors">
                    <LogOut size={16} /> Logout
                  </button>
                  <button onClick={handleSwitchAccount} className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border text-foreground hover:bg-muted-bg font-medium transition-colors">
                    Switch Account
                  </button>
                </div>
                <p className="text-xs text-muted mt-3">
                  <strong>Logout</strong> keeps local cache. <strong>Switch Account</strong> clears all local data.
                </p>
              </div>
            </div>
          )}

          {/* ── SYNC ── */}
          {activeTab === 'sync' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-2xl font-bold text-foreground">Synchronization</h2>

              <div className="bg-muted-bg border border-border rounded-2xl p-6 space-y-6">
                {/* Enable toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">Auto-Sync Folders</h3>
                    <p className="text-sm text-muted">Auto-upload photos from selected folders</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={autoSync}
                      onChange={async (e) => {
                        setAutoSync(e.target.checked);
                        await window.electronAPI.setSetting('auto_sync_enabled', e.target.checked);
                      }} />
                    <div className="w-11 h-6 bg-border rounded-full peer peer-checked:bg-primary peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
                  </label>
                </div>

                {/* Folder list */}
                {autoSync && (
                  <div className="space-y-2">
                    {syncFolders.length === 0 && (
                      <p className="text-sm text-muted italic">No folders added yet.</p>
                    )}
                    {syncFolders.map(folder => (
                      <div key={folder} className="flex items-center gap-3 bg-background border border-border rounded-xl px-4 py-3">
                        <Folder size={16} className="text-primary shrink-0" />
                        <span className="text-sm text-foreground flex-1 truncate" title={folder}>{folder}</span>
                        <span className="text-xs bg-green-500/15 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">Watching</span>
                        <button onClick={() => handleRemoveFolder(folder)} className="text-muted hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <button onClick={handleAddFolder} className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 mt-1 px-2 py-1.5 rounded-lg hover:bg-primary/10 transition-colors">
                      <Plus size={16} /> Add Folder
                    </button>
                  </div>
                )}

                {/* Manual sync */}
                <div className="pt-4 border-t border-border">
                  <h3 className="font-semibold text-foreground mb-3">Manual Sync</h3>
                  <div className="flex items-center gap-4">
                    <button onClick={handleSyncNow} disabled={isSyncing} className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-colors ${isSyncing ? 'bg-primary/50 text-white cursor-not-allowed' : 'bg-primary hover:bg-primary/90 text-white'}`}>
                      <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
                      {isSyncing ? 'Syncing…' : 'Sync Now'}
                    </button>
                    {syncResult && (
                      <div className={`flex items-center gap-2 text-sm font-medium ${syncResult.success ? 'text-green-500' : 'text-red-500'}`}>
                        {syncResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                        <span>{syncResult.message || syncResult.error}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Upload quality */}
                <div className="pt-4 border-t border-border">
                  <h3 className="font-semibold text-foreground mb-2">Upload Quality</h3>
                  <select value={uploadQuality} onChange={async (e) => { setUploadQuality(e.target.value); await window.electronAPI.setSetting('upload_quality', e.target.value); }}
                    className="w-full bg-background border border-border rounded-xl p-3 text-foreground outline-none focus:border-primary">
                    <option value="original">Original (Uncompressed)</option>
                    <option value="compressed">Compressed (Faster)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ── STORAGE ── */}
          {activeTab === 'storage' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-2xl font-bold text-foreground">Storage</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted-bg border border-border rounded-2xl p-6 text-center">
                  <div className="text-3xl font-bold text-primary mb-2">{storage.totalPhotos}</div>
                  <div className="text-sm text-muted font-medium">Total Photos</div>
                </div>
                <div className="bg-muted-bg border border-border rounded-2xl p-6 text-center">
                  <div className="text-3xl font-bold text-primary mb-2">{formatBytes(storage.totalSizeBytes)}</div>
                  <div className="text-sm text-muted font-medium">Telegram Storage Used</div>
                </div>
              </div>
              <div className="bg-muted-bg border border-border rounded-2xl p-6 space-y-4">
                <h3 className="font-semibold text-foreground">Local Cache</h3>
                <p className="text-sm text-muted">TeleGallery caches thumbnails locally for faster loading. Clearing frees disk space; thumbnails regenerate on next view.</p>
                <button onClick={handleClearCache} className="px-5 py-2.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 font-medium transition-colors">Clear Local Cache</button>
              </div>
            </div>
          )}

          {/* ── APPEARANCE ── */}
          {activeTab === 'appearance' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-2xl font-bold text-foreground">Appearance</h2>
              <div className="bg-muted-bg border border-border rounded-2xl p-6 space-y-6">
                <div>
                  <h3 className="font-semibold text-foreground mb-3">Theme</h3>
                  <div className="flex gap-3">
                    {['light', 'dark', 'system'].map(t => (
                      <button key={t} onClick={() => handleThemeChange(t)}
                        className={`flex-1 py-3 px-4 rounded-xl border font-medium capitalize transition-all ${theme === t ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted hover:border-muted'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted mt-2">Theme is applied immediately.</p>
                </div>
                <div className="pt-4 border-t border-border">
                  <h3 className="font-semibold text-foreground mb-3">Gallery Grid Size</h3>
                  <div className="flex gap-3">
                    {[['small','6 columns'],['medium','4 columns'],['large','2 columns']].map(([g, label]) => (
                      <button key={g} onClick={() => handleGridChange(g)}
                        className={`flex-1 py-3 px-2 rounded-xl border font-medium capitalize transition-all text-sm ${gridSize === g ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted hover:border-muted'}`}>
                        <div className="font-semibold">{g.charAt(0).toUpperCase() + g.slice(1)}</div>
                        <div className="text-xs opacity-60">{label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── SECURITY ── */}
          {activeTab === 'security' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-2xl font-bold text-foreground">Security</h2>

              {/* PIN Lock */}
              <div className="bg-muted-bg border border-border rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground flex items-center gap-2"><Lock size={18} className="text-primary" /> App PIN Lock</h3>
                    <p className="text-sm text-muted">Require a 4–6 digit PIN when opening TeleGallery</p>
                  </div>
                  {pinEnabled ? (
                    <button onClick={handleDisablePin} className="px-4 py-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 text-sm font-medium transition-colors">Disable PIN</button>
                  ) : (
                    <button onClick={() => { setShowPinSetup(true); setTimeout(() => pinInputRef.current?.focus(), 100); }}
                      className="px-4 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 text-sm font-medium transition-colors">Set PIN</button>
                  )}
                </div>

                {showPinSetup && (
                  <div className="bg-background border border-border rounded-xl p-4 space-y-3 animate-in fade-in duration-200">
                    <div className="relative">
                      <input ref={pinInputRef} type={showPin ? 'text' : 'password'} value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="Enter PIN (4–6 digits)" maxLength={6}
                        className="w-full bg-muted-bg border border-border rounded-lg px-4 py-2.5 text-foreground pr-10 focus:outline-none focus:border-primary font-mono text-lg tracking-widest" />
                      <button type="button" onClick={() => setShowPin(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
                        {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <input type={showPin ? 'text' : 'password'} value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Confirm PIN" maxLength={6}
                      className="w-full bg-muted-bg border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary font-mono text-lg tracking-widest" />
                    {pinError && <p className="text-sm text-red-500">{pinError}</p>}
                    <div className="flex gap-2">
                      <button onClick={handleSavePin} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">Save PIN</button>
                      <button onClick={() => { setShowPinSetup(false); setNewPin(''); setConfirmPin(''); setPinError(''); }}
                        className="px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted hover:bg-muted-bg transition-colors">Cancel</button>
                    </div>
                  </div>
                )}

                {pinEnabled && !showPinSetup && (
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <CheckCircle2 size={14} /> PIN lock is active
                  </div>
                )}
              </div>

              {/* Active Sessions */}
              <div className="bg-muted-bg border border-border rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-border flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">Active Telegram Sessions</h3>
                  <button onClick={handleRevokeSessions} className="text-sm font-medium text-red-500 hover:text-red-400">Revoke all others</button>
                </div>
                <div className="divide-y divide-border">
                  {sessions.length === 0 && (
                    <p className="p-6 text-sm text-muted">No sessions found.</p>
                  )}
                  {sessions.map((session, idx) => (
                    <div key={idx} className="p-4 flex items-start gap-4">
                      <div className="p-2.5 bg-background rounded-full border border-border shrink-0">
                        <Smartphone size={20} className="text-muted" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-foreground text-sm">{session.appName} {session.appVersion}</h4>
                          {session.current && <span className="text-[10px] uppercase font-bold bg-green-500/20 text-green-500 px-2 py-0.5 rounded-full">This Device</span>}
                        </div>
                        <p className="text-xs text-muted mt-0.5">{session.deviceModel} · {session.platform}</p>
                        <p className="text-xs text-muted">{session.country} · {new Date(session.dateActive * 1000).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── ABOUT ── */}
          {activeTab === 'about' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-2xl font-bold text-foreground">About</h2>
              <div className="bg-muted-bg border border-border rounded-2xl p-8 flex flex-col items-center text-center">
                <div className="w-20 h-20 bg-primary/20 text-primary rounded-3xl flex items-center justify-center mb-4 shadow-lg shadow-primary/10">
                  <span className="text-4xl font-black">T</span>
                </div>
                <h3 className="text-2xl font-bold text-foreground mb-1">TeleGallery</h3>
                <p className="text-muted mb-6 text-sm">Version {appVersion} · Open Source</p>
                <div className="flex gap-3">
                  <button
                    onClick={async () => {
                      try {
                        const res = await window.electronAPI.checkForUpdates();
                        alert(res.updateAvailable ? `Update available: ${res.version}` : 'You are on the latest version.');
                      } catch { alert('Could not check for updates.'); }
                    }}
                    className="px-5 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
                  >
                    Check for Updates
                  </button>
                  {/* Fix 16: real GitHub link via shell.openExternal */}
                  <button
                    onClick={() => window.electronAPI.openExternal('https://github.com/Yadavallitejas/TeleDrive')}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border text-foreground hover:bg-muted-bg font-medium transition-colors"
                  >
                    <Github size={16} /> GitHub
                  </button>
                </div>
              </div>
              <p className="text-center text-sm text-muted">Built with Electron, React &amp; GramJS.</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
