'use client';

import { AuthProvider } from '../contexts/AuthContext';
import { ToastProvider } from '../contexts/ToastContext';
import { TabsProvider } from '../contexts/TabsContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { WorkspaceProvider } from '../contexts/WorkspaceContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <TabsProvider>
            <WorkspaceProvider>
              {children}
            </WorkspaceProvider>
          </TabsProvider>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
