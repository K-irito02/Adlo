import { useState, useCallback } from 'react';
import type { ToastType } from '@components/Toast';

export function useBrowserToast() {
  const [toastMessages, setToastMessages] = useState<
    { id: string; message: string; type?: ToastType; source?: string }[]
  >([]);

  const showToast = useCallback((message: string, type?: ToastType, source?: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setToastMessages((prev) => [...prev, { id, message, type, source }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToastMessages((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toastMessages, showToast, removeToast };
}
