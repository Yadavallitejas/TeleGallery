import { useState, useMemo, useEffect } from 'react';
import { Check, Cloud, FolderPlus, X, Trash2, Star } from 'lucide-react';

import PhotoViewer, { Photo } from '../components/PhotoViewer';
import AddToAlbumModal from '../components/AddToAlbumModal';

export default function Gallery() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isAlbumModalOpen, setIsAlbumModalOpen] = useState(false);

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

  const groupedPhotos = useMemo(() => {
    const groups: { date: string, photos: any[] }[] = [];
    let currentGroup: any = null;

    photos.forEach(row => {
      // date_taken is Unix seconds
      const dateMs = row.date_taken ? row.date_taken * 1000 : Date.now();
      const dateStr = new Date(dateMs).toLocaleDateString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
      });
      
      if (!currentGroup || currentGroup.date !== dateStr) {
        currentGroup = { date: dateStr, photos: [] };
        groups.push(currentGroup);
      }
      
      currentGroup.photos.push({
        id: row.id,
        url: row.thumb_url || null,
        thumb_url: row.thumb_url || null,
        date: dateStr,
        date_taken: row.date_taken,
        date_taken_iso: row.date_taken_iso,
        width: row.width,
        height: row.height,
        file_id: row.file_id,
        filename: row.filename,
        size_bytes: row.size_bytes,
        is_favorite: row.is_favorite === 1,
        local_thumb_path: row.local_thumb_path,
      });
    });

    return groups;
  }, [photos]);

  const allPhotos = useMemo(() => groupedPhotos.flatMap(g => g.photos), [groupedPhotos]);
  const totalPhotos = photos.length;
  const isMultiSelect = selectedIds.size > 0;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (groupPhotos: Photo[]) => {
    const allSelected = groupPhotos.every((p) => selectedIds.has(p.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        groupPhotos.forEach((p) => next.delete(p.id));
      } else {
        groupPhotos.forEach((p) => next.add(p.id));
      }
      return next;
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    // In Electron, File objects have a .path property
    const filePaths = files.map((f: any) => f.path).filter(Boolean);
    
    if (filePaths.length > 0) {
      await window.electronAPI.uploadFiles(filePaths);
    }
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

  return (
    <div 
      className="relative min-h-full flex flex-col bg-background pb-16"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-primary/10 border-4 border-dashed border-primary/50 flex flex-col items-center justify-center backdrop-blur-sm pointer-events-none rounded-xl mx-4 my-4">
          <Cloud className="w-16 h-16 text-primary animate-bounce mb-4" />
          <h2 className="text-2xl font-semibold text-primary">Drop photos to upload</h2>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-auto px-4 sm:px-6 lg:px-8 py-4">
        {groupedPhotos.map((group) => {
          const groupSelected = group.photos.every((p) => selectedIds.has(p.id));
          const someSelected = group.photos.some((p) => selectedIds.has(p.id));

          return (
            <div key={group.date} className="mb-8">
              {/* Group Header */}
              <div className="group flex items-center mb-4 sticky top-0 bg-background/95 backdrop-blur-sm z-10 py-2">
                <div
                  className={`w-5 h-5 rounded-full border-2 mr-3 flex items-center justify-center cursor-pointer transition-colors ${
                    groupSelected
                      ? 'bg-primary border-primary'
                      : someSelected
                      ? 'bg-primary/50 border-primary'
                      : 'border-muted hover:border-foreground'
                  } ${isMultiSelect ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  onClick={() => toggleGroup(group.photos)}
                >
                  {groupSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                  {!groupSelected && someSelected && <div className="w-2.5 h-0.5 bg-white rounded-full" />}
                </div>
                <h2 className="text-lg font-medium text-foreground">{group.date}</h2>
              </div>

              {/* Photos Grid (Masonry-ish approximation with CSS Grid) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                {group.photos.map((photo) => {
                  const isSelected = selectedIds.has(photo.id);

                  return (
                    <div
                      key={photo.id}
                      className="group/photo relative aspect-square bg-muted-bg overflow-hidden cursor-pointer"
                      onClick={() => (isMultiSelect ? toggleSelect(photo.id) : null)}
                    >
                      {photo.url ? (
                        <img
                          src={photo.url}
                          alt={photo.filename || ''}
                          className={`w-full h-full object-cover transition-transform duration-300 ${
                            isSelected ? 'scale-75 rounded-lg' : 'hover:scale-105'
                          }`}
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted-bg">
                          <span className="text-muted text-xs text-center px-1 leading-tight">
                            {photo.filename || 'No preview'}
                          </span>
                        </div>
                      )}

                      {/* Hover Overlay */}
                      <div
                        className={`absolute inset-0 bg-black/10 transition-opacity duration-200 ${
                          isSelected ? 'opacity-0' : 'opacity-0 group-hover/photo:opacity-100'
                        }`}
                        onClick={() => {
                          if (!isMultiSelect) {
                            const absIndex = allPhotos.findIndex(p => p.id === photo.id);
                            if (absIndex !== -1) setViewerIndex(absIndex);
                          }
                        }}
                      />

                      {photo.is_favorite && (
                        <div className="absolute top-2 right-2 text-white drop-shadow-md z-10">
                          <Star className="w-5 h-5 text-red-500 fill-red-500" />
                        </div>
                      )}

                      {/* Checkbox */}
                      <div
                        className={`absolute top-2 left-2 z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-primary border-primary'
                            : 'border-white bg-black/20 hover:border-white hover:bg-black/40'
                        } ${isSelected || isMultiSelect ? 'opacity-100' : 'opacity-0 group-hover/photo:opacity-100'}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(photo.id);
                        }}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Status Bar */}
      <div className="fixed bottom-0 right-0 left-64 h-12 bg-background border-t border-border flex items-center justify-between px-6 z-20">
        <div className="text-sm text-muted">
          {totalPhotos} photos
        </div>
        <div className="flex items-center text-sm text-muted gap-2">
          <Cloud className="w-4 h-4" />
          <span>15.2 GB of Unlimited Storage Used</span>
        </div>
      </div>

      {/* Floating Action Bar for Multi-Select */}
      {isMultiSelect && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 ml-32 z-30 bg-background border border-border shadow-2xl rounded-full px-6 py-3 flex items-center gap-6 animate-in slide-in-from-bottom-4">
          <div className="text-sm font-medium text-foreground">
            {selectedIds.size} selected
          </div>
          <div className="h-4 w-[1px] bg-border" />
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleMoveToTrash(Array.from(selectedIds))}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-red-50 rounded-full text-sm font-medium transition-colors text-red-600"
            >
              <Trash2 size={16} />
              Trash
            </button>
            <button
              onClick={() => setIsAlbumModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted-bg rounded-full text-sm font-medium transition-colors text-foreground"
            >
              <FolderPlus size={16} />
              Add to Album
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted-bg rounded-full text-sm font-medium transition-colors text-muted hover:text-foreground"
            >
              <X size={16} />
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <AddToAlbumModal
        isOpen={isAlbumModalOpen}
        onClose={() => setIsAlbumModalOpen(false)}
        photoIds={Array.from(selectedIds)}
        onSuccess={() => {
          setSelectedIds(new Set());
        }}
      />

      {viewerIndex !== null && (
        <PhotoViewer
          photos={allPhotos}
          initialIndex={viewerIndex}
          onClose={() => {
            setViewerIndex(null);
            loadPhotos();
          }}
          onToggleFavorite={handleToggleFavorite}
          onMoveToTrash={handleMoveToTrash}
        />
      )}
    </div>
  );
}
