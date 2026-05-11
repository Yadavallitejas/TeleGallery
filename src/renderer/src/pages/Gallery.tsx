import { useState, useMemo, useEffect, useCallback } from 'react';
import { Check, Cloud, FolderPlus, X, Trash2, Image, Video, Heart, Search } from 'lucide-react';

import PhotoViewer, { Photo } from '../components/PhotoViewer';
import AddToAlbumModal from '../components/AddToAlbumModal';

type FilterType = 'all' | 'photos' | 'videos' | 'favorites';

const isVideoFile = (filename?: string) => {
  if (!filename) return false;
  return /\.(mp4|mov|avi|mkv|webm|m4v|wmv|flv|3gp)$/i.test(filename);
};

export default function Gallery() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // Frozen snapshot of photos when viewer opens — prevents cycling during upload
  const [frozenPhotos, setFrozenPhotos] = useState<Photo[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isAlbumModalOpen, setIsAlbumModalOpen] = useState(false);
  const [albumTargetPhotoId, setAlbumTargetPhotoId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadPhotos();
    const handleUploadComplete = window.electronAPI.onUploadComplete(() => {
      loadPhotos();
    });
    return () => {
      window.electronAPI.offUploadComplete(handleUploadComplete);
    };
  }, []);

  const loadPhotos = async () => {
    const rows = await window.electronAPI.getPhotos();
    setPhotos(rows);
  };

  // Apply filters
  const filteredPhotos = useMemo(() => {
    let result = photos;

    if (filter === 'photos') result = result.filter(p => !isVideoFile(p.filename));
    else if (filter === 'videos') result = result.filter(p => isVideoFile(p.filename));
    else if (filter === 'favorites') result = result.filter(p => p.is_favorite === 1);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        (p.filename || '').toLowerCase().includes(q)
      );
    }

    return result;
  }, [photos, filter, searchQuery]);

  const groupedPhotos = useMemo(() => {
    const groups: { date: string; dateMs: number; photos: any[] }[] = [];
    let currentGroup: any = null;

    filteredPhotos.forEach(row => {
      const dateMs = row.date_taken ? row.date_taken * 1000 : Date.now();
      const dateStr = new Date(dateMs).toLocaleDateString(undefined, {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      });

      if (!currentGroup || currentGroup.date !== dateStr) {
        currentGroup = { date: dateStr, dateMs, photos: [] };
        groups.push(currentGroup);
      }

      currentGroup.photos.push({
        id: row.id,
        url: row.thumb_url || null,
        thumb_url: row.thumb_url || null,
        // PhotoViewer field names:
        file_name: row.filename || row.original_filename || '',
        original_filename: row.original_filename || row.filename || '',
        media_type: isVideoFile(row.filename || row.original_filename) ? 'video' : 'image',
        date: dateStr,
        date_taken: row.date_taken,
        date_taken_iso: row.date_taken_iso,
        width: row.width,
        height: row.height,
        file_id: row.file_id,
        // Keep old field for grid display:
        filename: row.filename || row.original_filename || '',
        size_bytes: row.size_bytes,
        is_favorite: row.is_favorite === 1,
        local_thumb_path: row.local_thumb_path,
        isVideo: isVideoFile(row.filename || row.original_filename),
      });
    });

    return groups;
  }, [filteredPhotos]);

  const allPhotos = useMemo(() => groupedPhotos.flatMap(g => g.photos), [groupedPhotos]);
  const totalPhotos = photos.length;
  const isMultiSelect = selectedIds.size > 0;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleGroup = (groupPhotos: Photo[]) => {
    const allSelected = groupPhotos.every(p => selectedIds.has(p.id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) groupPhotos.forEach(p => next.delete(p.id));
      else groupPhotos.forEach(p => next.add(p.id));
      return next;
    });
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); if (!isDragging) setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const filePaths = files.map((f: any) => f.path).filter(Boolean);
    if (filePaths.length > 0) await window.electronAPI.uploadFiles(filePaths);
  };

  const handleToggleFavorite = async (photoId: string, isFav: boolean) => {
    await window.electronAPI.toggleFavorite(photoId, isFav);
    loadPhotos();
  };

  const handleMoveToTrash = async (photoIds: string[]) => {
    await window.electronAPI.moveToTrash(photoIds);
    setSelectedIds(new Set());
    loadPhotos();
  };

  const openPhoto = (photo: any) => {
    const absIndex = allPhotos.findIndex(p => p.id === photo.id);
    if (absIndex !== -1) {
      // Freeze the current photos array so uploads don't shift the viewed photo
      setFrozenPhotos([...allPhotos]);
      setViewerIndex(absIndex);
    }
  };

  const handleAddToAlbum = (photoId: string) => {
    setAlbumTargetPhotoId(photoId);
    setIsAlbumModalOpen(true);
  };

  const FILTERS: { key: FilterType; label: string; icon: any }[] = [
    { key: 'all', label: 'All', icon: null },
    { key: 'photos', label: 'Photos', icon: Image },
    { key: 'videos', label: 'Videos', icon: Video },
    { key: 'favorites', label: 'Favorites', icon: Heart },
  ];

  return (
    <div
      className="relative min-h-full flex flex-col bg-background"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-primary/10 border-4 border-dashed border-primary/50 flex flex-col items-center justify-center backdrop-blur-sm pointer-events-none rounded-xl m-4">
          <Cloud className="w-16 h-16 text-primary animate-bounce mb-4" />
          <h2 className="text-2xl font-semibold text-primary">Drop photos to upload</h2>
        </div>
      )}

      {/* Sticky Top Bar: Search + Filter Chips */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border px-4 pt-3 pb-0">
        {/* Search */}
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search photos…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-muted-bg border border-border rounded-full text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-2 pb-3 overflow-x-auto scrollbar-hide">
          {FILTERS.map(f => {
            const Icon = f.icon;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  filter === f.key
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-muted-bg text-muted hover:bg-border hover:text-foreground'
                }`}
              >
                {Icon && <Icon size={14} />}
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Photo Grid */}
      <div className="flex-1 overflow-auto px-4 py-4 pb-20">
        {groupedPhotos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted gap-3">
            <Image size={48} strokeWidth={1} className="text-muted/40" />
            <p className="text-lg font-medium">No photos yet</p>
            <p className="text-sm">Upload photos or configure a sync folder</p>
          </div>
        ) : (
          groupedPhotos.map(group => {
            const groupSelected = group.photos.every(p => selectedIds.has(p.id));
            const someSelected = group.photos.some(p => selectedIds.has(p.id));

            return (
              <div key={group.date} className="mb-8">
                {/* Date Group Header */}
                <div className="group/header flex items-center mb-3 sticky top-[104px] z-10 bg-background/95 backdrop-blur-sm py-1">
                  <div
                    className={`w-5 h-5 rounded-full border-2 mr-3 flex items-center justify-center cursor-pointer transition-all flex-shrink-0 ${
                      groupSelected
                        ? 'bg-primary border-primary'
                        : someSelected
                        ? 'bg-primary/50 border-primary'
                        : 'border-muted hover:border-foreground'
                    } ${isMultiSelect ? 'opacity-100' : 'opacity-0 group-hover/header:opacity-100'}`}
                    onClick={() => toggleGroup(group.photos)}
                  >
                    {groupSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    {!groupSelected && someSelected && <div className="w-2.5 h-0.5 bg-white rounded-full" />}
                  </div>
                  <h2 className="text-sm font-semibold text-foreground">{group.date}</h2>
                  <span className="ml-2 text-xs text-muted">({group.photos.length})</span>
                </div>

                {/* Photo Grid — Google Photos style responsive */}
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-0.5">
                  {group.photos.map(photo => {
                    const isSelected = selectedIds.has(photo.id);

                    return (
                      <div
                        key={photo.id}
                        className="group/photo relative aspect-square bg-muted-bg overflow-hidden cursor-pointer select-none"
                        onClick={() => {
                          if (isMultiSelect) toggleSelect(photo.id);
                          else openPhoto(photo);
                        }}
                      >
                        {/* Thumbnail */}
                        {photo.url ? (
                          <img
                            src={photo.url}
                            alt={photo.filename || ''}
                            className={`w-full h-full object-cover transition-all duration-300 ${
                              isSelected ? 'scale-90 rounded-sm' : 'group-hover/photo:brightness-90'
                            }`}
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-muted-bg gap-1">
                            {photo.isVideo
                              ? <Video size={28} className="text-muted/50" />
                              : <Image size={28} className="text-muted/50" />
                            }
                            <span className="text-muted text-[10px] text-center px-1 leading-tight line-clamp-2">
                              {photo.filename?.split('/').pop()?.split('\\').pop() || 'Loading…'}
                            </span>
                          </div>
                        )}

                        {/* Video badge */}
                        {photo.isVideo && (
                          <div className="absolute bottom-1.5 left-1.5 bg-black/60 rounded px-1 py-0.5 flex items-center gap-0.5">
                            <Video size={10} className="text-white" />
                          </div>
                        )}

                        {/* Favorite badge */}
                        {photo.is_favorite && !isSelected && (
                          <div className="absolute top-1.5 right-1.5">
                            <Heart className="w-4 h-4 text-red-400 fill-red-400 drop-shadow" />
                          </div>
                        )}

                        {/* Hover overlay (only when not selected) */}
                        {!isSelected && (
                          <div className="absolute inset-0 bg-black/0 group-hover/photo:bg-black/10 transition-colors duration-150" />
                        )}

                        {/* Selection overlay */}
                        {isSelected && (
                          <div className="absolute inset-0 bg-primary/20 ring-2 ring-inset ring-primary" />
                        )}

                        {/* Checkbox */}
                        <div
                          className={`absolute top-1.5 left-1.5 z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shadow-sm ${
                            isSelected
                              ? 'bg-primary border-primary scale-110'
                              : 'border-white bg-black/30 hover:bg-black/50'
                          } ${isSelected || isMultiSelect ? 'opacity-100' : 'opacity-0 group-hover/photo:opacity-100'}`}
                          onClick={e => { e.stopPropagation(); toggleSelect(photo.id); }}
                        >
                          {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Status Bar */}
      <div className="fixed bottom-0 right-0 left-64 h-10 bg-background border-t border-border flex items-center justify-between px-6 z-20 text-xs text-muted">
        <span>{totalPhotos.toLocaleString()} photos{filter !== 'all' ? ` · ${filteredPhotos.length} shown` : ''}</span>
        <div className="flex items-center gap-2">
          <Cloud className="w-3.5 h-3.5" />
          <span>Unlimited Storage</span>
        </div>
      </div>

      {/* Multi-Select Floating Action Bar */}
      {isMultiSelect && (
        <div className="fixed bottom-14 left-1/2 -translate-x-1/2 ml-32 z-30 bg-[#1a1a2e] border border-white/10 shadow-2xl rounded-full px-6 py-3 flex items-center gap-4 animate-in slide-in-from-bottom-4">
          <div className="text-sm font-semibold text-white">{selectedIds.size} selected</div>
          <div className="h-4 w-px bg-white/20" />
          <button
            onClick={() => setIsAlbumModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-full text-sm font-medium transition-colors"
          >
            <FolderPlus size={16} /> Add to Album
          </button>
          <button
            onClick={() => handleMoveToTrash(Array.from(selectedIds))}
            className="flex items-center gap-2 px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-full text-sm font-medium transition-colors"
          >
            <Trash2 size={16} /> Delete
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Add to Album Modal */}
      <AddToAlbumModal
        isOpen={isAlbumModalOpen}
        onClose={() => { setIsAlbumModalOpen(false); setAlbumTargetPhotoId(null); }}
        photoIds={albumTargetPhotoId ? [albumTargetPhotoId] : Array.from(selectedIds)}
        onSuccess={() => {
          setSelectedIds(new Set());
          setAlbumTargetPhotoId(null);
          loadPhotos();
        }}
      />

      {/* Full-Screen Photo Viewer */}
      {viewerIndex !== null && (
        <PhotoViewer
          photos={frozenPhotos.length > 0 ? frozenPhotos : allPhotos}
          initialIndex={viewerIndex}
          onClose={() => { setViewerIndex(null); setFrozenPhotos([]); loadPhotos(); }}
          onToggleFavorite={handleToggleFavorite}
          onMoveToTrash={handleMoveToTrash}
          onAddToAlbum={handleAddToAlbum}
        />
      )}
    </div>
  );
}
