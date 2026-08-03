import React from 'react';

interface ToastProps {
  message: string;
  onDismiss: () => void;
  durationMs?: number;
}

/** Aviso breve no bloqueante (p. ej. stock de maples). */
export default function Toast({ message, onDismiss, durationMs = 5000 }: ToastProps) {
  React.useEffect(() => {
    const t = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(t);
  }, [onDismiss, durationMs]);

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-[60] w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <p>{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-amber-800/80 hover:text-amber-950"
          aria-label="Cerrar"
        >
          ×
        </button>
      </div>
    </div>
  );
}
