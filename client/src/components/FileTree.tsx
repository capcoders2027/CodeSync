'use client';

import React, { useState, useEffect } from 'react';
import {
  FileCode, Folder, FolderOpen, ChevronRight, ChevronDown,
  Plus, Trash2, FilePlus, FolderPlus, MoreHorizontal
} from 'lucide-react';

interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  parentId: string | null;
}

interface FileTreeProps {
  projectId: string;
  onSelectFile: (fileId: string, fileName: string) => void;
  activeFileId: string | null;
}

const FILE_ICONS: Record<string, { color: string }> = {
  '.py':   { color: '#3572A5' },
  '.js':   { color: '#f1e05a' },
  '.ts':   { color: '#3178c6' },
  '.tsx':  { color: '#3178c6' },
  '.jsx':  { color: '#f1e05a' },
  '.json': { color: '#6e7681' },
  '.md':   { color: '#58a6ff' },
  '.html': { color: '#e34c26' },
  '.css':  { color: '#563d7c' },
  '.java': { color: '#b07219' },
};

function getFileColor(name: string) {
  const ext = name.slice(name.lastIndexOf('.'));
  return FILE_ICONS[ext]?.color || 'var(--text-tertiary)';
}

export function FileTree({ projectId, onSelectFile, activeFileId }: FileTreeProps) {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFiles();
  }, [projectId]);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${apiBase}/projects/${projectId}/files`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFiles(data.data.files);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (type: 'file' | 'folder', parentId: string | null) => {
    const name = prompt(`Enter ${type} name:`);
    if (!name) return;

    const token = localStorage.getItem('accessToken');
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    await fetch(`${apiBase}/projects/${projectId}/files`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name, type, parentId })
    });
    fetchFiles();
    setContextMenu(null);
  };

  const handleDelete = async (fileId: string) => {
    if (!confirm('Are you sure you want to delete this?')) return;
    const token = localStorage.getItem('accessToken');
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    await fetch(`${apiBase}/projects/${projectId}/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    fetchFiles();
    setContextMenu(null);
  };

  const toggleFolder = (folderId: string) => {
    const newSet = new Set(expandedFolders);
    if (newSet.has(folderId)) newSet.delete(folderId);
    else newSet.add(folderId);
    setExpandedFolders(newSet);
  };

  const renderTree = (parentId: string | null, depth = 0): React.ReactNode[] => {
    const children = files
      .filter(f => f.parentId === parentId)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    return children.map(file => {
      const isActive = activeFileId === file.id;
      const isExpanded = expandedFolders.has(file.id);

      return (
        <div key={file.id}>
          <div
            onClick={() => {
              if (file.type === 'folder') toggleFolder(file.id);
              else onSelectFile(file.id, file.name);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ id: file.id, x: e.clientX, y: e.clientY });
            }}
            className="file-tree-item"
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '3px 8px 3px',
              paddingLeft: `${depth * 16 + 8}px`,
              cursor: 'pointer',
              fontSize: 'var(--text-base)',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              backgroundColor: isActive ? 'var(--bg-active)' : 'transparent',
              borderLeft: isActive ? '2px solid var(--accent-blue)' : '2px solid transparent',
              transition: 'all var(--transition-fast)',
              gap: '4px',
              minHeight: '28px',
              userSelect: 'none',
            }}
            onMouseEnter={e => {
              if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
            }}
            onMouseLeave={e => {
              if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            {/* Chevron / spacer */}
            <span style={{ width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {file.type === 'folder' && (
                isExpanded
                  ? <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} />
                  : <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
              )}
            </span>

            {/* Icon */}
            <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {file.type === 'folder'
                ? (isExpanded
                    ? <FolderOpen size={14} style={{ color: 'var(--accent-blue)' }} />
                    : <Folder size={14} style={{ color: 'var(--accent-blue)' }} />
                  )
                : <FileCode size={14} style={{ color: getFileColor(file.name) }} />
              }
            </span>

            {/* Name */}
            <span style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginLeft: '4px',
              fontFamily: file.type === 'file' ? 'var(--font-mono)' : 'var(--font-sans)',
              fontSize: file.type === 'file' ? 'var(--text-sm)' : 'var(--text-base)',
            }}>
              {file.name}
            </span>

            {/* Actions on hover */}
            <span className="file-tree-actions" style={{
              display: 'flex',
              gap: '2px',
            }}>
              {file.type === 'folder' && (
                <button
                  className="btn-icon"
                  onClick={(e) => { e.stopPropagation(); handleCreate('file', file.id); }}
                  data-tooltip="New file"
                  style={{ padding: '2px' }}
                >
                  <FilePlus size={12} />
                </button>
              )}
              <button
                className="btn-icon"
                onClick={(e) => { e.stopPropagation(); handleDelete(file.id); }}
                style={{ padding: '2px', color: 'var(--text-muted)' }}
              >
                <Trash2 size={12} />
              </button>
            </span>
          </div>
          {file.type === 'folder' && isExpanded && renderTree(file.id, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div style={{
      width: '250px',
      minWidth: '250px',
      backgroundColor: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{
        padding: 'var(--sp-4) var(--sp-5)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <span style={{
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
          letterSpacing: 'var(--tracking-wide)',
        }}>
          Explorer
        </span>
        <div className="flex items-center gap-1">
          <button
            className="btn-icon"
            onClick={() => handleCreate('file', null)}
            data-tooltip="New file"
            style={{ padding: '3px' }}
          >
            <FilePlus size={14} />
          </button>
          <button
            className="btn-icon"
            onClick={() => handleCreate('folder', null)}
            data-tooltip="New folder"
            style={{ padding: '3px' }}
          >
            <FolderPlus size={14} />
          </button>
        </div>
      </div>

      {/* Tree */}
      <div style={{ overflowY: 'auto', flex: 1, paddingTop: 'var(--sp-2)', paddingBottom: 'var(--sp-4)' }}>
        {loading ? (
          <div style={{ padding: 'var(--sp-6)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            {[1,2,3,4].map(i => (
              <div key={i} className="skeleton skeleton-text" style={{ width: `${60 + i * 15}%`, height: 12 }} />
            ))}
          </div>
        ) : files.length === 0 ? (
          <div style={{ padding: 'var(--sp-6)', textAlign: 'center' }}>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--sp-4)' }}>No files yet</p>
            <button className="btn btn-secondary btn-sm" onClick={() => handleCreate('file', null)}>
              <FilePlus size={12} /> New file
            </button>
          </div>
        ) : (
          renderTree(null)
        )}
      </div>
    </div>
  );
}
