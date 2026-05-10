import { useEffect, useState, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Heart,
  Trash2,
  Info,
  ImageIcon,
  Video,
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
} from 'lucide-react';

export interface Photo {
  id: string;
  url: string | null;
  thumb_url?: string | null;
  date: string;
  width: number;
  height: number;
  album?: string;
  size_bytes?: number;
  filename?: string;
  tgFileId?: string;
  file_id?: string;
  is_favorite?: boolean;
  date_taken?: number;
  isVideo?: boolean;
  local_thumb_path?: string;
}

interface PhotoViewerProps {
  photos: Photo[];
  initialIndex: number;
  onClose: () => void;
  onToggleFavorite?: (photoId: string, isFav: boolean) => void;
  onMoveToTrash?: (photoIds: string[]) => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(photo: Photo): string {
  if (photo.date_taken) {
    return new Date(photo.date_taken * 1000).toLocaleString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }
  if (photo.date) {
    const d = new Date(photo.date);
    if (!isNaN(d.getTime())) return d.toLocaleString();
  }
  return '—';
}

const isVideoFile = (filename?: string) =>
  !!filename && /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(filename);

export default function PhotoViewer({ photos, initialIndex, onClose, onToggleFavorite, onMoveToTrash }: PhotoViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showInfo, setShowInfo] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [loadingPhotoId, setLoadingPhotoId] = useState<string | null>(null);
  const [errorPhotoIds, setErrorPhotoIds] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const currentPhoto = photos[currentIndex];

  const resetTransform = () => { setZoom(1); setRotation(0); };

  const goTo = useCallback((idx: number) => {
    if (idx < 0 || idx >= photos.length) return;
    setCurrentIndex(idx);
    resetTransform();
  }, [photos.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape': onClose(); break;
        case 'ArrowLeft': goTo(currentIndex - 1); break;
        case 'ArrowRight': goTo(currentIndex + 1); break;
        case 'i': case 'I': setShowInfo(prev => !prev); break;
        case '+': case '=': setZoom(z => Math.min(4, z + 0.25)); break;
        case '-': setZoom(z => Math.max(0.5, z - 0.25)); break;
        case '0': resetTransform(); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, goTo, onClose]);

