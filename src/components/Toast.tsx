import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

const config: Record<ToastMessage['type'], { bg: string; ring: string; icon: string }> = {
  success: { bg: 'bg-success-600', ring: 'ring-success-600/20', icon: '✓' },
  error: { bg: 'bg-error-600', ring: 'ring-error-600/20', icon: '!' },
  info: { bg: 'bg-primary-600', ring: 'ring-primary-600/20', icon: 'i' },
};

export function Toast({ toasts, onDismiss }: ToastProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 no-print">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  const c = config[toast.type];
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 3500);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div className={`flex items-center gap-3 rounded-xl ${c.bg} px-4 py-3 text-sm font-medium text-white shadow-card-hover ring-2 ${c.ring} animate-slide-up max-w-sm`}>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
        {c.icon}
      </span>
      <span className="flex-1">{toast.message}</span>
      <button onClick={() => onDismiss(toast.id)} className="rounded p-0.5 text-white/70 transition hover:text-white">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export type { ToastMessage };
