import { useEffect, useState } from 'react';
import {
  HashRouter as Router,
  Routes,
  Route,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { Search, Plus, RefreshCcw, CheckCircle2, AlertCircle } from 'lucide-react';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Gallery from './pages/Gallery';
import Settings from './pages/Settings';
import UploadQueue from './components/UploadQueue';
import ProfileMenu from './components/ProfileMenu';
import Sidebar from './components/Sidebar';
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
  const [profile, setProfile] = useState<{ url?: string | null; firstName?: string; lastName?: string } | null>(null);

  useEffect(() => {
    if (isFullScreen) return;
    if (!window.electronAPI) return; // Guard: not in Electron context

    // Check App Lock
    window.electronAPI.getSetting('app_lock_enabled').then(enabled => {
      if (enabled) {
        setIsLocked(true);
        window.electronAPI.getProfilePhoto().then(p => {
          if (!p.error) setProfile(p);
        }).catch(() => {});
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
    const initial = profile?.firstName?.[0]?.toUpperCase() ?? 'U';
    const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || 'User';

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
            width: 96, height: 96,
            backgroundColor: 'var(--color-primary)',
            color: '#fff',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-md)',
            border: '4px solid var(--bg-surface)'
          }}
        >
          {profile?.url ? (
            <img src={profile.url} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 36, fontWeight: 700 }}>{initial}</span>
          )}
        </div>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{fullName}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>App Locked</p>
        </div>
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



  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: 'var(--bg-app)',
        color: 'var(--text-primary)',
        overflow: 'hidden',
      }}
    >
      {/* Top Navigation Bar */}
      <header
        style={{
          height: 'var(--navbar-height)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          borderBottom: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-app)',
          zIndex: 20,
          flexShrink: 0,
          gap: 16,
        }}
      >
        {/* Search Bar — single instance, wired to ?q= URL param */}
        <div style={{ flex: 1, maxWidth: 640 }}>
          <div style={{ position: 'relative' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-secondary)',
                pointerEvents: 'none',
              }}
            />
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
              style={{
                display: 'block',
                width: '100%',
                paddingLeft: 36,
                paddingRight: 12,
                paddingTop: 8,
                paddingBottom: 8,
                border: '1px solid var(--border-color)',
                borderRadius: 24,
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: 14,
                outline: 'none',
                transition: 'box-shadow var(--transition-fast), border-color var(--transition-fast)',
              }}
              onFocus={e => {
                e.currentTarget.style.boxShadow = '0 0 0 2px color-mix(in srgb, var(--color-primary) 30%, transparent)';
                e.currentTarget.style.borderColor = 'var(--color-primary)';
              }}
              onBlur={e => {
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.borderColor = 'var(--border-color)';
              }}
              placeholder="Search your photos…"
            />
          </div>
        </div>

        {/* Actions & Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {syncState && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 500,
                backgroundColor: 'var(--bg-surface)',
                padding: '4px 12px',
                borderRadius: 999,
                border: '1px solid var(--border-color)',
              }}
            >
              {syncState.progress < 100 && syncState.status !== 'Sync failed' ? (
                <RefreshCcw size={13} style={{ color: '#1a73e8', animation: 'spin 1s linear infinite' }} />
              ) : syncState.status === 'Sync failed' ? (
                <AlertCircle size={13} style={{ color: 'var(--color-danger)' }} />
              ) : (
                <CheckCircle2 size={13} style={{ color: 'var(--color-success)' }} />
              )}
              <span style={{ color: 'var(--text-secondary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {syncState.status}
              </span>
            </div>
          )}

          <button
            onClick={handleUpload}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              backgroundColor: 'var(--color-primary)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background-color var(--transition-fast)',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
          >
            <Plus size={17} />
            <span>Upload</span>
          </button>

          <ProfileMenu
            onSignOut={handleSignOut}
            onLock={undefined}
          />
        </div>
      </header>

      {/* Main Area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <Sidebar onSignOut={handleSignOut} />

        {/* Main Content */}
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            backgroundColor: 'var(--bg-app)',
            position: 'relative',
            zIndex: 0,
          }}
        >
          {children}
        </main>
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
