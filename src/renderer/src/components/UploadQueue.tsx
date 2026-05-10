import { useState, useEffect } from 'react';
import { X, CheckCircle2, Clock, UploadCloud, AlertCircle, RefreshCw } from 'lucide-react';

interface UploadItem {
  fileId: string;
  filePath?: string;
  filename?: string;
  status: string;
  progress: number;
  speed: string;
  error?: string;
}

export default function UploadQueue() {
  const [uploads, setUploads] = useState<Map<string, UploadItem>>(new Map());
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    const handleProgress = window.electronAPI.onUploadProgress((data: UploadItem) => {
      setUploads((prev) => {
        const next = new Map(prev);
        next.set(data.fileId, { ...next.get(data.fileId), ...data });
        return next;
      });
    });

    const handleComplete = window.electronAPI.onUploadComplete(() => {
      // Auto-dismiss after 4s when all done
      setTimeout(() => {
        setUploads(prev => {
          const next = new Map(prev);
          for (const [k, v] of next) {
            if (v.progress === 100) next.delete(k);
          }
          return next;
        });
      }, 4000);
    });

    // Handle per-file errors with retry info
    const handleFileError = (data: { fileId: string; filePath: string; error: string }) => {
      setUploads((prev) => {
        const next = new Map(prev);
        next.set(data.fileId, {
          fileId: data.fileId,
          filePath: data.filePath,
          status: 'Error',
          progress: 0,
          speed: '',
          error: data.error,
        });
        return next;
      });
    };

    window.electronAPI.onUploadFileError?.(handleFileError);

    return () => {
      window.electronAPI.offUploadProgress(handleProgress);
      window.electronAPI.offUploadComplete(handleComplete);
    };
  }, []);

  const handleRetry = async (item: UploadItem) => {
    if (!item.filePath) return;
    setUploads(prev => {
      const next = new Map(prev);
      next.set(item.fileId, { ...item, status: 'Retrying', progress: 0, error: undefined });
      return next;
    });
    await window.electronAPI.uploadFiles([item.filePath]);
  };

  const uploadList = Array.from(uploads.values());
  const isUploading = uploadList.some((u) => u.progress < 100 && u.status !== 'Error');
  const totalCompleted = uploadList.filter((u) => u.progress === 100).length;
  const hasErrors = uploadList.some((u) => u.status === 'Error');

  if (uploadList.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-card border border-border shadow-xl rounded-xl overflow-hidden z-50 flex flex-col animate-in slide-in-from-bottom-8">
      {/* Header */}
      <div
        className="px-4 py-3 bg-muted-bg border-b border-border flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {isUploading ? (
            <UploadCloud size={18} className="text-primary animate-pulse" />
          ) : hasErrors ? (
            <AlertCircle size={18} className="text-red-500" />
          ) : (
            <CheckCircle2 size={18} className="text-green-500" />
          )}
          <span className="font-medium text-sm text-foreground">
            {isUploading
              ? `Uploading ${uploadList.length - totalCompleted} item${uploadList.length - totalCompleted !== 1 ? 's' : ''}…`
              : hasErrors
              ? `${hasErrors ? uploadList.filter(u => u.status === 'Error').length : 0} failed`
              : `${totalCompleted} upload${totalCompleted !== 1 ? 's' : ''} complete`}
          </span>
        </div>
        <button
          className="p-1 hover:bg-black/5 rounded-md transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            setUploads(new Map());
          }}
        >
          <X size={16} className="text-muted" />
        </button>
      </div>

      {/* List */}
      {isExpanded && (
        <div className="max-h-64 overflow-y-auto p-2 bg-background scrollbar-thin">
          {uploadList.map((item) => (
            <div key={item.fileId} className="flex flex-col p-2 hover:bg-muted-bg rounded-lg transition-colors group">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 overflow-hidden">
                  {item.progress === 100 ? (
                    <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                  ) : item.status === 'Error' ? (
                    <AlertCircle size={14} className="text-red-500 shrink-0" />
                  ) : (
                    <Clock size={14} className="text-primary animate-pulse shrink-0" />
                  )}
                  <span className="text-xs font-medium truncate w-44 text-foreground" title={item.filename || item.fileId}>
                    {item.status === 'Error' ? (
                      <span className="text-red-500">{item.error || 'Upload failed'}</span>
                    ) : (
                      item.filename || item.status
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {item.status === 'Error' && item.filePath && (
                    <button
                      onClick={() => handleRetry(item)}
                      className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium px-2 py-0.5 rounded bg-primary/10 hover:bg-primary/20 transition-colors"
                      title="Retry upload"
                    >
                      <RefreshCw size={10} />
                      Retry
                    </button>
                  )}
                  <span className="text-xs text-muted font-mono">{Math.round(item.progress)}%</span>
                </div>
              </div>

              <div className="w-full bg-border rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    item.status === 'Error' ? 'bg-red-500' : 'bg-primary'
                  }`}
                  style={{ width: `${item.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
