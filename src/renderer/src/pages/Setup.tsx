import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, CheckCircle2, CloudUpload, FolderOpen, Sparkles, AlertCircle } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase =
  | 'initializing'   // waiting for first progress event
  | 'creating'       // fresh install - creating channel
  | 'restoring'      // returning user - restoring data
  | 'done'           // all steps complete, about to navigate
  | 'error';         // something went wrong

interface ProgressState {
  step: number;
  total: number;
  current: number;
  label: string;
}

// ── Animated background orbs ─────────────────────────────────────────────────

function Orb({ className }: { className: string }) {
  return (
    <div
      className={`absolute rounded-full blur-3xl opacity-20 animate-pulse ${className}`}
    />
  );
}

// ── Circular progress ring ────────────────────────────────────────────────────

function ProgressRing({ pct }: { pct: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  return (
    <svg width="128" height="128" className="rotate-[-90deg]">
      {/* Track */}
      <circle
        cx="64" cy="64" r={r}
        strokeWidth="8"
        fill="none"
        stroke="rgba(255,255,255,0.1)"
      />
      {/* Progress */}
      <circle
        cx="64" cy="64" r={r}
        strokeWidth="8"
        fill="none"
        stroke="url(#ringGrad)"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <defs>
        <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ── Step indicator icon ───────────────────────────────────────────────────────

function StepIcon({ phase }: { phase: Phase }) {
  if (phase === 'done') {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <CheckCircle2 className="w-12 h-12 text-emerald-400 drop-shadow-lg" strokeWidth={1.5} />
      </div>
    );
  }
  if (phase === 'restoring') {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <FolderOpen className="w-10 h-10 text-blue-300 animate-pulse drop-shadow-lg" strokeWidth={1.5} />
      </div>
    );
  }
  if (phase === 'creating') {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <CloudUpload className="w-10 h-10 text-violet-300 animate-bounce drop-shadow-lg" strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <Camera className="w-10 h-10 text-blue-300 animate-pulse drop-shadow-lg" strokeWidth={1.5} />
    </div>
  );
}

// ── Feature pills shown during fresh install ──────────────────────────────────

const FEATURES = [
  { icon: '♾️', label: 'Unlimited storage' },
  { icon: '🔒', label: 'End-to-end encrypted' },
  { icon: '📱', label: 'Multi-device sync' },
  { icon: '⚡', label: 'Instant access' },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function Setup() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('initializing');
  const [progress, setProgress] = useState<ProgressState>({ step: 0, total: 4, current: 0, label: 'Connecting…' });
  const [errorMsg, setErrorMsg] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const handlerRef = useRef<any>(null);

  const pct = progress.total > 0
    ? Math.round((progress.step / progress.total) * 100)
    : 0;

  // ── Kick off storage setup & listen for progress ──────────────────────────

  useEffect(() => {
    // Subscribe to incremental progress from main process
    handlerRef.current = window.electronAPI.onRestoreProgress((p) => {
      setProgress(p);

      // Infer phase from label heuristics + step position
      if (p.label.toLowerCase().includes('restoring') || p.label.toLowerCase().includes('reading your library')) {
        setIsRestoring(true);
        setPhase('restoring');
      } else if (p.label.toLowerCase().includes('creating') || p.label.toLowerCase().includes('writing')) {
        setPhase('creating');
      }
    });

    // Trigger the setup
    window.electronAPI
      .setupStorage()
      .then((result) => {
        if (result.error) {
          setErrorMsg(result.error);
          setPhase('error');
          return;
        }

        setIsRestoring(result.status === 'restored');
        setProgress({ step: 1, total: 1, current: 0, label: 'All done!' });
        setPhase('done');

        // Navigate after a short celebratory pause
        setTimeout(() => navigate('/', { replace: true }), 1400);
      })
      .catch((err) => {
        setErrorMsg(err?.message ?? 'Unexpected error during storage setup.');
        setPhase('error');
      });

    return () => {
      if (handlerRef.current) {
        window.electronAPI.offRestoreProgress(handlerRef.current);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative min-h-screen bg-[#0b0f1a] flex items-center justify-center overflow-hidden">

      {/* Ambient background orbs */}
      <Orb className="w-[600px] h-[600px] bg-blue-600 -top-40 -left-40" />
      <Orb className="w-[500px] h-[500px] bg-violet-600 -bottom-32 -right-32" />
      <Orb className="w-[300px] h-[300px] bg-cyan-500 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />

      {/* Glass card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div
          className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-10 shadow-2xl text-white"
          style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}
        >

          {/* ── Error state ── */}
          {phase === 'error' && (
            <div className="flex flex-col items-center text-center gap-5">
              <div className="w-20 h-20 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                <AlertCircle className="w-10 h-10 text-red-400" strokeWidth={1.5} />
              </div>
              <div>
                <h2 className="text-2xl font-semibold mb-2">Setup Failed</h2>
                <p className="text-white/50 text-sm leading-relaxed">{errorMsg}</p>
              </div>
              <button
                onClick={() => navigate('/login', { replace: true })}
                className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-sm font-medium border border-white/10"
              >
                Back to Login
              </button>
            </div>
          )}

          {/* ── Progress state ── */}
          {phase !== 'error' && (
            <>
              {/* Header */}
              <div className="flex flex-col items-center mb-8">
                <div className="relative w-32 h-32 mb-5">
                  <ProgressRing pct={phase === 'done' ? 100 : pct} />
                  <StepIcon phase={phase} />
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-yellow-400" />
                  <span className="text-xs font-medium uppercase tracking-widest text-white/40">
                    {isRestoring ? 'Restoring Gallery' : 'First Launch Setup'}
                  </span>
                  <Sparkles className="w-4 h-4 text-yellow-400" />
                </div>

                <h1 className="text-2xl font-semibold text-center">
                  {phase === 'done'
                    ? (isRestoring ? 'Gallery Restored!' : 'You\'re all set!')
                    : isRestoring
                    ? 'Restoring your gallery…'
                    : 'Setting up your storage…'}
                </h1>
              </div>

              {/* Progress bar */}
              <div className="mb-3">
                <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-400 to-violet-400"
                    style={{
                      width: `${phase === 'done' ? 100 : pct}%`,
                      transition: 'width 0.5s ease',
                    }}
                  />
                </div>
              </div>

              {/* Step label */}
              <p className="text-center text-sm text-white/50 mb-8 min-h-[20px] transition-all duration-300">
                {progress.label}
              </p>

              {/* Stats row — shown when restoring */}
              {isRestoring && (
                <div className="grid grid-cols-2 gap-3 mb-8">
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-4 text-center">
                    <p className="text-2xl font-bold text-blue-300">{progress.current}</p>
                    <p className="text-xs text-white/40 mt-1">Photos found</p>
                  </div>
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-4 text-center">
                    <p className="text-2xl font-bold text-violet-300">
                      {Math.max(0, progress.total - progress.step)}
                    </p>
                    <p className="text-xs text-white/40 mt-1">Steps remaining</p>
                  </div>
                </div>
              )}

              {/* Feature pills — shown during fresh install */}
              {!isRestoring && phase !== 'done' && (
                <div className="grid grid-cols-2 gap-2">
                  {FEATURES.map((f) => (
                    <div
                      key={f.label}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 border border-white/8 text-sm"
                    >
                      <span className="text-base">{f.icon}</span>
                      <span className="text-white/60 text-xs">{f.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Done celebration */}
              {phase === 'done' && (
                <div className="flex flex-col items-center gap-3">
                  <p className="text-white/40 text-sm">Taking you to your gallery…</p>
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Bottom brand mark */}
        <p className="text-center text-white/20 text-xs mt-6">
          TeleGallery · Powered by Telegram MTProto
        </p>
      </div>
    </div>
  );
}
