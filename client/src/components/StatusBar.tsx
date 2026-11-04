'use client';

import React from 'react';
import { GitBranch, AlertCircle, CheckCircle, Wifi, WifiOff } from 'lucide-react';

interface StatusBarProps {
  language: string;
  fileName?: string;
  line?: number;
  col?: number;
  connectionStatus?: 'connected' | 'connecting' | 'disconnected';
  connectedUsers?: number;
  projectName?: string;
}

const LANG_LABELS: Record<string, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  java: 'Java',
  json: 'JSON',
  markdown: 'Markdown',
  html: 'HTML',
  css: 'CSS',
  yaml: 'YAML',
  xml: 'XML',
  sql: 'SQL',
  shell: 'Shell',
  plaintext: 'Plain Text',
};

function getLanguageFromFile(name: string): string {
  const ext = name.slice(name.lastIndexOf('.'));
  const map: Record<string, string> = {
    '.py': 'python', '.js': 'javascript', '.ts': 'typescript', '.tsx': 'typescript',
    '.jsx': 'javascript', '.java': 'java', '.json': 'json', '.md': 'markdown',
    '.html': 'html', '.css': 'css', '.yml': 'yaml', '.yaml': 'yaml',
    '.xml': 'xml', '.sql': 'sql', '.sh': 'shell', '.bash': 'shell',
  };
  return map[ext] || 'plaintext';
}

export function StatusBar({ language, fileName, line, col, connectionStatus, connectedUsers, projectName }: StatusBarProps) {
  const fileLang = fileName ? getLanguageFromFile(fileName) : language;
  const langLabel = LANG_LABELS[fileLang] || fileLang;

  return (
    <div className="status-bar">
      {/* Left section */}
      <div className="status-bar-accent">
        <GitBranch size={12} />
        main
      </div>

      {connectionStatus && (
        <div className="status-bar-item" style={{
          color: connectionStatus === 'connected' ? 'var(--accent-green)' :
                 connectionStatus === 'connecting' ? 'var(--accent-yellow)' : 'var(--accent-red)',
        }}>
          {connectionStatus === 'connected' ? <CheckCircle size={12} /> :
           connectionStatus === 'disconnected' ? <WifiOff size={12} /> :
           <Wifi size={12} />}
          {connectionStatus === 'connected' ? 'Synced' : connectionStatus === 'connecting' ? 'Connecting...' : 'Offline'}
        </div>
      )}

      {connectionStatus === 'connected' && connectedUsers && connectedUsers > 1 && (
        <div className="status-bar-item" style={{ color: 'var(--accent-blue)' }}>
          {connectedUsers} online
        </div>
      )}

      {/* Spacer */}
      <div className="status-bar-separator" />

      {/* Right section */}
      {fileName && line !== undefined && col !== undefined && (
        <div className="status-bar-item">
          Ln {line}, Col {col}
        </div>
      )}

      <div className="status-bar-item">
        UTF-8
      </div>

      <div className="status-bar-item">
        {langLabel}
      </div>

      <div className="status-bar-item" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
        CodeSync
      </div>
    </div>
  );
}
