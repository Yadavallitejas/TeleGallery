import { useState, useEffect } from 'react';
import { X, Plus, FolderOpen } from 'lucide-react';

interface AddToAlbumModalProps {
  photoIds: string[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddToAlbumModal({ photoIds, isOpen, onClose, onSuccess }: AddToAlbumModalProps) {
  const [albums, setAlbums] = useState<any[]>([]);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadAlbums();
      setNewAlbumName('');
      setIsCreating(false);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const loadAlbums = async () => {
    const data = await window.electronAPI.getAlbums();
    setAlbums(data);
  };

  const handleCreateAndAdd = async () => {
    if (!newAlbumName.trim() || isSubmitting) return;
    setIsSubmitting(true);
    
    const { success, albumId } = await window.electronAPI.createAlbum(newAlbumName.trim());
    if (success && albumId) {
      await window.electronAPI.addPhotosToAlbum(albumId, photoIds);
      onSuccess();
      onClose();
    }
    setIsSubmitting(false);
  };

  const handleAddToExisting = async (albumId: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    const { success } = await window.electronAPI.addPhotosToAlbum(albumId, photoIds);
    if (success) {
      onSuccess();
      onClose();
    }
    setIsSubmitting(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-border">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Add {photoIds.length} photo{photoIds.length !== 1 ? 's' : ''} to album</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted-bg text-muted transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {isCreating ? (
            <div className="mb-4">
              <label className="block text-sm font-medium text-muted mb-2">New Album Name</label>
              <input
                type="text"
                value={newAlbumName}
                onChange={(e) => setNewAlbumName(e.target.value)}
                placeholder="e.g. Summer Vacation"
                className="w-full px-3 py-2 bg-muted-bg border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-4">
                <button 
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 text-sm text-foreground hover:bg-muted-bg rounded-lg"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleCreateAndAdd}
                  disabled={!newAlbumName.trim() || isSubmitting}
                  className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  Create & Add
                </button>
              </div>
            </div>
          ) : (
            <button 
              onClick={() => setIsCreating(true)}
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted-bg transition-colors text-primary font-medium mb-2 border border-dashed border-primary/30"
            >
              <Plus size={20} />
              <span>Create new album</span>
            </button>
          )}

          {!isCreating && albums.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 px-1">
                Existing Albums
              </div>
              <div className="flex flex-col gap-1">
                {albums.map(album => (
                  <button
                    key={album.id}
                    onClick={() => handleAddToExisting(album.id)}
                    disabled={isSubmitting}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted-bg transition-colors text-left disabled:opacity-50"
                  >
                    <div className="w-10 h-10 rounded-md bg-muted-bg border border-border flex items-center justify-center shrink-0 overflow-hidden">
                      {album.cover_photo_id && album.cover_thumb_url ? (
                        <img 
                          src={album.cover_thumb_url} 
                          alt="" 
                          className="w-full h-full object-cover" 
                        />
                      ) : (
                        <FolderOpen size={20} className="text-muted" />
                      )}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="font-medium text-foreground truncate">{album.name}</div>
                      <div className="text-xs text-muted">{album.photo_count} photos</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
