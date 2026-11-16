'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

export interface EditorTab {
  fileId: string;
  fileName: string;
  language: string;
  isDirty: boolean;
  projectId?: string;
}

interface TabsContextType {
  tabs: EditorTab[];
  activeTabId: string | null;
  openFile: (fileId: string, fileName: string, projectId?: string) => void;
  closeTab: (fileId: string) => void;
  setActiveTab: (fileId: string) => void;
  markDirty: (fileId: string, dirty: boolean) => void;
  closeAllTabs: () => void;
  setProjectScope: (projectId: string) => void;
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

function getSavedProjectTabs(projectId: string): { tabs: EditorTab[]; activeTabId: string | null } {
  if (typeof window === 'undefined' || !projectId) {
    return { tabs: [], activeTabId: null };
  }
  try {
    const raw = localStorage.getItem(`codesync_project_tabs_${projectId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.tabs)) {
        return {
          tabs: parsed.tabs,
          activeTabId: parsed.activeTabId || (parsed.tabs[0]?.fileId ?? null),
        };
      }
    }
  } catch {}
  return { tabs: [], activeTabId: null };
}

function persistProjectTabs(projectId: string, tabs: EditorTab[], activeTabId: string | null) {
  if (typeof window === 'undefined' || !projectId) return;
  try {
    localStorage.setItem(`codesync_project_tabs_${projectId}`, JSON.stringify({
      tabs,
      activeTabId,
    }));
  } catch {}
}

export function TabsProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const currentProjectIdRef = useRef<string | null>(null);

  const tabsRef = useRef<EditorTab[]>(tabs);
  tabsRef.current = tabs;

  const activeTabIdRef = useRef<string | null>(activeTabId);
  activeTabIdRef.current = activeTabId;

  const setProjectScope = useCallback((projectId: string) => {
    if (!projectId) return;
    if (currentProjectIdRef.current === projectId) return;

    // Persist outgoing project tabs
    if (currentProjectIdRef.current) {
      persistProjectTabs(currentProjectIdRef.current, tabsRef.current, activeTabIdRef.current);
    }

    currentProjectIdRef.current = projectId;

    // Load incoming project tabs
    const loaded = getSavedProjectTabs(projectId);
    setTabs(loaded.tabs);
    setActiveTabId(loaded.activeTabId);
  }, []);

  const openFile = useCallback((fileId: string, fileName: string, projectId?: string) => {
    const targetProjectId = projectId || currentProjectIdRef.current;
    if (projectId && currentProjectIdRef.current !== projectId) {
      currentProjectIdRef.current = projectId;
    }

    setTabs(prev => {
      const existing = prev.find(t => t.fileId === fileId);
      const nextTabs = existing
        ? prev
        : [...prev, {
            fileId,
            fileName,
            language: getLanguage(fileName),
            isDirty: false,
            projectId: targetProjectId || undefined,
          }];

      if (targetProjectId) {
        persistProjectTabs(targetProjectId, nextTabs, fileId);
      }
      return nextTabs;
    });

    setActiveTabId(fileId);
  }, []);

  const closeTab = useCallback((fileId: string) => {
    setTabs(prev => {
      const nextTabs = prev.filter(t => t.fileId !== fileId);

      // Determine next active tab
      let nextActive: string | null = activeTabIdRef.current;
      if (activeTabIdRef.current === fileId) {
        if (nextTabs.length > 0) {
          const closedIdx = prev.findIndex(t => t.fileId === fileId);
          const nextIdx = Math.max(0, Math.min(closedIdx, nextTabs.length - 1));
          nextActive = nextTabs[nextIdx].fileId;
        } else {
          nextActive = null;
        }
      }

      setActiveTabId(nextActive);

      if (currentProjectIdRef.current) {
        persistProjectTabs(currentProjectIdRef.current, nextTabs, nextActive);
      }
      return nextTabs;
    });
  }, []);

  const setActiveTab = useCallback((fileId: string) => {
    setActiveTabId(fileId);
    if (currentProjectIdRef.current) {
      persistProjectTabs(currentProjectIdRef.current, tabsRef.current, fileId);
    }
  }, []);

  const markDirty = useCallback((fileId: string, dirty: boolean) => {
    setTabs(prev => {
      const nextTabs = prev.map(t =>
        t.fileId === fileId ? { ...t, isDirty: dirty } : t
      );
      if (currentProjectIdRef.current) {
        persistProjectTabs(currentProjectIdRef.current, nextTabs, activeTabIdRef.current);
      }
      return nextTabs;
    });
  }, []);

  const closeAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTabId(null);
    if (currentProjectIdRef.current) {
      persistProjectTabs(currentProjectIdRef.current, [], null);
    }
  }, []);

  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabs(prev => {
      const nextTabs = [...prev];
      const [moved] = nextTabs.splice(fromIndex, 1);
      nextTabs.splice(toIndex, 0, moved);
      if (currentProjectIdRef.current) {
        persistProjectTabs(currentProjectIdRef.current, nextTabs, activeTabIdRef.current);
      }
      return nextTabs;
    });
  }, []);

  return (
    <TabsContext.Provider value={{
      tabs, activeTabId, openFile, closeTab, setActiveTab, markDirty, closeAllTabs, setProjectScope, reorderTabs,
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
