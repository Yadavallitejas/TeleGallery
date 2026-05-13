import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Camera, Grid3X3, BookImage, Heart, Trash2, LogOut } from 'lucide-react';

interface SidebarProps {
  onSignOut: () => void;
}

export default function Sidebar({ onSignOut }: SidebarProps) {
  const location = useLocation();
  const [counts, setCounts] = useState({ photos: 0, favorites: 0, trash: 0 });

  useEffect(() => {
    if (!window.electronAPI) return;

    // Load counts for badges
    const loadCounts = async () => {
      try {
        const [photos, favorites, trash] = await Promise.all([
          window.electronAPI.getPhotos(),
          window.electronAPI.getFavorites(),
          window.electronAPI.getTrash(),
        ]);
        setCounts({
          photos: Array.isArray(photos) ? photos.length : 0,
          favorites: Array.isArray(favorites) ? favorites.length : 0,
          trash: Array.isArray(trash) ? trash.length : 0,
        });
      } catch {
        // non-fatal
      }
    };

    loadCounts();

    // Refresh counts after uploads
    const unsub = window.electronAPI.onUploadComplete(loadCounts);
    return () => window.electronAPI.offUploadComplete(unsub);
  }, []);

  const navItems: {
    to: string;
    icon: React.ElementType;
    label: string;
    count?: number;
    showCountWhenZero?: boolean;
  }[] = [
    { to: '/',          icon: Grid3X3,   label: 'Photos',    count: counts.photos,    showCountWhenZero: true  },
    { to: '/album',     icon: BookImage, label: 'Albums'                                                        },
    { to: '/favorites', icon: Heart,     label: 'Favorites', count: counts.favorites, showCountWhenZero: false },
    { to: '/trash',     icon: Trash2,    label: 'Trash',     count: counts.trash,     showCountWhenZero: false },
  ];

  return (
    <nav
      style={{
        width: 'var(--sidebar-width)',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-color)',
        height: '100%',
        zIndex: 10,
        overflowY: 'auto',
      }}
    >
      {/* Logo / Brand */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '20px 20px 16px 20px',
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <Camera size={20} color="#fff" />
        </div>
        <span
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '-0.3px',
          }}
        >
          TeleGallery
        </span>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border-color)', margin: '0 16px 8px 16px' }} />

      {/* Nav Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, padding: '4px 0' }}>
        {navItems.map(({ to, icon: Icon, label, count, showCountWhenZero }) => {
          const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
          const showBadge = count !== undefined && (showCountWhenZero || count > 0);

          return (
            <Link
              key={to}
              to={to}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '9px 16px 9px 20px',
                marginRight: 12,
                borderRadius: '0 24px 24px 0',
                textDecoration: 'none',
                transition: 'background-color var(--transition-fast), color var(--transition-fast)',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--color-primary)' : 'var(--text-primary)',
                backgroundColor: isActive ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent',
                position: 'relative',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-surface-hover)';
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                }
              }}
            >
              <Icon
                size={20}
                color={isActive ? 'var(--color-primary)' : 'var(--text-secondary)'}
                strokeWidth={isActive ? 2.2 : 1.8}
              />
              <span style={{ fontSize: 14, flex: 1 }}>{label}</span>
              {showBadge && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: isActive ? 'var(--color-primary)' : 'var(--text-secondary)',
                    backgroundColor: isActive
                      ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)'
                      : 'color-mix(in srgb, var(--text-secondary) 12%, transparent)',
                    padding: '1px 7px',
                    borderRadius: 999,
                    minWidth: 20,
                    textAlign: 'center',
                    lineHeight: '18px',
                  }}
                >
                  {count!.toLocaleString()}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border-color)', margin: '8px 16px' }} />

      {/* Sign Out */}
      <div style={{ padding: '4px 0 16px 0' }}>
        <button
          onClick={onSignOut}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            width: '100%',
            padding: '9px 16px 9px 20px',
            marginRight: 12,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--color-danger)',
            fontSize: 14,
            fontWeight: 500,
            borderRadius: '0 24px 24px 0',
            transition: 'background-color var(--transition-fast)',
            textAlign: 'left',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'color-mix(in srgb, var(--color-danger) 10%, transparent)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
          }}
        >
          <LogOut size={20} color="var(--color-danger)" strokeWidth={1.8} />
          <span>Sign Out</span>
        </button>
      </div>
    </nav>
  );
}
