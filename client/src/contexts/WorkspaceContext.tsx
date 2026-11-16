'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

interface WorkspaceState {
  project: any | null;
  runConfig: any | null;
  collaborators: { displayName: string; id: string }[];
  explorerWidth: number;
  bottomPanelHeight: number;
  bottomPanel: 'none' | 'terminal' | 'output';
  fileContentCache: Record<string, string>;
}

interface WorkspaceContextType {
  getWorkspace: (projectId: string) => WorkspaceState | undefined;
  setWorkspace: (projectId: string, state: Partial<WorkspaceState>) => void;
  cacheFileContent: (fileId: string, content: string) => void;
  getCachedFileContent: (fileId: string) => string | undefined;
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  getWorkspace: () => undefined,
  setWorkspace: () => {},
  cacheFileContent: () => {},
  getCachedFileContent: () => undefined,
});

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Record<string, WorkspaceState>>({});
  const [fileCache, setFileCache] = useState<Record<string, string>>({});

  const getWorkspace = useCallback((projectId: string) => {
    return workspaces[projectId];
  }, [workspaces]);

  const setWorkspace = useCallback((projectId: string, updates: Partial<WorkspaceState>) => {
    setWorkspaces(prev => {
      const existing = prev[projectId] || {
        project: null,
        runConfig: null,
        collaborators: [],
        explorerWidth: 250,
        bottomPanelHeight: 250,
        bottomPanel: 'none',
        fileContentCache: {},
      };
      return {
        ...prev,
        [projectId]: { ...existing, ...updates },
      };
    });
  }, []);

  const cacheFileContent = useCallback((fileId: string, content: string) => {
    setFileCache(prev => ({ ...prev, [fileId]: content }));
  }, []);

  const getCachedFileContent = useCallback((fileId: string) => {
    return fileCache[fileId];
  }, [fileCache]);

  return (
    <WorkspaceContext.Provider value={{ getWorkspace, setWorkspace, cacheFileContent, getCachedFileContent }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export const useWorkspace = () => useContext(WorkspaceContext);
