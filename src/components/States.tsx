import { Loader2 } from 'lucide-react';

export function Spinner({ className = 'h-5 w-5 text-primary-600' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} />;
}

export function LoadingState({ label = 'Загрузка…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-primary-400">
      <Spinner className="h-8 w-8" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-primary-200 bg-white/60 px-6 py-14 text-center">
      <p className="text-base font-semibold text-primary-700">{title}</p>
      {description && <p className="max-w-xs text-sm text-primary-400">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
