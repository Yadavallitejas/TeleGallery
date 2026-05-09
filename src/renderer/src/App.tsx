import { useEffect, useState } from 'react';
import {
  HashRouter as Router,
  Routes,
  Route,
  Link,
  useLocation,
  useNavigate,
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
      <div className="w-full h-screen bg-background flex flex-col items-center justify-center space-y-6">
        <div className="w-20 h-20 bg-primary/20 text-primary rounded-full flex items-center justify-center">
          <Shield size={40} />
        </div>
        <h1 className="text-3xl font-bold text-foreground">App Locked</h1>
        <p className="text-muted text-center max-w-sm">
          TeleGallery is protected with Windows Hello. Please authenticate to continue.
        </p>
        <button onClick={triggerUnlock} className="px-8 py-3 bg-primary text-white font-medium rounded-xl hover:bg-primary/90 transition-colors">
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

        {/* Search Bar (Placeholder) */}
        <div className="flex-1 max-w-2xl px-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-muted" />
            </div>
            <input
              type="text"
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
      <div className="flex items-center justify-center h-screen bg-[#0b0f1a]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-white/40">Connecting to Telegram…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function App() {
  const [theme] = useState<'dark' | 'light'>('light');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

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
