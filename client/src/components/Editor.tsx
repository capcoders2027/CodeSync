'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import MonacoEditor from '@monaco-editor/react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Wifi, WifiOff, Loader, Users } from 'lucide-react';

interface EditorProps {
  projectId: string;
  fileId: string;
  fileName: string;
}

export function Editor({ projectId, fileId, fileName }: EditorProps) {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [connectedUsers, setConnectedUsers] = useState(0);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const disposableRef = useRef<any>(null);
  const yObserverRef = useRef<any>(null);
  const ytextRef = useRef<Y.Text | null>(null);
  const isApplyingRemote = useRef(false);
  const currentFileIdRef = useRef<string>(fileId);

  const getLanguage = (name: string) => {
    const map: Record<string, string> = {
      '.py': 'python', '.js': 'javascript', '.ts': 'typescript', '.tsx': 'typescript',
      '.jsx': 'javascript', '.java': 'java', '.json': 'json', '.md': 'markdown',
      '.html': 'html', '.css': 'css', '.yml': 'yaml', '.yaml': 'yaml',
      '.xml': 'xml', '.sql': 'sql', '.sh': 'shell', '.bash': 'shell',
    };
    const ext = name.slice(name.lastIndexOf('.'));
    return map[ext] || 'plaintext';
  };

  const cleanup = useCallback(() => {
    if (disposableRef.current) {
      disposableRef.current.dispose();
      disposableRef.current = null;
    }
    if (yObserverRef.current && ytextRef.current) {
      try { ytextRef.current.unobserve(yObserverRef.current); } catch {}
      yObserverRef.current = null;
      ytextRef.current = null;
    }
    if (providerRef.current) {
      providerRef.current.destroy();
      providerRef.current = null;
    }
    if (ydocRef.current) {
      ydocRef.current.destroy();
      ydocRef.current = null;
    }
    isApplyingRemote.current = false;
    setConnectedUsers(0);
  }, []);

  const setupYjs = useCallback((editor: any, fId: string) => {
    if (!editor) return;
    cleanup();

    const model = editor.getModel();
    if (model) model.setValue('');

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    currentFileIdRef.current = fId;

    const token = localStorage.getItem('accessToken');
    // Derive WS URL from the API URL env var (http->ws, https->wss)
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    const wsBase = apiBase.replace(/^http/, 'ws').replace(/\/api$/, '');
    const provider = new WebsocketProvider(
      `${wsBase}/api/ws/projects/${projectId}/files/${fId}`,
      `project:${projectId}:file:${fId}`,
      ydoc,
      { connect: true, params: { token: token || '' } }
    );
    providerRef.current = provider;

    const ytext = ydoc.getText('monaco');
    ytextRef.current = ytext;

    if (!model) return;

    // Yjs -> Monaco
    const yObserver = () => {
      if (currentFileIdRef.current !== fId) return;
      if (isApplyingRemote.current) return;
      isApplyingRemote.current = true;
      try {
        const currentValue = model.getValue();
        const newValue = ytext.toString();
        if (currentValue !== newValue) model.setValue(newValue);
      } finally {
        isApplyingRemote.current = false;
      }
    };
    yObserverRef.current = yObserver;
    ytext.observe(yObserver);

    // Monaco -> Yjs
    const disposable = model.onDidChangeContent((event: any) => {
      if (currentFileIdRef.current !== fId) return;
      if (isApplyingRemote.current) return;
      isApplyingRemote.current = true;
      try {
        ydoc.transact(() => {
          for (const change of event.changes) {
            if (change.rangeLength > 0) ytext.delete(change.rangeOffset, change.rangeLength);
            if (change.text) ytext.insert(change.rangeOffset, change.text);
          }
        });
      } finally {
        isApplyingRemote.current = false;
      }
    });
    disposableRef.current = disposable;

    // Connection events
    provider.on('status', (event: { status: string }) => {
      if (currentFileIdRef.current !== fId) return;
      setConnectionStatus(event.status as any);
    });

    provider.on('sync', (isSynced: boolean) => {
      if (!isSynced || currentFileIdRef.current !== fId) return;
      isApplyingRemote.current = true;
      try {
        const content = ytext.toString();
        if (model.getValue() !== content) model.setValue(content);
      } finally {
        isApplyingRemote.current = false;
      }
    });

    // Track awareness (connected users)
    const awareness = provider.awareness;
    awareness.setLocalState({ user: { name: 'User', color: '#58a6ff' } });
    const awarenessHandler = () => {
      if (currentFileIdRef.current !== fId) return;
      setConnectedUsers(awareness.getStates().size);
    };
    awareness.on('change', awarenessHandler);
    awarenessHandler();
  }, [projectId, cleanup]);

  const handleEditorDidMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Custom theme
    monaco.editor.defineTheme('codesync-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#0d1117',
        'editor.foreground': '#e6edf3',
        'editorLineNumber.foreground': '#484f58',
        'editorLineNumber.activeForeground': '#8b949e',
        'editor.selectionBackground': '#264f78',
        'editor.lineHighlightBackground': '#161b22',
        'editorCursor.foreground': '#58a6ff',
        'editorIndentGuide.background': '#21262d',
        'editorIndentGuide.activeBackground': '#30363d',
      },
    });
    monaco.editor.setTheme('codesync-dark');

    setupYjs(editor, fileId);
  }, [fileId, setupYjs]);

  useEffect(() => {
    if (editorRef.current) {
      setConnectionStatus('connecting');
      setupYjs(editorRef.current, fileId);
    }
    return () => cleanup();
  }, [fileId]);

  const statusConfig = {
    connecting: { icon: <Loader size={12} className="animate-spin" />, label: 'Connecting', color: 'var(--accent-yellow)' },
    connected: { icon: <Wifi size={12} />, label: 'Synced', color: 'var(--accent-green)' },
    disconnected: { icon: <WifiOff size={12} />, label: 'Offline', color: 'var(--accent-red)' },
  };

  const status = statusConfig[connectionStatus];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Editor Tab Bar */}
      <div className="flex items-center justify-between" style={{
        height: 36,
        padding: '0 var(--sp-5)',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div className="flex items-center gap-3">
          <span style={{
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-primary)',
            padding: '2px 8px',
            backgroundColor: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-xs)',
          }}>
            {fileName}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* Connected users */}
          {connectedUsers > 1 && (
            <div className="flex items-center gap-2" style={{ fontSize: 'var(--text-sm)', color: 'var(--accent-blue)' }}>
              <Users size={12} />
              <span>{connectedUsers} online</span>
            </div>
          )}

          {/* Connection status */}
          <div className="flex items-center gap-2" style={{ fontSize: 'var(--text-xs)', color: status.color }}>
            {status.icon}
            <span>{status.label}</span>
          </div>
        </div>
      </div>

      {/* Monaco Editor */}
      <div style={{ flex: 1, position: 'relative' }}>
        <MonacoEditor
          key={fileId}
          height="100%"
          language={getLanguage(fileName)}
          theme="codesync-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "'JetBrains Mono', monospace",
            fontLigatures: true,
            padding: { top: 16, bottom: 16 },
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            renderLineHighlight: 'line',
            lineNumbers: 'on',
            glyphMargin: true,
            folding: true,
            bracketPairColorization: { enabled: true },
            guides: {
              bracketPairs: true,
              indentation: true,
            },
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
          }}
          onMount={handleEditorDidMount}
        />
      </div>
    </div>
  );
}
