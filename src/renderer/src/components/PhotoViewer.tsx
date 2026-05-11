import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight,
  Heart, Trash2, Info, Share2, Copy, FolderOpen, FolderPlus,
  Play, Volume2, VolumeX, Maximize2
} from 'lucide-react';

export interface Photo {
  id: string;
  thumb_url?: string;
  file_name?: string;
  original_filename?: string;
  media_type?: string;
  size_bytes?: number;
  date_taken?: number;
  date_taken_iso?: string;
  is_favorite?: number | boolean;
  file_id?: string;
}

interface PhotoViewerProps {
  photo?: Photo;          // legacy: single photo
  photos: Photo[];
  initialIndex?: number;  // legacy: open at index
  onClose: () => void;
  onDelete?: (id: string) => void;
  onMoveToTrash?: (photoIds: string[]) => void;  // legacy alias
  onToggleFavorite?: (id: string, current: boolean) => void;
  onAddToAlbum?: (photoId: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isVideo = (photo: Photo) =>
  photo.media_type === 'video' ||
  /\.(mp4|mov|avi|mkv|webm|m4v|wmv|flv|3gp)$/i.test(
    photo.file_name || photo.original_filename || ''
  );

const formatBytes = (bytes?: number) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (photo: Photo) => {
  const d = photo.date_taken_iso
    ? new Date(photo.date_taken_iso)
    : photo.date_taken
    ? new Date(photo.date_taken * 1000)
    : null;
  return d ? d.toLocaleString() : '';
};

// ─── Toast ────────────────────────────────────────────────────────────────────

const Toast: React.FC<{ message: string; type?: 'success' | 'error' }> = ({
  message,
  type = 'success',
}) => (
  <div
    style={{
      position: 'fixed',
      bottom: 80,
      left: '50%',
      transform: 'translateX(-50%)',
      background: type === 'success' ? 'rgba(34,197,94,0.92)' : 'rgba(239,68,68,0.92)',
      color: '#fff',
      padding: '10px 24px',
      borderRadius: 10,
      fontWeight: 600,
      fontSize: 14,
      zIndex: 10001,
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      backdropFilter: 'blur(6px)',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
    }}
  >
    {message}
  </div>
);

// ─── Component ────────────────────────────────────────────────────────────────

const PhotoViewer: React.FC<PhotoViewerProps> = ({
  photo: propPhoto,
  photos,
  initialIndex,
  onClose,
  onDelete,
  onMoveToTrash,
  onToggleFavorite,
  onAddToAlbum,
}) => {
  const [currentIndex, setCurrentIndex] = useState(() => {
    // Support both prop styles: initialIndex (legacy) or matching by photo.id
    if (initialIndex !== undefined) return Math.max(0, Math.min(initialIndex, photos.length - 1));
    if (propPhoto) return Math.max(0, photos.findIndex((p) => p.id === propPhoto.id));
    return 0;
  });
  const photo = photos[currentIndex] ?? propPhoto ?? photos[0];
  const vid = isVideo(photo);

  // ── image transform state ──
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const isDragging = useRef(false);
  const dragOrigin = useRef({ x: 0, y: 0, px: 0, py: 0 });

  // ── video state ──
  const [muted, setMuted] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // ── UI state ──
  const [showInfo, setShowInfo] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [isFav, setIsFav] = useState<boolean>(!!photo.is_favorite);
  const containerRef = useRef<HTMLDivElement>(null);

  // reset transform + video state when photo changes
  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setPanX(0);
    setPanY(0);
    setIsFav(!!photo.is_favorite);
    setVideoUrl(null);
    setVideoError(null);
    setVideoLoading(false);
  }, [photo.id]);

  // Fetch video URL from main process when viewing a video
  useEffect(() => {
    if (!vid) return;
    setVideoLoading(true);
    setVideoUrl(null);
    setVideoError(null);
    window.electronAPI.requestVideo(photo.id).then((res) => {
      if (res.url) {
        setVideoUrl(res.url);
      } else {
        setVideoError(res.error || 'Could not load video');
      }
      setVideoLoading(false);
    });
  }, [photo.id, vid]);

