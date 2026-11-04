'use client';

import { AuthProvider } from '../contexts/AuthContext';
import { ToastProvider } from '../contexts/ToastContext';
import { TabsProvider } from '../contexts/TabsContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <TabsProvider>
          {children}
        </TabsProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
