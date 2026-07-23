import { useCallback, useState } from 'react';
import type { ToastMessage } from '@/components/Toast';

export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((message: string, type: ToastMessage['type'] = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  return { toasts, dismiss, notify };
}

export type ToastFn = (message: string, type?: ToastMessage['type']) => void;
