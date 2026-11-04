'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

export interface EditorTab {
  fileId: string;
  fileName: string;
  language: string;
  isDirty: boolean;
}

interface TabsContextType {
  tabs: EditorTab[];
  activeTabId: string | null;
  openFile: (fileId: string, fileName: string) => void;
  closeTab: (fileId: string) => void;
  setActiveTab: (fileId: string) => void;
  markDirty: (fileId: string, dirty: boolean) => void;
  closeAllTabs: () => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
}

const TabsContext = createContext<TabsContextType | null>(null);

function getLanguage(name: string): string {
  const map: Record<string, string> = {
    '.py': 'python', '.js': 'javascript', '.ts': 'typescript', '.tsx': 'typescript',
    '.jsx': 'javascript', '.java': 'java', '.json': 'json', '.md': 'markdown',
    '.html': 'html', '.css': 'css', '.yml': 'yaml', '.yaml': 'yaml',
    '.xml': 'xml', '.sql': 'sql', '.sh': 'shell',
  };
  const ext = name.slice(name.lastIndexOf('.'));
  return map[ext] || 'plaintext';
}

export function TabsProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const previousActiveRef = useRef<string | null>(null);

  const openFile = useCallback((fileId: string, fileName: string) => {
    setTabs(prev => {
      const existing = prev.find(t => t.fileId === fileId);
      if (existing) {
        // Already open — just activate
        return prev;
      }
      // Add new tab
      return [...prev, {
        fileId,
        fileName,
        language: getLanguage(fileName),
        isDirty: false,
      }];
    });
    setActiveTabId(prevActive => {
      previousActiveRef.current = prevActive;
      return fileId;
    });
  }, []);

  const closeTab = useCallback((fileId: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.fileId === fileId);
      if (idx === -1) return prev;
      const newTabs = prev.filter(t => t.fileId !== fileId);
      return newTabs;
    });

    setActiveTabId(prevActive => {
      if (prevActive !== fileId) return prevActive;

      // Need to pick a new active tab
      // Prefer: previously active, then adjacent, then first
      return null; // Will be resolved in effect
    });

    // Resolve active tab after state updates
    setTimeout(() => {
      setTabs(currentTabs => {
        setActiveTabId(currentActive => {
          if (currentActive !== null) {
            // Check if current active still exists
            if (currentTabs.find(t => t.fileId === currentActive)) {
              return currentActive;
            }
          }
          // Try previous
          if (previousActiveRef.current && currentTabs.find(t => t.fileId === previousActiveRef.current)) {
            return previousActiveRef.current;
          }
          // Take last tab
          if (currentTabs.length > 0) {
            return currentTabs[currentTabs.length - 1].fileId;
          }
          return null;
        });
        return currentTabs;
      });
    }, 0);
  }, []);

  const setActiveTab = useCallback((fileId: string) => {
    setActiveTabId(prevActive => {
      previousActiveRef.current = prevActive;
      return fileId;
    });
  }, []);

  const markDirty = useCallback((fileId: string, dirty: boolean) => {
    setTabs(prev => prev.map(t =>
      t.fileId === fileId ? { ...t, isDirty: dirty } : t
    ));
  }, []);

  const closeAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTabId(null);
  }, []);

  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabs(prev => {
      const newTabs = [...prev];
      const [moved] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, moved);
      return newTabs;
    });
  }, []);

  return (
    <TabsContext.Provider value={{
      tabs, activeTabId, openFile, closeTab, setActiveTab, markDirty, closeAllTabs, reorderTabs,
    }}>
      {children}
    </TabsContext.Provider>
  );
}

export function useTabs() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('useTabs must be used within TabsProvider');
  return ctx;
}
