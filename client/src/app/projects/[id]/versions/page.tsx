'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useToast } from '../../../../contexts/ToastContext';
import { useTheme } from '../../../../contexts/ThemeContext';
import {
  ArrowLeft, History, Code2, GitBranch, Clock, User,
  Tag, ChevronRight, FileCode, Plus, Minus, Loader,
  RotateCcw, LayoutDashboard, Sun, Moon, CheckCircle
} from 'lucide-react';

interface Version {
  id: string;
  versionNumber: number;
  name: string;
  message?: string | null;
  description?: string | null;
  createdAt: string;
  createdBy: { displayName: string };
  _count?: { files: number; analyses: number };
}

export default function VersionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const { theme, toggleTheme } = useTheme();
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => { fetchVersions(); }, [id]);

  const fetchVersions = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${apiBase}/projects/${id}/versions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setVersions(data.data?.versions || []);
      }
    } catch (e) {
      console.error('Failed to load versions', e);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (version: Version) => {
    if (!confirm(`Are you sure you want to restore "${version.name}" (v${version.versionNumber})? Current working files will be updated to this snapshot.`)) {
      return;
    }

    setRestoringId(version.id);
    try {
      const token = localStorage.getItem('accessToken');
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${apiBase}/projects/${id}/versions/${version.id}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      if (res.ok) {
        toast.success('Version restored', data.message || `Restored version v${version.versionNumber}`);
        fetchVersions();
      } else {
        toast.error('Failed to restore', data.message || 'Could not restore files.');
      }
    } catch {
      toast.error('Connection error', 'Unable to reach server.');
    } finally {
      setRestoringId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: '100vh', background: 'var(--bg-root)' }}>
        <div className="flex flex-col items-center gap-4">
          <span className="spinner" style={{ width: 24, height: 24 }} />
          <span className="text-secondary">Loading version history...</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-root)' }}>
      {/* Header */}
      <header className="flex items-center justify-between" style={{
        height: 52, padding: '0 var(--sp-8)',
        borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-primary)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div className="flex items-center gap-4">
          <Link href={`/projects/${id}`} className="btn-icon" style={{ padding: '4px' }} title="Back to Project">
            <ArrowLeft size={18} />
          </Link>
          <div className="separator-vertical" />
          <div className="flex items-center gap-3">
            <History size={18} style={{ color: 'var(--accent-cyan)' }} />
            <h1 style={{ fontSize: 'var(--text-xl)', margin: 0 }}>Version Snapshots</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="btn btn-sm btn-ghost"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <Link href="/dashboard" className="btn btn-sm btn-ghost">
            <LayoutDashboard size={14} /> Dashboard
          </Link>
          <Link href={`/projects/${id}`} className="btn btn-sm btn-secondary">
            <Code2 size={14} /> Open IDE
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 840, margin: '0 auto', padding: 'var(--sp-8)' }}>
        {versions.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon"><GitBranch size={28} /></div>
              <h3>No versions recorded</h3>
              <p>Versions are captured whenever you run static code analysis or take a project snapshot.</p>
              <Link href={`/projects/${id}`} className="btn btn-primary">
                <Code2 size={14} /> Open IDE
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            {/* Timeline line */}
            <div style={{
              position: 'absolute',
              left: 19,
              top: 24,
              bottom: 24,
              width: 2,
              background: 'var(--border-subtle)',
            }} />

            <div className="flex flex-col gap-1">
              {versions.map((version, idx) => (
                <div key={version.id} className="flex items-start gap-5 animate-slide" style={{ position: 'relative' }}>
                  {/* Timeline dot */}
                  <div style={{
                    width: 40,
                    display: 'flex',
                    justifyContent: 'center',
                    flexShrink: 0,
                    paddingTop: 18,
                  }}>
                    <div style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: idx === 0 ? 'var(--accent-blue)' : 'var(--bg-quaternary)',
                      border: `2px solid ${idx === 0 ? 'var(--accent-blue)' : 'var(--border-default)'}`,
                      boxShadow: idx === 0 ? '0 0 8px rgba(88, 166, 255, 0.3)' : 'none',
                      zIndex: 1,
                    }} />
                  </div>

                  {/* Card */}
                  <div className="card flex-1" style={{
                    padding: 'var(--sp-6)',
                    marginBottom: 'var(--sp-4)',
                    borderLeft: idx === 0 ? '2px solid var(--accent-blue)' : undefined,
                  }}>
                    <div className="flex items-start justify-between" style={{ marginBottom: 'var(--sp-4)' }}>
                      <div>
                        <div className="flex items-center gap-3" style={{ marginBottom: 'var(--sp-2)' }}>
                          <Tag size={14} style={{ color: idx === 0 ? 'var(--accent-blue)' : 'var(--text-tertiary)' }} />
                          <span className="font-semibold text-lg">{version.name}</span>
                          {idx === 0 && <span className="badge badge-blue">Current Head</span>}
                          {version._count?.files !== undefined && (
                            <span className="badge badge-secondary">{version._count.files} files</span>
                          )}
                        </div>
                        {(version.message || version.description) && (
                          <p className="text-sm text-secondary" style={{ margin: 0, marginTop: 'var(--sp-2)' }}>
                            {version.message || version.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted" style={{ fontFamily: 'var(--font-mono)' }}>v{version.versionNumber}</span>
                        {idx !== 0 && (
                          <button
                            onClick={() => handleRestore(version)}
                            disabled={restoringId === version.id}
                            className="btn btn-sm btn-ghost"
                            title="Restore this snapshot into working workspace"
                          >
                            {restoringId === version.id ? <Loader size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                            Restore
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-5 text-sm text-tertiary">
                      <span className="flex items-center gap-2">
                        <User size={12} /> {version.createdBy.displayName}
                      </span>
                      <span className="flex items-center gap-2">
                        <Clock size={12} /> {new Date(version.createdAt).toLocaleDateString(undefined, {
                          month: 'short', day: 'numeric', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
