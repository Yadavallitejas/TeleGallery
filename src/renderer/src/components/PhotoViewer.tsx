import { useEffect, useState, useRef } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderPlus,
  Heart,
  MoreVertical,
  Trash2,
  Info,
  ImageIcon,
} from 'lucide-react';

export interface Photo {
  id: string;
  url: string | null;
  date: string;
  width: number;
  height: number;
  album?: string;
  /** File size in bytes (from DB) */
  size_bytes?: number;
  /** Original filename */
  filename?: string;
  /** Telegram file ID (used to fetch full-res on demand) */
  tgFileId?: string;
  file_id?: string;
  is_favorite?: boolean;
  /** Unix timestamp (seconds) */
  date_taken?: number;
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
  // Prefer unix timestamp (seconds) → convert to ms
  if (photo.date_taken) {
    return new Date(photo.date_taken * 1000).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }
  if (photo.date) {
    const d = new Date(photo.date);
    if (!isNaN(d.getTime())) return d.toLocaleString();
  }
  return '—';
}

export default function PhotoViewer({ photos, initialIndex, onClose, onToggleFavorite, onMoveToTrash }: PhotoViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showInfo, setShowInfo] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [thumbLoading, setThumbLoading] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const currentPhoto = photos[currentIndex];

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape': onClose(); break;
        case 'ArrowLeft': setCurrentIndex(prev => (prev > 0 ? prev - 1 : prev)); break;
        case 'ArrowRight': setCurrentIndex(prev => (prev < photos.length - 1 ? prev + 1 : prev)); break;
        case 'i': case 'I': setShowInfo(prev => !prev); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [photos.length, onClose]);

  // Auto-hide controls
  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
  };

  useEffect(() => {
    resetControlsTimeout();
    return () => { if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); };
  }, [currentIndex]);

  const handleDownload = async () => {
    const p = currentPhoto;
    // If we have a local thumb path (file:// URL), open it
    if (p.url && p.url.startsWith('file://')) {
      window.electronAPI.openExternal(p.url);
      return;
    }
    // Otherwise try to download the full-res file from Telegram
    const fileId = p.tgFileId || p.file_id;
    if (fileId) {
      setThumbLoading(true);
      try {
        const result = await window.electronAPI.downloadThumb(p.id, fileId);
        if (result.url) {
          window.electronAPI.openExternal(result.url);
        }
      } finally {
        setThumbLoading(false);
      }
    }
  };

  if (!currentPhoto) return null;

  const displayName = currentPhoto.filename || currentPhoto.id.split('-')[0] + '…';
  const displayDate = formatDate(currentPhoto);

  return (
    <div
      className="fixed inset-0 z-50 flex bg-black/95 animate-in fade-in duration-200"
      onMouseMove={resetControlsTimeout}
    >
      {/* Main Viewer Area */}
      <div className="flex-1 flex flex-col relative">
        {/* Top Navigation Bar */}
        <div
          className={`absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/60 to-transparent flex items-center justify-between px-4 z-10 transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex items-center gap-4">
            <button
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
            <div className="text-white">
              <div className="text-sm font-medium truncate max-w-xs" title={currentPhoto.filename || currentPhoto.id}>
                {displayName}
              </div>
              <div className="text-xs text-white/60">{currentIndex + 1} of {photos.length}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-colors disabled:opacity-40"
              title="Download"
              onClick={handleDownload}
              disabled={thumbLoading}
            >
              <Download size={20} />
            </button>
            <button className="p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-colors" title="Add to Album">
              <FolderPlus size={20} />
            </button>
            <button
              className="p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-colors"
              title={currentPhoto.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
              onClick={() => {
                if (onToggleFavorite) {
                  onToggleFavorite(currentPhoto.id, !currentPhoto.is_favorite);
                  currentPhoto.is_favorite = !currentPhoto.is_favorite;
                }
              }}
            >
              <Heart size={20} className={currentPhoto.is_favorite ? 'text-red-500 fill-red-500' : ''} />
            </button>
            <button
              className="p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-colors"
              title="Delete"
              onClick={() => {
                if (onMoveToTrash) {
                  onMoveToTrash([currentPhoto.id]);
                  onClose();
                }
              }}
            >
              <Trash2 size={20} />
            </button>
            <div className="w-px h-6 bg-white/20 mx-2" />
            <button
              className={`p-2 rounded-full transition-colors ${showInfo ? 'bg-white/20 text-white' : 'text-white/80 hover:text-white hover:bg-white/10'}`}
              title="Info"
              onClick={() => setShowInfo(!showInfo)}
            >
              <Info size={20} />
            </button>
            <button className="p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-colors">
              <MoreVertical size={20} />
            </button>
          </div>
        </div>

        {/* Main Photo Display */}
        <div className="flex-1 relative flex items-center justify-center p-8">
          {currentPhoto.url ? (
            <img
              src={currentPhoto.url}
              alt={currentPhoto.filename || ''}
              className="w-full h-full object-contain drop-shadow-2xl animate-in zoom-in-95 duration-200"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-white/40">
              <ImageIcon size={80} strokeWidth={1} className="mb-4" />
              <p className="text-sm">{currentPhoto.filename || 'No preview available'}</p>
              <p className="text-xs mt-1">Click download to retrieve from Telegram</p>
            </div>
          )}

          {/* Left/Right Nav */}
          <button
            onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
            className={`absolute left-4 p-3 rounded-full bg-black/20 text-white hover:bg-black/40 transition-all ${
              currentIndex === 0 ? 'opacity-0 pointer-events-none' : showControls ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <ChevronLeft size={32} />
          </button>
          <button
            onClick={() => setCurrentIndex(prev => Math.min(photos.length - 1, prev + 1))}
            className={`absolute right-4 p-3 rounded-full bg-black/20 text-white hover:bg-black/40 transition-all ${
              currentIndex === photos.length - 1 ? 'opacity-0 pointer-events-none' : showControls ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <ChevronRight size={32} />
          </button>
        </div>

        {/* Bottom Filmstrip */}
        <div
          className={`absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-center transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex items-center gap-2 px-4 overflow-x-auto max-w-full pb-4 scrollbar-hide">
            {photos.slice(Math.max(0, currentIndex - 10), Math.min(photos.length, currentIndex + 10)).map((p, idx) => {
              const actualIndex = Math.max(0, currentIndex - 10) + idx;
              const isCurrent = actualIndex === currentIndex;
              return (
                <button
                  key={p.id}
                  onClick={() => setCurrentIndex(actualIndex)}
                  className={`relative flex-shrink-0 transition-transform ${isCurrent ? 'scale-110 z-10' : 'hover:scale-105 opacity-60 hover:opacity-100'}`}
                >
                  {p.url ? (
                    <img
                      src={p.url}
                      alt=""
                      className={`h-12 w-12 object-cover rounded-sm ${isCurrent ? 'ring-2 ring-white' : ''}`}
                    />
                  ) : (
                    <div className={`h-12 w-12 rounded-sm bg-white/10 flex items-center justify-center ${isCurrent ? 'ring-2 ring-white' : ''}`}>
                      <ImageIcon size={16} className="text-white/40" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Info Panel */}
      {showInfo && (
        <div className="w-80 bg-[#202124] border-l border-white/10 flex flex-col text-white animate-in slide-in-from-right duration-200">
          <div className="p-4 border-b border-white/10 flex items-center gap-3">
            <Info size={20} className="text-white/80" />
            <h2 className="font-medium">Info</h2>
          </div>
          <div className="p-4 flex flex-col gap-6">
            {/* Filename */}
            <div>
              <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">File</h3>
              <div className="space-y-3">
                <InfoRow label="Filename" value={currentPhoto.filename || '—'} />
              </div>
            </div>

            {/* Details */}
            <div>
              <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Details</h3>
              <div className="space-y-3">
                <InfoRow label="Date Taken" value={displayDate} />
                <InfoRow
                  label="Dimensions"
                  value={currentPhoto.width && currentPhoto.height
                    ? `${currentPhoto.width} × ${currentPhoto.height}`
                    : '—'}
                />
                <InfoRow label="File Size" value={formatBytes(currentPhoto.size_bytes)} />
                <InfoRow label="Album" value={currentPhoto.album || 'Camera Roll'} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-white break-words">{value}</div>
      <div className="text-xs text-white/50 mt-0.5">{label}</div>
    </div>
  );
}
