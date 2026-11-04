'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, History, Code2, GitBranch, Clock, User,
  Tag, ChevronRight, FileCode, Plus, Minus, Loader
} from 'lucide-react';

interface Version {
  id: string;
  versionNumber: number;
  name: string;
  description: string | null;
  createdAt: string;
  createdBy: { displayName: string };
  _count?: { analyses: number };
}

export default function VersionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: '100vh', background: 'var(--bg-root)' }}>
        <div className="flex flex-col items-center gap-4">
          <span className="spinner" style={{ width: 24, height: 24 }} />
          <span className="text-secondary">Loading versions...</span>
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
          <Link href={`/projects/${id}`} className="btn-icon" style={{ padding: '4px' }}>
            <ArrowLeft size={18} />
          </Link>
          <div className="separator-vertical" />
          <div className="flex items-center gap-3">
            <History size={18} style={{ color: 'var(--accent-cyan)' }} />
            <h1 style={{ fontSize: 'var(--text-xl)', margin: 0 }}>Version History</h1>
          </div>
        </div>
        <Link href={`/projects/${id}`} className="btn btn-sm btn-secondary">
          <Code2 size={14} /> Open IDE
        </Link>
      </header>

      <main style={{ maxWidth: 800, margin: '0 auto', padding: 'var(--sp-8)' }}>
        {versions.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon"><GitBranch size={28} /></div>
              <h3>No versions yet</h3>
              <p>Versions are created automatically when you run analyses. Each analysis captures a snapshot of your project.</p>
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
                          {idx === 0 && <span className="badge badge-blue">Latest</span>}
                        </div>
                        {version.description && (
                          <p className="text-sm text-secondary" style={{ margin: 0, marginTop: 'var(--sp-2)' }}>{version.description}</p>
                        )}
                      </div>
                      <span className="text-sm text-muted" style={{ fontFamily: 'var(--font-mono)' }}>v{version.versionNumber}</span>
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
