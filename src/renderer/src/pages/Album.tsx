import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, MoreVertical, Plus, Edit2, Trash2 } from 'lucide-react';

export default function Album() {
  const [albums, setAlbums] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadAlbums();
    // Refresh album list when a photo upload completes (e.g. newly uploaded photo added to album)
    const handler = window.electronAPI.onUploadComplete(() => loadAlbums());
    return () => window.electronAPI.offUploadComplete(handler);
  }, []);

  const loadAlbums = async () => {
    const data = await window.electronAPI.getAlbums();
    setAlbums(data);
  };

  const handleCreate = async () => {
    if (!newAlbumName.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { success } = await window.electronAPI.createAlbum(newAlbumName.trim());
      if (success) {
        setNewAlbumName('');
        setIsCreating(false);
        loadAlbums();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this album? The photos will remain in your gallery.')) {
      await window.electronAPI.deleteAlbum(id);
      loadAlbums();
    }
  };

  const handleRename = async (id: string, e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) e.stopPropagation();
    if (!editName.trim()) {
      setEditingId(null);
      return;
    }
    await window.electronAPI.renameAlbum(id, editName.trim());
    setEditingId(null);
    loadAlbums();
  };

  const startRename = (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditName(currentName);
    setEditingId(id);
  };

  return (
    <div className="flex-1 overflow-auto bg-background p-8 pb-20">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-foreground">Albums</h1>
        <button 
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Plus size={20} />
          <span>New Album</span>
        </button>
      </div>

      {isCreating && (
        <div className="mb-8 p-4 bg-muted-bg rounded-xl border border-border flex items-center gap-4 animate-in fade-in slide-in-from-top-4">
          <input
            type="text"
            value={newAlbumName}
            onChange={e => setNewAlbumName(e.target.value)}
            placeholder="Album Name"
            autoFocus
            className="flex-1 bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            onKeyDown={e => {
              if (e.key === 'Enter' && !isSubmitting) handleCreate();
              if (e.key === 'Escape') setIsCreating(false);
            }}
          />
          <button onClick={handleCreate} disabled={!newAlbumName.trim() || isSubmitting} className="px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50">
            {isSubmitting ? 'Creating…' : 'Create'}
          </button>
          <button onClick={() => setIsCreating(false)} className="px-4 py-2 text-muted hover:bg-black/5 rounded-lg">
            Cancel
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {albums.map(album => (
          <div 
            key={album.id}
            onClick={() => navigate(`/album/${album.id}`)}
            className="group cursor-pointer flex flex-col"
          >
            <div className="relative aspect-square rounded-2xl bg-muted-bg border border-border overflow-hidden mb-3 shadow-sm group-hover:shadow-md transition-all">
              {album.cover_photo_id && album.cover_thumb_url ? (
                <img 
                  src={album.cover_thumb_url} 
                  alt={album.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted group-hover:text-primary transition-colors">
                  <FolderOpen size={48} strokeWidth={1.5} />
                  <span className="text-sm mt-2 font-medium">Empty Album</span>
                </div>
              )}
              
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="relative group/menu">
                  <button onClick={e => e.stopPropagation()} className="p-2 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full text-white transition-colors">
                    <MoreVertical size={16} />
                  </button>
                  <div className="absolute right-0 top-full mt-1 w-36 bg-background border border-border rounded-lg shadow-xl py-1 opacity-0 pointer-events-none group-hover/menu:opacity-100 group-hover/menu:pointer-events-auto transition-opacity z-10">
                    <button 
                      onClick={(e) => startRename(album.id, album.name, e)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted-bg"
                    >
                      <Edit2 size={14} /> Rename
                    </button>
                    <button 
                      onClick={(e) => handleDelete(album.id, e)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            {editingId === album.id ? (
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onClick={e => e.stopPropagation()}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRename(album.id, e);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                onBlur={() => handleRename(album.id)}
                autoFocus
                className="w-full px-2 py-1 text-sm font-semibold bg-background border border-primary rounded outline-none text-foreground"
              />
            ) : (
              <div className="flex flex-col px-1">
                <h3 className="font-semibold text-foreground text-lg truncate group-hover:text-primary transition-colors">{album.name}</h3>
                <p className="text-sm text-muted">{album.photo_count} photo{album.photo_count !== 1 ? 's' : ''}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
