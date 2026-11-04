'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  exiting?: boolean;
}

interface ToastContextType {
  toast: (type: ToastType, title: string, description?: string) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 200);
  }, []);

  const addToast = useCallback((type: ToastType, title: string, description?: string) => {
    const id = `toast-${++toastId}`;
    setToasts(prev => [...prev.slice(-4), { id, type, title, description }]);

    const timer = setTimeout(() => removeToast(id), 4000);
    timersRef.current.set(id, timer);
  }, [removeToast]);

  const icons: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle size={18} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />,
    error: <XCircle size={18} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />,
    warning: <AlertTriangle size={18} style={{ color: 'var(--accent-yellow)', flexShrink: 0 }} />,
    info: <Info size={18} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />,
  };

  const ctx: ToastContextType = {
    toast: addToast,
    success: (t, d) => addToast('success', t, d),
    error: (t, d) => addToast('error', t, d),
    warning: (t, d) => addToast('warning', t, d),
    info: (t, d) => addToast('info', t, d),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}${t.exiting ? ' toast-exit' : ''}`}>
            {icons[t.type]}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-md)', color: 'var(--text-primary)', marginBottom: t.description ? 2 : 0 }}>{t.title}</div>
              {t.description && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{t.description}</div>}
            </div>
            <button className="btn-icon" onClick={() => removeToast(t.id)} style={{ flexShrink: 0 }}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
