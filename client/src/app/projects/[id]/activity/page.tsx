'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Activity, Code2, Clock, User, Play,
  ShieldCheck, UserPlus, FileCode, GitBranch, Edit3,
  Brain, Trash2, Plus
} from 'lucide-react';

interface ActivityItem {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  user?: { displayName: string };
}

const AVATAR_COLORS = ['avatar-blue', 'avatar-purple', 'avatar-green', 'avatar-orange', 'avatar-red', 'avatar-cyan', 'avatar-pink'];

function getAvatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

const ACTIVITY_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
  'execution':  { icon: <Play size={14} />, color: 'var(--accent-green)' },
  'analysis':   { icon: <ShieldCheck size={14} />, color: 'var(--accent-purple)' },
  'prediction': { icon: <Brain size={14} />, color: 'var(--accent-orange)' },
  'member':     { icon: <UserPlus size={14} />, color: 'var(--accent-blue)' },
  'file':       { icon: <FileCode size={14} />, color: 'var(--accent-cyan)' },
  'version':    { icon: <GitBranch size={14} />, color: 'var(--accent-yellow)' },
  'edit':       { icon: <Edit3 size={14} />, color: 'var(--text-secondary)' },
  'create':     { icon: <Plus size={14} />, color: 'var(--accent-green)' },
  'delete':     { icon: <Trash2 size={14} />, color: 'var(--accent-red)' },
  'default':    { icon: <Activity size={14} />, color: 'var(--text-tertiary)' },
};

function getActivityConfig(type: string) {
  return ACTIVITY_ICONS[type] || ACTIVITY_ICONS['default'];
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchActivity(); }, [id]);

  const fetchActivity = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${apiBase}/projects/${id}/activity`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setActivities(data.data?.activities || []);
      }
    } catch (e) {
      console.error('Failed to load activity', e);
    } finally {
      setLoading(false);
    }
  };

  // Group activities by date
  const groupedActivities: Record<string, ActivityItem[]> = {};
  activities.forEach(a => {
    const dateKey = new Date(a.createdAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    if (!groupedActivities[dateKey]) groupedActivities[dateKey] = [];
    groupedActivities[dateKey].push(a);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: '100vh', background: 'var(--bg-root)' }}>
        <div className="flex flex-col items-center gap-4">
          <span className="spinner" style={{ width: 24, height: 24 }} />
          <span className="text-secondary">Loading activity...</span>
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
            <Activity size={18} style={{ color: 'var(--accent-orange)' }} />
            <h1 style={{ fontSize: 'var(--text-xl)', margin: 0 }}>Activity</h1>
          </div>
        </div>
        <Link href={`/projects/${id}`} className="btn btn-sm btn-secondary">
          <Code2 size={14} /> Open IDE
        </Link>
      </header>

      <main style={{ maxWidth: 700, margin: '0 auto', padding: 'var(--sp-8)' }}>
        {activities.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon"><Activity size={28} /></div>
              <h3>No activity yet</h3>
              <p>Activity will appear here as you and your team work on the project — code executions, analyses, predictions, and more.</p>
              <Link href={`/projects/${id}`} className="btn btn-primary">
                <Code2 size={14} /> Open IDE
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {Object.entries(groupedActivities).map(([dateLabel, items]) => (
              <div key={dateLabel}>
                <div className="flex items-center gap-4" style={{ marginBottom: 'var(--sp-5)' }}>
                  <span className="text-sm font-semibold text-secondary">{dateLabel}</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                </div>

                <div className="flex flex-col gap-1">
                  {items.map(item => {
                    const cfg = getActivityConfig(item.type);
                    return (
                      <div key={item.id} className="flex items-start gap-4" style={{
                        padding: 'var(--sp-4) var(--sp-5)',
                        borderRadius: 'var(--radius-sm)',
                        transition: 'background var(--transition-fast)',
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{
                          width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                          background: 'var(--bg-tertiary)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: cfg.color, flexShrink: 0, marginTop: 2,
                        }}>
                          {cfg.icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="text-md" style={{ lineHeight: 1.5 }}>{item.message}</div>
                          <div className="flex items-center gap-3 text-sm text-muted" style={{ marginTop: 'var(--sp-1)' }}>
                            {item.user && (
                              <span className="flex items-center gap-2">
                                <div className={`avatar avatar-xs ${getAvatarColor(item.user.displayName)}`}>
                                  {item.user.displayName.charAt(0)}
                                </div>
                                {item.user.displayName}
                              </span>
                            )}
                            <span className="flex items-center gap-1"><Clock size={11} /> {timeAgo(item.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