  // Auto-hide controls after 3 s
  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    resetControlsTimeout();
    return () => { if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); };
  }, [currentIndex, resetControlsTimeout]);

  // Fetch from Telegram if local thumb is missing
  const fetchThumb = useCallback(async (photo: Photo) => {
    if (loadingPhotoId === photo.id) return;
    if (errorPhotoIds.has(photo.id)) return;
    setLoadingPhotoId(photo.id);
    try {
      const result = await window.electronAPI.downloadThumb(photo.id, photo.file_id || '');
      if (result?.url) {
        // Update the photo's url in-place so it renders
        photo.url = result.url;
        setLoadingPhotoId(null);
      } else {
        setErrorPhotoIds(prev => new Set([...prev, photo.id]));
        setLoadingPhotoId(null);
      }
    } catch {
      setErrorPhotoIds(prev => new Set([...prev, photo.id]));
      setLoadingPhotoId(null);
    }
  }, [loadingPhotoId, errorPhotoIds]);

  useEffect(() => {
    if (currentPhoto && !currentPhoto.url) {
      fetchThumb(currentPhoto);
    }
  }, [currentIndex]);

  const handleDownload = async () => {
    const p = currentPhoto;
    if (p.url) {
      window.electronAPI.openExternal(p.url);
    } else {
      const result = await window.electronAPI.downloadThumb(p.id, p.file_id || '');
      if (result?.url) window.electronAPI.openExternal(result.url);
    }
  };

  const toggleFav = () => {
    if (!currentPhoto || !onToggleFavorite) return;
    const newFav = !(favorites[currentPhoto.id] ?? currentPhoto.is_favorite);
    setFavorites(prev => ({ ...prev, [currentPhoto.id]: newFav }));
    onToggleFavorite(currentPhoto.id, newFav);
  };

  const isFav = currentPhoto ? (favorites[currentPhoto.id] ?? currentPhoto.is_favorite) : false;
  const isLoading = currentPhoto && loadingPhotoId === currentPhoto.id;
  const isError = currentPhoto && errorPhotoIds.has(currentPhoto.id);
  const isVid = currentPhoto && isVideoFile(currentPhoto.filename);
  const displayUrl = currentPhoto?.url;

  if (!currentPhoto) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex bg-black"
      onMouseMove={resetControlsTimeout}
    >
      {/* ── MAIN VIEWER ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top Bar */}
        <div
          className={`absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3
            bg-gradient-to-b from-black/80 via-black/30 to-transparent
            transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}
        >
          {/* Left: back + title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
              title="Close (Esc)"
            >
              <ArrowLeft size={22} />
            </button>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate" title={currentPhoto.filename || currentPhoto.id}>
                {currentPhoto.filename || 'Photo'}
              </p>
              <p className="text-xs text-white/50">{currentIndex + 1} / {photos.length}</p>
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => setZoom(z => Math.min(4, z + 0.25))} className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors" title="Zoom in (+)"><ZoomIn size={18} /></button>
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors" title="Zoom out (-)"><ZoomOut size={18} /></button>
            <button onClick={() => setRotation(r => (r + 90) % 360)} className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors" title="Rotate"><RotateCw size={18} /></button>
            <div className="w-px h-5 bg-white/20 mx-1" />
            <button onClick={handleDownload} className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors" title="Download"><Download size={18} /></button>
            <button
              onClick={toggleFav}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
              title={isFav ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Heart size={18} className={isFav ? 'text-red-500 fill-red-500' : 'text-white/70 hover:text-white'} />
            </button>
            <button
              onClick={() => { if (onMoveToTrash) { onMoveToTrash([currentPhoto.id]); onClose(); } }}
              className="p-2 text-white/70 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-colors"
              title="Move to trash"
            >
              <Trash2 size={18} />
            </button>
            <div className="w-px h-5 bg-white/20 mx-1" />
            <button
              onClick={() => setShowInfo(v => !v)}
              className={`p-2 rounded-full transition-colors ${showInfo ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
              title="Info (i)"
            >
              <Info size={18} />
            </button>
          </div>
        </div>

        {/* Image/Video Area */}
        <div className="flex-1 relative flex items-center justify-center overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center gap-4 text-white/50">
              <div className="w-10 h-10 border-4 border-white/20 border-t-white/80 rounded-full animate-spin" />
              <p className="text-sm">Loading…</p>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 text-white/40">
              <ImageIcon size={72} strokeWidth={0.75} />
              <p className="text-sm">{currentPhoto.filename || 'Preview unavailable'}</p>
              <button
                onClick={() => { setErrorPhotoIds(prev => { const next = new Set(prev); next.delete(currentPhoto.id); return next; }); fetchThumb(currentPhoto); }}
                className="text-xs px-4 py-1.5 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white/60"
              >
                Retry
              </button>
            </div>
          ) : displayUrl ? (
            isVid ? (
              <video
                src={displayUrl}
                controls
                autoPlay
                className="max-w-full max-h-full object-contain"
                style={{ transform: `scale(${zoom}) rotate(${rotation}deg)`, transition: 'transform 0.2s' }}
              />
            ) : (
              <img
                ref={imgRef}
                src={displayUrl}
                alt={currentPhoto.filename || ''}
                className="max-w-full max-h-full object-contain select-none"
                style={{ transform: `scale(${zoom}) rotate(${rotation}deg)`, transition: 'transform 0.2s', cursor: zoom > 1 ? 'grab' : 'default' }}
                draggable={false}
                onError={() => {
                  setErrorPhotoIds(prev => new Set([...prev, currentPhoto.id]));
                  fetchThumb(currentPhoto);
                }}
                onDoubleClick={() => setZoom(z => z === 1 ? 2 : 1)}
              />
            )
          ) : (
            <div className="flex flex-col items-center gap-3 text-white/40">
              {isVid ? <Video size={72} strokeWidth={0.75} /> : <ImageIcon size={72} strokeWidth={0.75} />}
              <p className="text-sm">{currentPhoto.filename || 'No preview'}</p>
            </div>
          )}

          {/* ← Prev button */}
          <button
            onClick={() => goTo(currentIndex - 1)}
            className={`absolute left-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/40 hover:bg-black/70 text-white backdrop-blur-sm transition-all ${
              currentIndex === 0 ? 'opacity-0 pointer-events-none' : showControls ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <ChevronLeft size={28} />
          </button>

          {/* → Next button */}
          <button
            onClick={() => goTo(currentIndex + 1)}
            className={`absolute right-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/40 hover:bg-black/70 text-white backdrop-blur-sm transition-all ${
              currentIndex === photos.length - 1 ? 'opacity-0 pointer-events-none' : showControls ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <ChevronRight size={28} />
          </button>
        </div>

        {/* Bottom Filmstrip */}
        <div className={`absolute bottom-0 left-0 right-0 pb-4 pt-10 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex items-center justify-center gap-1.5 px-4 overflow-x-auto scrollbar-hide">
            {photos.slice(Math.max(0, currentIndex - 7), Math.min(photos.length, currentIndex + 8)).map((p, idx) => {
              const realIdx = Math.max(0, currentIndex - 7) + idx;
              const isCurrent = realIdx === currentIndex;
              return (
                <button
                  key={p.id}
                  onClick={() => goTo(realIdx)}
                  className={`relative flex-shrink-0 rounded-sm overflow-hidden transition-all ${
                    isCurrent ? 'ring-2 ring-white scale-110 z-10' : 'opacity-50 hover:opacity-100 hover:scale-105'
                  }`}
                  style={{ width: 48, height: 48 }}
                >
                  {p.url ? (
                    <img src={p.url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-white/10 flex items-center justify-center">
                      <ImageIcon size={14} className="text-white/40" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── INFO PANEL (slides in from right) ───────────────────── */}
      {showInfo && (
        <div className="w-72 bg-[#111] border-l border-white/10 overflow-y-auto text-white flex flex-col animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <h2 className="font-semibold text-sm">Details</h2>
            <button onClick={() => setShowInfo(false)} className="p-1 text-white/40 hover:text-white rounded">
              <X size={16} />
            </button>
          </div>

          {/* Filename */}
          {currentPhoto.url && (
            <div className="m-4 rounded-lg overflow-hidden bg-white/5">
              <img src={currentPhoto.url} alt="" className="w-full aspect-square object-cover opacity-90" />
            </div>
          )}

          <div className="px-4 pb-6 space-y-5">
            <InfoSection title="File">
              <InfoRow label="Name" value={currentPhoto.filename || '—'} />
              <InfoRow label="Size" value={formatBytes(currentPhoto.size_bytes)} />
            </InfoSection>
            <InfoSection title="Details">
              <InfoRow label="Date taken" value={formatDate(currentPhoto)} />
              <InfoRow
                label="Dimensions"
                value={currentPhoto.width && currentPhoto.height
                  ? `${currentPhoto.width} × ${currentPhoto.height}`
                  : '—'}
              />
              <InfoRow label="Type" value={isVid ? 'Video' : 'Photo'} />
            </InfoSection>
            {currentPhoto.album && (
              <InfoSection title="Album">
                <InfoRow label="" value={currentPhoto.album} />
              </InfoSection>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      {title && <p className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-2">{title}</p>}
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      {label && <span className="text-[11px] text-white/40">{label}</span>}
      <span className="text-sm text-white/80 break-words">{value}</span>
    </div>
  );
}
