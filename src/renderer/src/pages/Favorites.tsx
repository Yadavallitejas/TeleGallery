import { useState, useMemo, useEffect } from 'react';
import { Check, Star, X } from 'lucide-react';

import PhotoViewer, { Photo } from '../components/PhotoViewer';
import AddToAlbumModal from '../components/AddToAlbumModal';

export default function Favorites() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [isAlbumModalOpen, setIsAlbumModalOpen] = useState(false);

  useEffect(() => {
    loadPhotos();
  }, []);

  const loadPhotos = async () => {
    const rows = await window.electronAPI.getFavorites();
    setPhotos(rows);
  };

  const groupedPhotos = useMemo(() => {
    const groups: { date: string, photos: any[] }[] = [];
    let currentGroup: any = null;

    photos.forEach(row => {
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
        is_favorite: row.is_favorite === 1
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

  const handleToggleFavorite = async (photoId: string, isFav: boolean) => {
    await window.electronAPI.toggleFavorite(photoId, isFav);
    loadPhotos(); // Reload after change
  };

  const handleMoveToTrash = async (photoIds: string[]) => {
    await window.electronAPI.moveToTrash(photoIds);
    setSelectedIds(new Set());
    loadPhotos();
  };

  return (
    <div className="relative min-h-full flex flex-col bg-background pb-16">
      <div className="flex-1 overflow-auto px-4 sm:px-6 lg:px-8 py-4">
        {totalPhotos === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-muted">
            <Star className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-xl">No favorites yet</p>
          </div>
        )}
        {groupedPhotos.map((group) => {
          const groupSelected = group.photos.every((p) => selectedIds.has(p.id));
          const someSelected = group.photos.some((p) => selectedIds.has(p.id));

          return (
            <div key={group.date} className="mb-8">
              <div className="group flex items-center mb-4 sticky top-0 bg-background/95 backdrop-blur-sm z-10 py-2">
                <div
                  className={`w-5 h-5 rounded-full border-2 mr-3 flex items-center justify-center cursor-pointer transition-colors ${
                    groupSelected ? 'bg-primary border-primary' : someSelected ? 'bg-primary/50 border-primary' : 'border-muted hover:border-foreground'
                  } ${isMultiSelect ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  onClick={() => toggleGroup(group.photos)}
                >
                  {groupSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                  {!groupSelected && someSelected && <div className="w-2.5 h-0.5 bg-white rounded-full" />}
                </div>
                <h2 className="text-lg font-medium text-foreground">{group.date}</h2>
              </div>

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
                          className={`w-full h-full object-cover transition-transform duration-300 ${isSelected ? 'scale-75 rounded-lg' : 'hover:scale-105'}`}
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted-bg">
                          <span className="text-muted text-xs text-center px-1 leading-tight">
                            {photo.filename || 'No preview'}
                          </span>
                        </div>
                      )}

                      <div
                        className={`absolute inset-0 bg-black/10 transition-opacity duration-200 ${isSelected ? 'opacity-0' : 'opacity-0 group-hover/photo:opacity-100'}`}
                        onClick={() => {
                          if (!isMultiSelect) {
                            const absIndex = allPhotos.findIndex(p => p.id === photo.id);
                            if (absIndex !== -1) setViewerIndex(absIndex);
                          }
                        }}
                      />
                      
                      <div className="absolute top-2 right-2 text-white drop-shadow-md z-10">
                        <Star className="w-5 h-5 text-red-500 fill-red-500" />
                      </div>

                      <div
                        className={`absolute top-2 left-2 z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                          isSelected ? 'bg-primary border-primary' : 'border-white bg-black/20 hover:border-white hover:bg-black/40'
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

      <div className="fixed bottom-0 right-0 left-64 h-12 bg-background border-t border-border flex items-center justify-between px-6 z-20">
        <div className="text-sm text-muted">{totalPhotos} favorites</div>
      </div>

      {isMultiSelect && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 ml-32 z-30 bg-background border border-border shadow-2xl rounded-full px-6 py-3 flex items-center gap-6 animate-in slide-in-from-bottom-4">
          <div className="text-sm font-medium text-foreground">{selectedIds.size} selected</div>
          <div className="h-4 w-[1px] bg-border" />
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleMoveToTrash(Array.from(selectedIds))}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-red-50 rounded-full text-sm font-medium transition-colors text-red-600"
            >
              Trash
            </button>
            <button
              onClick={() => setIsAlbumModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted-bg rounded-full text-sm font-medium transition-colors text-foreground"
            >
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

      <AddToAlbumModal
        isOpen={isAlbumModalOpen}
        onClose={() => setIsAlbumModalOpen(false)}
        photoIds={Array.from(selectedIds)}
        onSuccess={() => setSelectedIds(new Set())}
      />

      {viewerIndex !== null && (
        <PhotoViewer
          photos={allPhotos}
          initialIndex={viewerIndex}
          onClose={() => {
            setViewerIndex(null);
            loadPhotos(); // Refresh in case favorite status changed
          }}
          onToggleFavorite={handleToggleFavorite}
          onMoveToTrash={handleMoveToTrash}
        />
      )}
    </div>
  );
}
