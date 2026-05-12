import { useEffect, useState } from 'react';
import {
  HashRouter as Router,
  Routes,
  Route,
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { Settings as SettingsIcon, Image, FolderOpen, LogOut, Search, Plus, Star, Trash2, RefreshCcw, CheckCircle2, AlertCircle, Shield } from 'lucide-react';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Gallery from './pages/Gallery';
import Settings from './pages/Settings';
import UploadQueue from './components/UploadQueue';

import Album from './pages/Album';
import AlbumDetail from './pages/AlbumDetail';

import Favorites from './pages/Favorites';
import Trash from './pages/Trash';

// Pages that should render without the sidebar chrome
const FULL_SCREEN_ROUTES = ['/login', '/setup'];

function AppLayout({ children }: { children: React.ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isFullScreen = FULL_SCREEN_ROUTES.includes(location.pathname);

  const [syncState, setSyncState] = useState<{ status: string; progress: number } | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    if (isFullScreen) return;
    if (!window.electronAPI) return; // Guard: not in Electron context

    // Check App Lock
    window.electronAPI.getSetting('app_lock_enabled').then(enabled => {
      if (enabled) {
        setIsLocked(true);
        triggerUnlock();
      }
    });

    // Trigger background sync on startup
    window.electronAPI.syncFromTelegram().catch(console.error);

    const unsubscribe = window.electronAPI.onSyncProgress((data) => {
      setSyncState(data);
      if (data.progress >= 100) {
        setTimeout(() => setSyncState(null), 3000);
      }
    });
    return () => window.electronAPI.offSyncProgress(unsubscribe);
  }, [isFullScreen]);

  const triggerUnlock = async () => {
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      
      await navigator.credentials.get({
        publicKey: {
          challenge,
          userVerification: "required",
          timeout: 60000,
        }
      });
      // Unlock successful
      setIsLocked(false);
    } catch (err) {
      console.error('WebAuthn failed', err);
      // Wait and then user can manually retry
    }
  };

  if (isLocked) {
    return (
      <div
        style={{
          width: '100%', height: '100vh',
          backgroundColor: 'var(--bg-app)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '24px',
        }}
      >
        <div
          style={{
            width: 80, height: 80,
            backgroundColor: 'rgba(26, 115, 232, 0.15)',
            color: 'var(--color-primary)',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Shield size={40} />
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>App Locked</h1>
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 360 }}>
          TeleGallery is protected with Windows Hello. Please authenticate to continue.
        </p>
        <button
          onClick={triggerUnlock}
          style={{
            padding: '12px 32px',
            backgroundColor: 'var(--color-primary)',
            color: '#ffffff',
            fontWeight: 500,
            borderRadius: 'var(--border-radius-md)',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            transition: 'background-color var(--transition-fast)',
          }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
        >
          Unlock with Windows Hello
        </button>
      </div>
    );
  }

  if (isFullScreen) {
    return <div className="w-full h-screen overflow-auto">{children}</div>;
  }

  const handleSignOut = async () => {
    await window.electronAPI.signOut();
    navigate('/login', { replace: true });
  };

  const handleUpload = async () => {
    const filePaths = await window.electronAPI.selectFiles();
    if (filePaths && filePaths.length > 0) {
      await window.electronAPI.uploadFiles(filePaths);
    }
  };

  const NavLink = ({ to, icon: Icon, label }: { to: string, icon: any, label: string }) => {
    const isActive = location.pathname === to;
    return (
      <Link
        to={to}
        className={`flex items-center gap-4 px-6 py-3 rounded-r-full mr-4 transition-colors ${
          isActive 
            ? 'bg-primary/10 text-primary font-medium' 
            : 'text-foreground hover:bg-muted-bg'
        }`}
      >
        <Icon size={20} className={isActive ? "text-primary" : "text-muted"} />
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 border-b border-border bg-background z-20 shrink-0">
        <div className="flex items-center gap-2 w-64 shrink-0">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-bold text-white shadow-sm">
            T
          </div>
          <h1 className="text-xl font-medium text-foreground tracking-tight">TeleGallery</h1>
        </div>

        {/* Search Bar — single instance, wired to ?q= URL param */}
        <div className="flex-1 max-w-2xl px-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-muted" />
            </div>
            <input
              id="global-search"
              type="text"
              value={searchParams.get('q') ?? ''}
              onChange={e => {
                const v = e.target.value;
                setSearchParams(prev => {
                  const next = new URLSearchParams(prev);
                  if (v) next.set('q', v);
                  else next.delete('q');
                  return next;
                }, { replace: true });
              }}
              className="block w-full pl-10 pr-3 py-2 border-none rounded-lg bg-muted-bg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
              placeholder="Search your photos"
            />
          </div>
        </div>

        {/* Actions & Profile */}
        <div className="flex items-center gap-4 shrink-0 pl-4">
          
          {syncState && (
            <div className="flex items-center gap-2 text-xs font-medium bg-muted-bg px-3 py-1.5 rounded-full">
              {syncState.progress < 100 && syncState.status !== 'Sync failed' ? (
                <RefreshCcw size={14} className="text-blue-500 animate-pulse" />
              ) : syncState.status === 'Sync failed' ? (
                <AlertCircle size={14} className="text-red-500" />
              ) : (
                <CheckCircle2 size={14} className="text-green-500" />
              )}
              <span className="text-muted truncate max-w-[150px]">{syncState.status}</span>
            </div>
          )}

          <button 
            className="flex items-center gap-2 bg-muted-bg hover:bg-black/5 text-foreground px-4 py-2 rounded-lg transition-colors text-sm font-medium"
            onClick={handleUpload}
          >
            <Plus size={18} />
            <span>Upload</span>
          </button>
          
          <Link to="/settings" className="p-2 rounded-full hover:bg-muted-bg transition-colors text-muted">
            <SettingsIcon size={24} />
          </Link>
          
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-medium text-sm cursor-pointer shadow-sm">
            U
          </div>
        </div>
      </header>

      {/* Main Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-64 flex flex-col py-4 border-r border-border shrink-0 z-10 bg-background">
          <div className="flex flex-col gap-1 flex-1">
            <NavLink to="/" icon={Image} label="Photos" />
            <NavLink to="/album" icon={FolderOpen} label="Albums" />
            <NavLink to="/favorites" icon={Star} label="Favorites" />
            <NavLink to="/trash" icon={Trash2} label="Trash" />
          </div>

          <button
            onClick={handleSignOut}
            className="flex items-center gap-4 px-6 py-3 rounded-r-full mr-4 hover:bg-red-50 text-red-600 transition-colors mt-auto"
          >
            <LogOut size={20} />
            <span>Sign Out</span>
          </button>
        </nav>

        {/* Main Content */}
        <main className="flex-1 overflow-auto bg-background relative z-0">{children}</main>
      </div>

      <UploadQueue />
    </div>
  );
}

/**
 * AuthGuard — on first render, checks whether the user is authenticated.
 * - Not authenticated → /login
 * - Authenticated → /setup  (Setup page will then call setupStorage and navigate to /)
 * - Already on /login or /setup → pass through
 */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Already on a full-screen route — don't interfere
    if (FULL_SCREEN_ROUTES.includes(location.pathname)) {
      setChecking(false);
      return;
    }

    // Guard: window.electronAPI is only available inside Electron (preload)
    if (!window.electronAPI) {
      setChecking(false);
      return;
    }

    window.electronAPI
      .checkAuth()
      .then(({ authenticated }) => {
        if (!authenticated) {
          navigate('/login', { replace: true });
        } else {
          // Redirect to setup so we always run the channel check / restore flow
          navigate('/setup', { replace: true });
        }
      })
      .catch(() => {
        navigate('/login', { replace: true });
      })
      .finally(() => {
        setChecking(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (checking) {
    return (
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100vh',
          backgroundColor: 'var(--bg-app)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 32, height: 32,
              border: '3px solid var(--border-color)',
              borderTopColor: 'var(--color-primary)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Connecting to Telegram…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function App() {
  // Theme is managed entirely by AppearanceContext which sets data-theme on <html>.
  // No local theme state needed here.

  return (
    <Router>
      <AuthGuard>
        <AppLayout>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/" element={<Gallery />} />
            <Route path="/album" element={<Album />} />
            <Route path="/album/:id" element={<AlbumDetail />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/trash" element={<Trash />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </AppLayout>
      </AuthGuard>
    </Router>
  );
}

export default App;