  // close on Escape, arrow nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') navigate(1);
      if (e.key === 'ArrowLeft') navigate(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2200);
  };

  const navigate = (dir: number) => {
    setCurrentIndex((i) => (i + dir + photos.length) % photos.length);
  };

  // ── zoom helpers ──
  const zoomIn = () => setZoom((z) => Math.min(z * 1.4, 6));
  const zoomOut = () => {
    setZoom((z) => {
      const next = Math.max(z / 1.4, 0.5);
      if (next <= 1) { setPanX(0); setPanY(0); }
      return next;
    });
  };
  const resetTransform = () => { setZoom(1); setRotation(0); setPanX(0); setPanY(0); };

  // ── wheel zoom ──
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (vid) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => {
      const next = Math.min(Math.max(z * factor, 0.5), 6);
      if (next <= 1) { setPanX(0); setPanY(0); }
      return next;
    });
  }, [vid]);

  // ── drag to pan ──
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1 || vid) return;
    e.preventDefault();
    isDragging.current = true;
    dragOrigin.current = { x: e.clientX, y: e.clientY, px: panX, py: panY };
  };
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setPanX(dragOrigin.current.px + (e.clientX - dragOrigin.current.x));
    setPanY(dragOrigin.current.py + (e.clientY - dragOrigin.current.y));
  }, []);
  const handleMouseUp = () => { isDragging.current = false; };

  // double-click to zoom or reset
  const handleDblClick = () => {
    if (vid) return;
    zoom > 1 ? resetTransform() : zoomIn();
  };

  // ── actions ──
  const handleShare = async () => {
    const res = await window.electronAPI.showInFolder(photo.id);
    if (res.success) showToast('📂 File revealed in Explorer — right-click to share!');
    else showToast('Could not locate file', 'error');
  };

  const handleCopy = async () => {
    const res = await window.electronAPI.copyToClipboard(photo.id);
    if (res.success) showToast('✅ Copied to clipboard!');
    else showToast('Could not copy — ' + (res.error || 'unknown error'), 'error');
  };

  const handleShowInFolder = async () => {
    const res = await window.electronAPI.showInFolder(photo.id);
    if (res.success) showToast('📂 Opened in Explorer');
    else showToast('Could not open folder', 'error');
  };

  const handleFav = async () => {
    const next = !isFav;
    setIsFav(next);
    await onToggleFavorite?.(photo.id, !next);
    showToast(next ? '❤️ Added to Favorites' : '💔 Removed from Favorites');
  };

  const handleDelete = async () => {
    if (onMoveToTrash) {
      await onMoveToTrash([photo.id]);
    } else {
      onDelete?.(photo.id);
    }
    if (photos.length <= 1) { onClose(); return; }
    navigate(currentIndex >= photos.length - 1 ? -1 : 1);
  };

  const handleAddToAlbum = () => onAddToAlbum?.(photo.id);

  // ─────────────────────────────────────────────────────────────────── render

  const imgTransform = `translate(${panX}px, ${panY}px) scale(${zoom}) rotate(${rotation}deg)`;
  const filename = photo.original_filename || photo.file_name || 'Untitled';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.96)',
        display: 'flex', flexDirection: 'column',
        userSelect: 'none',
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* ── Top bar ── */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 16px',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)',
          flexShrink: 0, zIndex: 1,
        }}
      >
        {/* Close */}
        <button onClick={onClose} title="Close (Esc)" style={btnStyle}>
          <X size={20} />
        </button>

        {/* Filename + index */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            color: '#fff', fontWeight: 600, fontSize: 14,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {filename}
          </div>
          <div style={{ color: '#999', fontSize: 12 }}>
            {currentIndex + 1} / {photos.length}
            {photo.size_bytes ? ` · ${formatBytes(photo.size_bytes)}` : ''}
          </div>
        </div>

        {/* ── Shared actions (ALL files) ── */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <ActionBtn icon={<Share2 size={17} />} label="Share / Reveal in Explorer" onClick={handleShare} />
          <ActionBtn icon={<Copy size={17} />} label="Copy to clipboard" onClick={handleCopy} />
          <ActionBtn icon={<FolderOpen size={17} />} label="Show in folder" onClick={handleShowInFolder} />
          {onAddToAlbum && (
            <ActionBtn icon={<FolderPlus size={17} />} label="Add to album" onClick={handleAddToAlbum} />
          )}

          {/* ── Image-only controls ── */}
          {!vid && (
            <>
              <Divider />
              <ActionBtn icon={<ZoomIn size={17} />} label="Zoom in" onClick={zoomIn} />
              <ActionBtn icon={<ZoomOut size={17} />} label="Zoom out" onClick={zoomOut} />
              <ActionBtn
                icon={<RotateCw size={17} />}
                label="Rotate"
                onClick={() => setRotation((r) => r + 90)}
              />
            </>
          )}

          {/* ── Video-only controls ── */}
          {vid && (
            <>
              <Divider />
              <ActionBtn
                icon={muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                label={muted ? 'Unmute' : 'Mute'}
                onClick={() => {
                  setMuted((m) => !m);
                  if (videoRef.current) videoRef.current.muted = !muted;
                }}
              />
              <ActionBtn
                icon={<Maximize2 size={17} />}
                label="Fullscreen"
                onClick={() => videoRef.current?.requestFullscreen?.()}
              />
            </>
          )}

          <Divider />
          <ActionBtn
            icon={<Heart size={17} fill={isFav ? '#f43f5e' : 'none'} color={isFav ? '#f43f5e' : '#fff'} />}
            label={isFav ? 'Remove from favorites' : 'Add to favorites'}
            onClick={handleFav}
            active={isFav}
          />
          <ActionBtn icon={<Trash2 size={17} />} label="Move to trash" onClick={handleDelete} danger />
          <ActionBtn
            icon={<Info size={17} />}
            label="Info"
            onClick={() => setShowInfo((s) => !s)}
            active={showInfo}
          />
        </div>
      </div>

      {/* ── Main viewer area ── */}
      <div
        ref={containerRef}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', position: 'relative',
        }}
        onWheel={handleWheel}
      >
        {/* Left arrow */}
        {photos.length > 1 && (
          <button
            onClick={() => navigate(-1)}
            style={{
              ...arrowBtnStyle,
              left: 12,
            }}
          >
            <ChevronLeft size={28} />
          </button>
        )}

        {/* Media */}
        {vid ? (
          videoLoading ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
              color: '#94a3b8',
            }}>
              <div style={{
                width: 48, height: 48, border: '4px solid #334155',
                borderTopColor: '#3b82f6', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              <span style={{ fontSize: 14 }}>Downloading video…</span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : videoError ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
              color: '#f87171', maxWidth: 300, textAlign: 'center',
            }}>
              <Play size={48} strokeWidth={1} color="#f87171" />
              <span style={{ fontSize: 14 }}>{videoError}</span>
              <button
                onClick={() => {
                  setVideoLoading(true);
                  setVideoError(null);
                  window.electronAPI.requestVideo(photo.id).then((res) => {
                    if (res.url) setVideoUrl(res.url);
                    else setVideoError(res.error || 'Could not load video');
                    setVideoLoading(false);
                  });
                }}
                style={{
                  background: '#3b82f6', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 13,
                }}
              >
                Retry
              </button>
            </div>
          ) : videoUrl ? (
            <video
              ref={videoRef}
              key={videoUrl}
              src={videoUrl}
              controls
              autoPlay
              muted={muted}
              style={{
                maxWidth: '92%', maxHeight: '92%',
                borderRadius: 8,
                boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
                outline: 'none',
              }}
            />
          ) : null
        ) : (
          <img
            key={photo.id}
            src={photo.thumb_url || ''}
            alt={filename}
            draggable={false}
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDblClick}
            style={{
              maxWidth: zoom > 1 ? 'none' : '100%',
              maxHeight: zoom > 1 ? 'none' : '100%',
              objectFit: 'contain',
              transform: imgTransform,
              transformOrigin: 'center center',
              transition: isDragging.current ? 'none' : 'transform 0.08s ease',
              cursor: zoom > 1 ? (isDragging.current ? 'grabbing' : 'grab') : 'zoom-in',
              borderRadius: 4,
              boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
              userSelect: 'none',
              // @ts-ignore — Webkit vendor prop
              WebkitUserDrag: 'none',
            }}
          />
        )}

        {/* Right arrow */}
        {photos.length > 1 && (
          <button
            onClick={() => navigate(1)}
            style={{
              ...arrowBtnStyle,
              right: 12,
            }}
          >
            <ChevronRight size={28} />
          </button>
        )}

        {/* Zoom badge */}
        {!vid && zoom !== 1 && (
          <div
            onClick={resetTransform}
            title="Click to reset"
            style={{
              position: 'absolute', bottom: 16, left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.65)',
              color: '#fff', padding: '4px 14px',
              borderRadius: 20, fontSize: 13, cursor: 'pointer',
              backdropFilter: 'blur(4px)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            {Math.round(zoom * 100)}% — click to reset
          </div>
        )}
      </div>

      {/* ── Info panel ── */}
      {showInfo && (
        <div
          style={{
            position: 'absolute', top: 60, right: 0,
            width: 280, background: 'rgba(15,15,15,0.96)',
            backdropFilter: 'blur(12px)',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
            padding: '20px 18px', color: '#ddd',
            fontSize: 13, lineHeight: 1.7,
            overflowY: 'auto', maxHeight: 'calc(100vh - 80px)',
          }}
        >
          <div style={{ fontWeight: 700, color: '#fff', marginBottom: 12, fontSize: 15 }}>
            File Info
          </div>
          <InfoRow label="Name" value={filename} />
          <InfoRow label="Type" value={vid ? 'Video' : 'Image'} />
          <InfoRow label="Size" value={formatBytes(photo.size_bytes) || '—'} />
          <InfoRow label="Date" value={formatDate(photo) || '—'} />
          <InfoRow label="ID" value={photo.id?.slice(0, 16) + '…'} />
        </div>
      )}

      {/* ── Thumbnail strip (bottom) ── */}
      {photos.length > 1 && (
        <div
          style={{
            display: 'flex', gap: 6, padding: '8px 12px',
            background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
            overflowX: 'auto', flexShrink: 0,
            scrollbarWidth: 'thin',
          }}
        >
          {photos.map((p, i) => (
            <div
              key={p.id}
              onClick={() => setCurrentIndex(i)}
              style={{
                width: 54, height: 54, flexShrink: 0,
                borderRadius: 6,
                overflow: 'hidden',
                border: i === currentIndex ? '2px solid #3b82f6' : '2px solid transparent',
                cursor: 'pointer', opacity: i === currentIndex ? 1 : 0.55,
                transition: 'opacity 0.15s, border-color 0.15s',
              }}
            >
              {isVideo(p) ? (
                <div
                  style={{
                    width: '100%', height: '100%',
                    background: '#1e293b',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Play size={20} color="#94a3b8" />
                </div>
              ) : (
                <img
                  src={p.thumb_url || ''}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && <Toast message={toast.msg} type={toast.type} />}
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const ActionBtn: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}> = ({ icon, label, onClick, active, danger }) => (
  <button
    onClick={onClick}
    title={label}
    style={{
      background: active ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)',
      border: active ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.08)',
      color: danger ? '#f87171' : active ? '#60a5fa' : '#e2e8f0',
      borderRadius: 8,
      width: 34, height: 34,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer',
      transition: 'background 0.15s, transform 0.1s',
      flexShrink: 0,
    }}
    onMouseEnter={(e) => {
      (e.currentTarget as HTMLButtonElement).style.background = danger
        ? 'rgba(239,68,68,0.2)'
        : active
        ? 'rgba(59,130,246,0.45)'
        : 'rgba(255,255,255,0.14)';
      (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)';
    }}
    onMouseLeave={(e) => {
      (e.currentTarget as HTMLButtonElement).style.background = active
        ? 'rgba(59,130,246,0.3)'
        : 'rgba(255,255,255,0.06)';
      (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
    }}
  >
    {icon}
  </button>
);

const Divider = () => (
  <div
    style={{
      width: 1, height: 22,
      background: 'rgba(255,255,255,0.12)',
      margin: '0 2px',
      flexShrink: 0,
    }}
  />
);

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
    <span style={{ color: '#64748b', minWidth: 48 }}>{label}</span>
    <span style={{ color: '#e2e8f0', wordBreak: 'break-all' }}>{value}</span>
  </div>
);

// ─── Shared styles ────────────────────────────────────────────────────────────

const btnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#e2e8f0',
  borderRadius: 8,
  width: 34, height: 34,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer',
  flexShrink: 0,
};

const arrowBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%', transform: 'translateY(-50%)',
  background: 'rgba(0,0,0,0.55)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff',
  borderRadius: '50%',
  width: 46, height: 46,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer',
  zIndex: 2,
  backdropFilter: 'blur(4px)',
  transition: 'background 0.15s',
};

export default PhotoViewer;
