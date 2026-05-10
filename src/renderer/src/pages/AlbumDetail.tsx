import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Trash2, Edit2, Image as ImageIcon, Star } from 'lucide-react';
import PhotoViewer from '../components/PhotoViewer';

export default function AlbumDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [album, setAlbum] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    if (id) {
      loadData(id);
    }
  }, [id]);

  const loadData = async (albumId: string) => {
    const albums = await window.electronAPI.getAlbums();
    const currentAlbum = albums.find(a => a.id === albumId);
    if (currentAlbum) {
      setAlbum(currentAlbum);
      setEditName(currentAlbum.name);
    } else {
      navigate('/album');
      return;
    }

    const albumPhotos = await window.electronAPI.getAlbumPhotos(albumId);
    setPhotos(albumPhotos);
  };

  const handleRename = async () => {
    if (editName.trim() && editName !== album.name && id) {
      await window.electronAPI.renameAlbum(id, editName.trim());
      setAlbum({ ...album, name: editName.trim() });
    } else {
      setEditName(album.name);
    }
    setIsEditingName(false);
  };

  const handleRemoveFromAlbum = async () => {
    if (id && selectedIds.size > 0) {
      const { success } = await window.electronAPI.removePhotosFromAlbum(id, Array.from(selectedIds));
      if (success) {
        setSelectedIds(new Set());
        loadData(id);
      }
    }
  };

  const handleSetCover = async (photoId: string) => {
    if (id) {
      const { success } = await window.electronAPI.setAlbumCover(id, photoId);
      if (success) {
        setAlbum({ ...album, cover_photo_id: photoId });
        setSelectedIds(new Set());
      }
    }
  };

  const groupedPhotos = useMemo(() => {
    const groups: { date: string, photos: any[] }[] = [];
    let currentGroup: any = null;

    photos.forEach(row => {
      const dateStr = new Date(row.date_taken * 1000).toLocaleDateString(undefined, {
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
        width: row.width,
        height: row.height,
        filename: row.filename,
        size_bytes: row.size_bytes,
        captured_at: row.date_taken,
        file_id: row.file_id,
        is_favorite: row.is_favorite === 1
      });
    });

    return groups;
  }, [photos]);

  const allPhotos = useMemo(() => groupedPhotos.flatMap(g => g.photos), [groupedPhotos]);
  const isMultiSelect = selectedIds.size > 0;

  const toggleSelect = (photoId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  };

  const handleToggleFavorite = async (photoId: string, isFav: boolean) => {
    await window.electronAPI.toggleFavorite(photoId, isFav);
    if (id) loadData(id);
  };

  const handleMoveToTrash = async (photoIds: string[]) => {
    await window.electronAPI.moveToTrash(photoIds);
    setSelectedIds(new Set());
    if (id) loadData(id);
  };

  if (!album) return null;

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          <button 
            onClick={() => navigate('/album')}
            className="p-2 rounded-full hover:bg-muted-bg text-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          
          {isEditingName ? (
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={e => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') {
                  setEditName(album.name);
                  setIsEditingName(false);
                }
              }}
              autoFocus
              className="text-2xl font-bold bg-muted-bg border border-border rounded-lg px-3 py-1 outline-none text-foreground focus:ring-2 focus:ring-primary/50 w-full max-w-sm"
            />
          ) : (
            <div className="flex items-center gap-3 group">
              <h1 className="text-2xl font-bold text-foreground">{album.name}</h1>
              <button 
                onClick={() => setIsEditingName(true)}
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-muted-bg text-muted transition-all"
              >
                <Edit2 size={16} />
              </button>
            </div>
          )}
        </div>
        
        <div className="text-sm font-medium text-muted bg-muted-bg px-3 py-1.5 rounded-full">
          {photos.length} photos
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto px-6 py-6 pb-24">
        {photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted mt-20">
            <ImageIcon size={64} className="mb-4 opacity-20" />
            <h2 className="text-xl font-semibold mb-2">This album is empty</h2>
            <p className="max-w-sm text-center">
              Go to your gallery, select some photos, and click "Add to Album" to organize them here.
            </p>
            <button 
              onClick={() => navigate('/')}
              className="mt-6 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium"
            >
              Go to Gallery
            </button>
          </div>
        ) : (
          groupedPhotos.map(group => (
            <div key={group.date} className="mb-8">
              <h2 className="text-lg font-medium text-foreground mb-4 sticky top-16 bg-background/95 backdrop-blur-sm z-10 py-2">
                {group.date}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                {group.photos.map(photo => {
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
                      
                      {/* Album Cover indicator */}
                      {album.cover_photo_id === photo.id && (
                        <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded-md text-[10px] font-bold text-white tracking-wider uppercase">
                          Cover
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating Action Bar */}
      {isMultiSelect && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 ml-32 z-30 bg-background border border-border shadow-2xl rounded-full px-6 py-3 flex items-center gap-6 animate-in slide-in-from-bottom-4">
          <div className="text-sm font-medium text-foreground">
            {selectedIds.size} selected
          </div>
          <div className="h-4 w-[1px] bg-border" />
          <div className="flex items-center gap-2">
            {selectedIds.size === 1 && (
              <button
                onClick={() => handleSetCover(Array.from(selectedIds)[0])}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted-bg rounded-full text-sm font-medium transition-colors text-foreground"
              >
                <ImageIcon size={16} />
                Set Cover
              </button>
            )}
            <button
              onClick={handleRemoveFromAlbum}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-red-50/10 rounded-full text-sm font-medium transition-colors text-red-500"
            >
              <Trash2 size={16} />
              Remove from Album
            </button>
          </div>
        </div>
      )}

      {viewerIndex !== null && (
        <PhotoViewer
          photos={allPhotos}
          initialIndex={viewerIndex}
          onClose={() => {
            setViewerIndex(null);
            if (id) loadData(id);
          }}
          onToggleFavorite={handleToggleFavorite}
          onMoveToTrash={handleMoveToTrash}
        />
      )}
    </div>
  );
}
