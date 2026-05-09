import { useState, useMemo, useEffect } from 'react';
import { Check, Trash2, RotateCcw, X, AlertTriangle } from 'lucide-react';

export default function Trash() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [photos, setPhotos] = useState<any[]>([]);

  useEffect(() => {
    loadPhotos();
  }, []);

  const loadPhotos = async () => {
    const rows = await window.electronAPI.getTrash();
    setPhotos(rows);
  };

  const groupedPhotos = useMemo(() => {
    const groups: { date: string, photos: any[] }[] = [];
    let currentGroup: any = null;

    photos.forEach(row => {
      // Group by deletion date; deleted_at is unix seconds
      const dateMs = row.deleted_at ? row.deleted_at * 1000 : Date.now();
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
        width: row.width,
        height: row.height,
        filename: row.filename,
        deleted_at: row.deleted_at,
      });
    });

    return groups;
  }, [photos]);


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

  const toggleGroup = (groupPhotos: any[]) => {
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

  const handleRestore = async (photoIds: string[]) => {
    await window.electronAPI.restoreFromTrash(photoIds);
    setSelectedIds(new Set());
    loadPhotos();
  };

  const handleDeletePermanently = async (photoIds: string[]) => {
    if (confirm(`Permanently delete ${photoIds.length} items? This action cannot be undone.`)) {
      await window.electronAPI.emptyTrashItem(photoIds);
      setSelectedIds(new Set());
      loadPhotos();
    }
  };

  return (
    <div className="relative min-h-full flex flex-col bg-background pb-16">
      
      {/* Banner */}
      <div className="bg-muted-bg text-muted py-3 px-6 text-sm flex items-center justify-center gap-2 border-b border-border">
        <AlertTriangle size={16} />
        <span>Items in trash will be permanently deleted after 30 days.</span>
      </div>

      <div className="flex-1 overflow-auto px-4 sm:px-6 lg:px-8 py-4">
        {totalPhotos === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-muted mt-24">
            <Trash2 className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-xl">Trash is empty</p>
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
                      onClick={() => toggleSelect(photo.id)}
                    >
                      {photo.url ? (
                        <img
                          src={photo.url}
                          alt={photo.filename || ''}
                          className={`w-full h-full object-cover transition-transform duration-300 opacity-60 grayscale ${isSelected ? 'scale-75 rounded-lg' : 'hover:scale-105'}`}
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted-bg opacity-60">
                          <span className="text-muted text-xs text-center px-1 leading-tight">
                            {photo.filename || 'No preview'}
                          </span>
                        </div>
                      )}

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
        <div className="text-sm text-muted">{totalPhotos} items in trash</div>
      </div>

      {isMultiSelect && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 ml-32 z-30 bg-background border border-border shadow-2xl rounded-full px-6 py-3 flex items-center gap-6 animate-in slide-in-from-bottom-4">
          <div className="text-sm font-medium text-foreground">{selectedIds.size} selected</div>
          <div className="h-4 w-[1px] bg-border" />
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleRestore(Array.from(selectedIds))}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-green-50 rounded-full text-sm font-medium transition-colors text-green-600"
            >
              <RotateCcw size={16} />
              Restore
            </button>
            <button
              onClick={() => handleDeletePermanently(Array.from(selectedIds))}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-red-50 rounded-full text-sm font-medium transition-colors text-red-600"
            >
              <Trash2 size={16} />
              Delete Permanently
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
    </div>
  );
}
