import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, LogOut, Lock, ChevronRight } from 'lucide-react';

interface ProfileInfo {
  url?: string | null;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

interface ProfileMenuProps {
  onSignOut: () => void;
  onLock?: () => void;
}

export default function ProfileMenu({ onSignOut, onLock }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Load profile info when first opened
  useEffect(() => {
    if (!open || profile || loadingProfile) return;
    setLoadingProfile(true);
    window.electronAPI.getProfilePhoto()
      .then(res => {
        if (!res.error) setProfile(res);
      })
      .catch(() => {})
      .finally(() => setLoadingProfile(false));
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const initial = profile?.firstName?.[0]?.toUpperCase() ?? 'U';
  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || 'User';

  const handleSettings = () => { setOpen(false); navigate('/settings'); };
  const handleLock = () => { setOpen(false); onLock?.(); };
  const handleSignOut = () => { setOpen(false); onSignOut(); };

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      {/* Avatar button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Profile"
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          background: 'var(--color-primary)',
          border: open ? '2px solid var(--color-primary)' : '2px solid transparent',
          boxShadow: open ? '0 0 0 3px rgba(26,115,232,0.25)' : 'none',
          cursor: 'pointer',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'box-shadow 0.15s, border-color 0.15s',
          padding: 0,
          flexShrink: 0,
        }}
      >
        {profile?.url ? (
          <img
            src={profile.url}
            alt="Profile"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14, letterSpacing: 0 }}>
            {initial}
          </span>
        )}
      </button>

      {/* Dropdown card */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            width: 240,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 14,
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            zIndex: 9999,
            overflow: 'hidden',
            animation: 'profileMenuIn 0.15s ease',
          }}
        >
          <style>{`
            @keyframes profileMenuIn {
              from { opacity: 0; transform: translateY(-6px) scale(0.97); }
              to   { opacity: 1; transform: translateY(0)  scale(1); }
            }
          `}</style>

          {/* Profile header */}
          <div
            style={{
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              background: 'linear-gradient(135deg, rgba(26,115,232,0.08) 0%, transparent 100%)',
              borderBottom: '1px solid var(--border-color)',
            }}
          >
            {/* Large avatar */}
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'var(--color-primary)',
                border: '3px solid rgba(26,115,232,0.2)',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {loadingProfile ? (
                <span style={{
                  display: 'block', width: 20, height: 20,
                  border: '3px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff',
                  borderRadius: '50%',
                  animation: 'profileMenuSpin 0.7s linear infinite',
                }} />
              ) : profile?.url ? (
                <img
                  src={profile.url}
                  alt="Profile"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ color: '#fff', fontWeight: 800, fontSize: 26 }}>{initial}</span>
              )}
            </div>
            <style>{`@keyframes profileMenuSpin { to { transform: rotate(360deg); } }`}</style>

            {/* Name and phone */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontWeight: 700,
                fontSize: 15,
                color: 'var(--text-primary)',
                lineHeight: 1.3,
              }}>
                {loadingProfile ? '…' : fullName}
              </div>
              {profile?.phone && (
                <div style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  marginTop: 2,
                }}>
                  {profile.phone}
                </div>
              )}
            </div>
          </div>

          {/* Menu items */}
          <div style={{ padding: '6px 0' }}>
            <MenuItem
              icon={<Settings size={16} />}
              label="Settings"
              onClick={handleSettings}
            />
            {onLock && (
              <MenuItem
                icon={<Lock size={16} />}
                label="Lock App"
                onClick={handleLock}
              />
            )}
          </div>

          {/* Divider + Sign Out */}
          <div style={{ borderTop: '1px solid var(--border-color)', padding: '6px 0' }}>
            <MenuItem
              icon={<LogOut size={16} />}
              label="Sign Out"
              onClick={handleSignOut}
              danger
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small menu row ────────────────────────────────────────────────────────────
function MenuItem({
  icon, label, onClick, danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 16px',
        background: hovered
          ? danger ? 'rgba(239,68,68,0.08)' : 'var(--bg-hover)'
          : 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: danger ? '#ef4444' : 'var(--text-primary)',
        fontSize: 13,
        fontWeight: 500,
        textAlign: 'left',
        transition: 'background 0.12s',
      }}
    >
      <span style={{ opacity: danger ? 1 : 0.7, flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      <ChevronRight size={14} style={{ opacity: 0.3 }} />
    </button>
  );
}
