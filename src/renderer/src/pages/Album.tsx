import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, Plus, Edit2, Trash2, Check, X } from 'lucide-react';

interface Album {
  id: string;
  name: string;
  photo_count: number;
  cover_thumb_url: string | null;
}

export default function Album() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);

  // ── New album inline creation ──────────────────────────────────────────────
  // isCreating: whether the inline card is shown
  // newName: controlled input value
  // committed: true once Enter/✓ pressed; prevents blur from cancelling after commit
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const committedRef = useRef(false); // tracks whether user explicitly pressed Enter/✓
  const createInputRef = useRef<HTMLInputElement>(null);

  // ── Rename ────────────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const renameCommittedRef = useRef(false);

  // ── Delete confirmation ────────────────────────────────────────────────────
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const navigate = useNavigate();

  const loadAlbums = useCallback(async () => {
    const data = await window.electronAPI.getAlbums();
    setAlbums(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAlbums();
    const handler = window.electronAPI.onUploadComplete(() => loadAlbums());
    return () => window.electronAPI.offUploadComplete(handler);
  }, [loadAlbums]);

  // ── Open inline creation card ─────────────────────────────────────────────
  const startCreate = () => {
    setNewName('');
    committedRef.current = false;
    setIsCreating(true);
    // Focus the input on next paint
    setTimeout(() => createInputRef.current?.focus(), 30);
  };

  // ── Commit creation (called by Enter or ✓ button) ─────────────────────────
  const commitCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed || isSubmitting) return;
    committedRef.current = true;
    setIsSubmitting(true);
    try {
      await window.electronAPI.createAlbum(trimmed);
      setIsCreating(false);
      setNewName('');
      await loadAlbums();
    } finally {
      setIsSubmitting(false);
      committedRef.current = false;
    }
  };

  // ── Cancel creation (Escape or blur without committing) ───────────────────
  const cancelCreate = () => {
    setIsCreating(false);
    setNewName('');
    committedRef.current = false;
  };

  // onBlur: only cancel if user did NOT press Enter/✓
  const handleCreateBlur = () => {
    if (!committedRef.current) {
      cancelCreate();
    }
  };

  // ── Rename ────────────────────────────────────────────────────────────────
  const startRename = (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditName(currentName);
    renameCommittedRef.current = false;
    setEditingId(id);
  };

  const commitRename = async (id: string) => {
    if (renameCommittedRef.current) return; // avoid double-fire
    renameCommittedRef.current = true;
    const trimmed = editName.trim();
    setEditingId(null);
    if (trimmed) {
      await window.electronAPI.renameAlbum(id, trimmed);
      await loadAlbums();
    }
  };

  const cancelRename = () => {
    setEditingId(null);
    renameCommittedRef.current = false;
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const requestDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    await window.electronAPI.deleteAlbum(confirmDeleteId);
    setConfirmDeleteId(null);
    await loadAlbums();
  };

  // ─────────────────────────────────────────────────────────────────── render

  return (
    <div className="flex-1 overflow-auto bg-background p-8 pb-20 relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Albums</h1>
          {!loading && (
            <p className="text-sm text-muted mt-1">{albums.length} album{albums.length !== 1 ? 's' : ''}</p>
          )}
        </div>
        <button
          onClick={startCreate}
          disabled={isCreating}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
        >
          <Plus size={18} />
          New Album
        </button>
      </div>

      {/* Album grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">

        {/* ── Inline new album card (appears at start of grid) ── */}
        {isCreating && (
          <div
            className="flex flex-col animate-in fade-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div
              className="relative aspect-square rounded-2xl border-2 border-dashed border-primary/60 bg-primary/5 flex flex-col items-center justify-center gap-3 mb-3"
              style={{ boxShadow: '0 0 0 4px rgba(26,115,232,0.08)' }}
            >
              <FolderOpen size={40} strokeWidth={1.5} className="text-primary/60" />
              <span className="text-xs text-primary/60 font-medium">New Album</span>
            </div>
            <div className="flex items-center gap-1">
              <input
                ref={createInputRef}
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onBlur={handleCreateBlur}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitCreate(); }
                  if (e.key === 'Escape') cancelCreate();
                }}
                placeholder="Album name…"
                className="flex-1 min-w-0 px-2 py-1 text-sm font-semibold bg-background border border-primary rounded outline-none text-foreground placeholder:text-muted/50"
                maxLength={80}
              />
              {/* ✓ commit button — mouseDown fires before blur, so we use onMouseDown */}
              <button
                onMouseDown={e => { e.preventDefault(); commitCreate(); }}
                disabled={!newName.trim() || isSubmitting}
                className="w-7 h-7 flex items-center justify-center rounded bg-primary text-white disabled:opacity-40 flex-shrink-0"
                title="Create album (Enter)"
              >
                {isSubmitting
                  ? <span className="block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Check size={14} strokeWidth={3} />
                }
              </button>
              <button
                onMouseDown={e => { e.preventDefault(); cancelCreate(); }}
                className="w-7 h-7 flex items-center justify-center rounded text-muted hover:bg-muted-bg flex-shrink-0"
                title="Cancel (Escape)"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Album cards ── */}
        {albums.map(album => (
          <div
            key={album.id}
            onClick={() => {
              if (editingId === album.id) return;
              navigate(`/album/${album.id}`);
            }}
            className="group cursor-pointer flex flex-col"
          >
            {/* Cover */}
            <div className="relative aspect-square rounded-2xl bg-muted-bg border border-border overflow-hidden mb-3 shadow-sm group-hover:shadow-md transition-all duration-200">
              {album.cover_thumb_url ? (
                <img
                  src={album.cover_thumb_url}
                  alt={album.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted group-hover:text-primary transition-colors">
                  <FolderOpen size={48} strokeWidth={1.5} />
                  <span className="text-sm mt-2 font-medium">Empty</span>
                </div>
              )}

              {/* Hover gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

              {/* Action buttons — appear on hover */}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={e => startRename(album.id, album.name, e)}
                  className="w-8 h-8 flex items-center justify-center bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-full text-white transition-colors"
                  title="Rename album"
                >
                  <Edit2 size={13} />
                </button>
                <button
                  onClick={e => requestDelete(album.id, e)}
                  className="w-8 h-8 flex items-center justify-center bg-black/50 hover:bg-red-600/80 backdrop-blur-sm rounded-full text-white transition-colors"
                  title="Delete album"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Photo count badge */}
              <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-xs bg-black/60 text-white px-2 py-0.5 rounded-full backdrop-blur-sm">
                  {album.photo_count} photo{album.photo_count !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Name / inline rename */}
            {editingId === album.id ? (
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <input
                  type="text"
                  value={editName}
                  autoFocus
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commitRename(album.id); }
                    if (e.key === 'Escape') cancelRename();
                  }}
                  onBlur={() => {
                    // Only save on blur if the user typed something different
                    if (!renameCommittedRef.current) commitRename(album.id);
                  }}
                  className="flex-1 min-w-0 px-2 py-1 text-sm font-semibold bg-background border border-primary rounded outline-none text-foreground"
                  maxLength={80}
                />
                <button
                  onMouseDown={e => { e.preventDefault(); commitRename(album.id); }}
                  className="w-6 h-6 flex items-center justify-center rounded bg-primary text-white flex-shrink-0"
                >
                  <Check size={12} strokeWidth={3} />
                </button>
              </div>
            ) : (
              <div className="flex flex-col px-1">
                <h3 className="font-semibold text-foreground text-base truncate group-hover:text-primary transition-colors">
                  {album.name}
                </h3>
                <p className="text-sm text-muted">
                  {album.photo_count} photo{album.photo_count !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>
        ))}

        {/* Empty state */}
        {!loading && albums.length === 0 && !isCreating && (
          <div className="col-span-full flex flex-col items-center justify-center py-24 text-muted gap-4">
            <FolderOpen size={64} strokeWidth={1} className="text-muted/30" />
            <p className="text-lg font-medium">No albums yet</p>
            <p className="text-sm">Click "New Album" to create your first album</p>
          </div>
        )}
      </div>

      {/* ── Delete confirmation dialog ── */}
      {confirmDeleteId && (() => {
        const album = albums.find(a => a.id === confirmDeleteId);
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setConfirmDeleteId(null)}
          >
            <div
              className="bg-background border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-in fade-in zoom-in-95 duration-150"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                  <Trash2 size={18} className="text-red-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Delete Album</h3>
                  <p className="text-sm text-muted">"{album?.name}"</p>
                </div>
              </div>
              <p className="text-sm text-muted mb-6">
                This album will be permanently deleted. Your photos will remain in the gallery.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 px-4 py-2 rounded-lg border border-border text-foreground text-sm hover:bg-muted-bg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors"
                >
                  Delete Album
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
