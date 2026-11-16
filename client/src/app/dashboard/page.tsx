'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useTheme } from '../../contexts/ThemeContext';
import { CreateProjectModal } from '../../components/CreateProjectModal';
import { ShareProjectModal } from '../../components/ShareProjectModal';
import Link from 'next/link';
import { apiGet } from '../../lib/api';
import { getApiBase } from '../../lib/apiBase';
import {
  Plus, FolderCode, Users, Clock, Code2, LogOut,
  Search, ChevronRight, Activity, ShieldCheck,
  Brain, Terminal, GitBranch, Zap, BarChart3,
  Shield, Share2, Trash2, Sun, Moon, Home as HomeIcon
} from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description: string | null;
  language: string;
  updatedAt: string;
  createdAt: string;
  ownerId: string;
  owner: { id: string; displayName: string };
  members?: { userId: string }[];
  _count: { members: number; files: number; analyses: number };
}

const LANG_COLORS: Record<string, string> = {
  python: '#3572A5',
  javascript: '#f1e05a',
  typescript: '#3178c6',
  java: '#b07219',
};

const AVATAR_COLORS = ['avatar-blue', 'avatar-purple', 'avatar-green', 'avatar-orange', 'avatar-red', 'avatar-cyan', 'avatar-pink'];

function getAvatarColor(name: string) {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className="btn-icon"
      title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
      style={{ padding: '6px' }}
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function DashboardHeader({ user, onLogout }: { user: any; onLogout: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex items-center justify-between" style={{
      height: 'var(--header-height)',
      padding: '0 var(--sp-8)',
      borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--bg-primary)',
      position: 'sticky',
      top: 0,
      zIndex: 'var(--z-sticky)' as any,
    }}>
      <div className="flex items-center gap-4">
        <Link href="/" className="flex items-center gap-3" style={{ textDecoration: 'none' }} title="Go to Home Page">
          <div style={{
            width: 28, height: 28, borderRadius: 'var(--radius-xs)',
            background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Code2 size={16} color="#fff" />
          </div>
          <span style={{ fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>CodeSync</span>
        </Link>

        <div className="separator-vertical" />

        <Link
          href="/"
          className="btn btn-sm btn-ghost"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
          title="Back to Home Page"
        >
          <HomeIcon size={14} /> Home
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <ThemeToggleButton />

        {user && (
          <div className="dropdown">
            <button
              className="flex items-center gap-3 btn-ghost"
              onClick={() => setMenuOpen(!menuOpen)}
              style={{ padding: 'var(--sp-2) var(--sp-4)', borderRadius: 'var(--radius-sm)' }}
            >
              <div className={`avatar avatar-sm ${getAvatarColor(user.displayName)}`}>
                {user.displayName.charAt(0)}
              </div>
              <span className="text-md font-medium hide-mobile">{user.displayName}</span>
            </button>

            {menuOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setMenuOpen(false)} />
                <div className="dropdown-menu" style={{ zIndex: 10 }}>
                  <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div className="text-md font-semibold">{user.displayName}</div>
                    <div className="text-sm text-tertiary">{user.email}</div>
                  </div>
                  <div style={{ padding: 'var(--sp-2)' }}>
                    <Link href="/" className="dropdown-item" onClick={() => setMenuOpen(false)}>
                      <HomeIcon size={16} /> Home Page
                    </Link>
                    <div className="dropdown-divider" />
                    <button className="dropdown-item dropdown-item-danger" onClick={() => { setMenuOpen(false); onLogout(); }}>
                      <LogOut size={16} /> Sign out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

export default function DashboardPage() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [shareProject, setShareProject] = useState<{ id: string; name: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/auth/login');
    }
  }, [user, isLoading, router]);

  const fetchProjects = async () => {
    try {
      const res = await apiGet('/projects');
      if (res.ok) setProjects(res.data.projects);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchProjects();
  }, [user]);

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    if (!confirm(`Are you sure you want to permanently delete "${projectName}"? This action cannot be undone.`)) {
      return;
    }
    setDeletingId(projectId);
    try {
      const token = localStorage.getItem('accessToken');
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/projects/${projectId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success('Project deleted', `"${projectName}" was permanently deleted.`);
        fetchProjects();
      } else {
        const data = await res.json();
        toast.error('Failed to delete', data.message || 'Could not delete project.');
      }
    } catch {
      toast.error('Network error', 'Could not reach server.');
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading || loading || !user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <DashboardHeader user={null} onLogout={() => {}} />
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <span className="spinner" style={{ width: 24, height: 24 }} />
          <span className="text-secondary">Loading workspace...</span>
        </div>
      </div>
    );
  }

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.language.toLowerCase().includes(search.toLowerCase())
  );

  const totalAnalyses = projects.reduce((sum, p) => sum + (p._count?.analyses || 0), 0);
  const uniqueMemberIds = new Set<string>();
  projects.forEach(p => {
    if (p.ownerId) uniqueMemberIds.add(p.ownerId);
    p.members?.forEach(m => uniqueMemberIds.add(m.userId));
  });
  const totalMembers = uniqueMemberIds.size || (projects.length > 0 ? 1 : 0);
  const recentProject = projects.length > 0 ? [...projects].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] : null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-root)' }}>
      <DashboardHeader user={user} onLogout={logout} />

      <main style={{ flex: 1, padding: 'var(--sp-9)', maxWidth: 1100, width: '100%', margin: '0 auto' }}>
        {/* Welcome & Actions */}
        <div className="flex justify-between items-start animate-in" style={{ marginBottom: 'var(--sp-8)' }}>
          <div>
            <h1 style={{ fontSize: 'var(--text-3xl)', marginBottom: 'var(--sp-2)' }}>
              Good {getGreeting()}, {user?.displayName}
            </h1>
            <p className="text-secondary text-base">
              Manage your projects, collaborate in real-time, and monitor code quality.
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="btn btn-blue"
            style={{ padding: 'var(--sp-3) var(--sp-6)', gap: 'var(--sp-2)' }}
          >
            <Plus size={16} /> New project
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-3 animate-in" style={{ gap: 'var(--sp-6)', marginBottom: 'var(--sp-9)' }}>
          <div className="card" style={{ padding: 'var(--sp-6)' }}>
            <div className="flex items-center gap-4">
              <div style={{
                width: 44, height: 44, borderRadius: 'var(--radius-md)',
                background: 'rgba(56, 189, 248, 0.1)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)',
              }}>
                <FolderCode size={22} />
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>{projects.length}</div>
                <div className="text-secondary text-sm">Active Projects</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 'var(--sp-6)' }}>
            <div className="flex items-center gap-4">
              <div style={{
                width: 44, height: 44, borderRadius: 'var(--radius-md)',
                background: 'rgba(34, 197, 94, 0.1)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: 'var(--accent-green)',
              }}>
                <BarChart3 size={22} />
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>{totalAnalyses}</div>
                <div className="text-secondary text-sm">Total Analyses Run</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 'var(--sp-6)' }}>
            <div className="flex items-center gap-4">
              <div style={{
                width: 44, height: 44, borderRadius: 'var(--radius-md)',
                background: 'rgba(168, 85, 247, 0.1)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: 'var(--accent-purple)',
              }}>
                <Users size={22} />
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>{totalMembers}</div>
                <div className="text-secondary text-sm">Team Collaborators</div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Resume Recent Project Banner */}
        {recentProject && (
          <div className="card animate-in" style={{
            padding: 'var(--sp-6) var(--sp-8)',
            marginBottom: 'var(--sp-8)',
            background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.06), rgba(168, 85, 247, 0.06))',
            borderColor: 'var(--border-subtle)',
          }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div style={{
                  width: 40, height: 40, borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-elevated)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Code2 size={20} style={{ color: LANG_COLORS[recentProject.language] || 'var(--accent-blue)' }} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-tertiary" style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>Last edited</span>
                    <span className="badge badge-secondary" style={{ fontSize: '10px', padding: '1px 6px' }}>{recentProject.language}</span>
                  </div>
                  <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>{recentProject.name}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link href={`/projects/${recentProject.id}`} className="btn btn-primary" style={{ gap: 'var(--sp-2)' }}>
                  Resume Coding <ChevronRight size={16} />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="flex items-center justify-between" style={{ marginBottom: 'var(--sp-6)' }}>
          <div className="search-bar" style={{ maxWidth: 360, width: '100%' }}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Search projects by name or language..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <span className="text-secondary text-sm">
            {filteredProjects.length} of {projects.length} projects
          </span>
        </div>

        {/* Projects Grid */}
        {filteredProjects.length === 0 ? (
          <div className="card flex flex-col items-center justify-center text-center animate-in" style={{ padding: 'var(--sp-12)' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-elevated)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 'var(--sp-5)', color: 'var(--text-tertiary)',
            }}>
              <FolderCode size={28} />
            </div>
            <h3 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--sp-2)' }}>
              {search ? 'No matching projects found' : 'No projects yet'}
            </h3>
            <p className="text-secondary text-sm" style={{ maxWidth: 380, marginBottom: 'var(--sp-6)' }}>
              {search ? `No projects match "${search}". Try another search term.` : 'Create your first project to start collaborative coding with real-time analysis.'}
            </p>
            {!search && (
              <button onClick={() => setIsModalOpen(true)} className="btn btn-blue" style={{ gap: 'var(--sp-2)' }}>
                <Plus size={16} /> Create Project
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-2 animate-in" style={{ gap: 'var(--sp-6)' }}>
            {filteredProjects.map(project => {
              const langColor = LANG_COLORS[project.language] || '#6e7681';
              return (
                <div key={project.id} className="card card-interactive" style={{ padding: 'var(--sp-6)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div className="flex items-center justify-between" style={{ marginBottom: 'var(--sp-3)' }}>
                      <Link
                        href={`/projects/${project.id}`}
                        style={{ textDecoration: 'none', color: 'inherit' }}
                        className="flex items-center gap-3 hover-text-blue"
                      >
                        <div style={{
                          width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                          background: 'var(--bg-elevated)', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Code2 size={16} style={{ color: langColor }} />
                        </div>
                        <span style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>{project.name}</span>
                      </Link>

                      <div className="flex items-center gap-1">
                        <button
                          className="btn-icon"
                          title="Share project"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShareProject({ id: project.id, name: project.name });
                          }}
                          style={{ padding: '4px' }}
                        >
                          <Share2 size={14} />
                        </button>

                        {project.ownerId === user?.id && (
                          <button
                            className="btn-icon"
                            title="Delete project"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteProject(project.id, project.name);
                            }}
                            disabled={deletingId === project.id}
                            style={{ padding: '4px', color: 'var(--accent-red)' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {project.description && (
                      <p className="text-secondary text-sm" style={{
                        marginBottom: 'var(--sp-5)',
                        overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}>
                        {project.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between" style={{
                    paddingTop: 'var(--sp-4)',
                    borderTop: '1px solid var(--border-subtle)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-tertiary)',
                  }}>
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1.5">
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: langColor }} />
                        <span style={{ textTransform: 'capitalize' }}>{project.language}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={12} /> {timeAgo(project.updatedAt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1" title="Collaborators">
                        <Users size={12} /> {project._count?.members || 1}
                      </span>
                      <span className="flex items-center gap-1" title="Analyses">
                        <Activity size={12} /> {project._count?.analyses || 0}
                      </span>
                      <Link href={`/projects/${project.id}`} className="text-blue hover-underline font-medium" style={{ marginLeft: 'var(--sp-2)' }}>
                        Open →
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {isModalOpen && (
        <CreateProjectModal
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => fetchProjects()}
        />
      )}

      {shareProject && (
        <ShareProjectModal
          onClose={() => setShareProject(null)}
          projectId={shareProject.id}
          projectName={shareProject.name}
        />
      )}
    </div>
  );
}
