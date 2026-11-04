'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { CreateProjectModal } from '../components/CreateProjectModal';
import { ShareProjectModal } from '../components/ShareProjectModal';
import Link from 'next/link';
import { apiGet } from '../lib/api';
import {
  Plus, FolderCode, Users, Clock, Code2, ArrowRight, LogOut,
  LayoutDashboard, Search, ChevronRight, Activity, ShieldCheck,
  Brain, Terminal, GitBranch, Zap, BarChart3, Play, FileCode,
  Layers, Shield, Share2, Trash2
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

/* ─── Animated Code Preview Component ─── */
function AnimatedCodePreview() {
  const [displayedLines, setDisplayedLines] = useState(0);

  const codeLines = [
    { indent: 0, parts: [{ text: 'import ', cls: 'code-keyword' }, { text: '{ analyze }', cls: 'code-type' }, { text: ' from ', cls: 'code-keyword' }, { text: "'codesync'", cls: 'code-string' }] },
    { indent: 0, parts: [] },
    { indent: 0, parts: [{ text: 'async function ', cls: 'code-keyword' }, { text: 'detectDefects', cls: 'code-function' }, { text: '(project) {', cls: '' }] },
    { indent: 1, parts: [{ text: 'const ', cls: 'code-keyword' }, { text: 'metrics = ', cls: '' }, { text: 'await ', cls: 'code-keyword' }, { text: 'analyze', cls: 'code-function' }, { text: '(project)', cls: '' }] },
    { indent: 1, parts: [{ text: 'const ', cls: 'code-keyword' }, { text: 'risk = metrics.', cls: '' }, { text: 'predictRisk', cls: 'code-function' }, { text: '()', cls: '' }] },
    { indent: 0, parts: [] },
    { indent: 1, parts: [{ text: '// SonarQube + ML-powered analysis', cls: 'code-comment' }] },
    { indent: 1, parts: [{ text: 'return ', cls: 'code-keyword' }, { text: '{ score: risk, level: ', cls: '' }, { text: "'safe'", cls: 'code-string' }, { text: ' }', cls: '' }] },
    { indent: 0, parts: [{ text: '}', cls: '' }] },
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setDisplayedLines(prev => {
        if (prev >= codeLines.length) {
          clearInterval(timer);
          return prev;
        }
        return prev + 1;
      });
    }, 300);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="code-preview animate-slide" style={{ animationDelay: '300ms' }}>
      <div className="code-preview-header">
        <div className="code-preview-dot" style={{ background: '#ff5f57' }} />
        <div className="code-preview-dot" style={{ background: '#febc2e' }} />
        <div className="code-preview-dot" style={{ background: '#28c840' }} />
        <span style={{ marginLeft: 'var(--sp-4)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>analysis.ts</span>
      </div>
      <div className="code-preview-body">
        {codeLines.slice(0, displayedLines).map((line, i) => (
          <div key={i} style={{ paddingLeft: `${line.indent * 20}px`, minHeight: '1.8em' }}>
            {line.parts.map((part, j) => (
              <span key={j} className={part.cls}>{part.text}</span>
            ))}
          </div>
        ))}
        {displayedLines < codeLines.length && <span className="typing-cursor" />}
      </div>
    </div>
  );
}

export default function Home() {
  const { user, isLoading, logout } = useAuth();
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [shareProject, setShareProject] = useState<{ id: string; name: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    if (!confirm(`Are you sure you want to permanently delete "${projectName}"? This action cannot be undone.`)) {
      return;
    }
    setDeletingId(projectId);
    try {
      const token = localStorage.getItem('accessToken');
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
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
    else if (!isLoading) setLoading(false);
  }, [user, isLoading]);

  // Not authenticated — landing page
  if (!isLoading && !user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Landing header */}
        <header className="flex items-center justify-between" style={{
          padding: 'var(--sp-6) var(--sp-9)',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-primary)',
          position: 'sticky', top: 0, zIndex: 20,
        }}>
          <div className="flex items-center gap-3">
            <div style={{
              width: 32, height: 32, borderRadius: 'var(--radius-sm)',
              background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Code2 size={18} color="#fff" />
            </div>
            <span style={{ fontWeight: 700, fontSize: 'var(--text-xl)' }}>CodeSync</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/auth/login" className="btn btn-ghost">Sign in</Link>
            <Link href="/auth/register" className="btn btn-blue">Get started</Link>
          </div>
        </header>

        {/* Hero */}
        <div className="flex items-center justify-center" style={{
          flex: 'none', padding: 'var(--sp-12) var(--sp-8)',
          position: 'relative', overflow: 'hidden',
          minHeight: '80vh',
        }}>
          {/* Glow effects */}
          <div className="hero-glow hero-glow-blue" />
          <div className="hero-glow hero-glow-purple" />
          <div className="hero-glow hero-glow-green" />

          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-12)',
            maxWidth: 1100, width: '100%', alignItems: 'center', position: 'relative', zIndex: 1,
          }}>
            {/* Left side: text */}
            <div className="animate-slide">
              <div className="badge badge-blue" style={{ marginBottom: 'var(--sp-7)', fontSize: 'var(--text-sm)', padding: '4px 14px' }}>
                Collaborative Development Platform
              </div>
              <h1 style={{ fontSize: 'var(--text-5xl)', lineHeight: 1.15, marginBottom: 'var(--sp-7)' }}>
                Write code together.<br />
                <span style={{ color: 'var(--accent-blue)' }}>Ship smarter.</span>
              </h1>
              <p style={{ fontSize: 'var(--text-xl)', color: 'var(--text-secondary)', maxWidth: 480, lineHeight: 1.6, marginBottom: 'var(--sp-9)' }}>
                Real-time collaborative coding with SonarQube analysis and ML-powered defect-risk prediction. Built for teams that care about code quality.
              </p>
              <div className="flex items-center gap-4">
                <Link href="/auth/register" className="btn btn-blue btn-lg">
                  Start building <ArrowRight size={18} />
                </Link>
                <Link href="/auth/login" className="btn btn-secondary btn-lg">Sign in</Link>
              </div>

              {/* Trust badges */}
              <div className="flex items-center gap-8" style={{ marginTop: 'var(--sp-10)' }}>
                {[
                  { icon: <Shield size={16} />, text: 'SonarQube Analysis' },
                  { icon: <Brain size={16} />, text: 'ML Risk Scoring' },
                  { icon: <Users size={16} />, text: 'Real-time Collab' },
                ].map(b => (
                  <span key={b.text} className="flex items-center gap-2" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
                    {b.icon} {b.text}
                  </span>
                ))}
              </div>
            </div>

            {/* Right side: animated code preview */}
            <div className="hide-mobile">
              <AnimatedCodePreview />
            </div>
          </div>
        </div>

        {/* Feature Section */}
        <div style={{ padding: 'var(--sp-12) var(--sp-8)', background: 'var(--bg-root)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 'var(--sp-11)' }}>
              <h2 style={{ fontSize: 'var(--text-3xl)', marginBottom: 'var(--sp-4)' }}>Everything you need to build better software</h2>
              <p style={{ fontSize: 'var(--text-lg)', maxWidth: 560, margin: '0 auto' }}>
                From real-time collaboration to intelligent defect detection, CodeSync covers the full development workflow.
              </p>
            </div>

            <div className="grid stagger" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--sp-7)' }}>
              {[
                {
                  icon: <Users size={24} />, title: 'Real-time Collaboration',
                  desc: 'CRDT-powered collaborative editing with Yjs. See cursors, edits, and awareness in real-time across your entire team.',
                  accent: 'var(--accent-blue)', bg: 'var(--accent-blue-bg)',
                },
                {
                  icon: <ShieldCheck size={24} />, title: 'Static Code Analysis',
                  desc: 'Integrated SonarQube analysis detects code smells, bugs, and vulnerabilities with detailed severity breakdowns.',
                  accent: 'var(--accent-purple)', bg: 'var(--accent-purple-bg)',
                },
                {
                  icon: <Brain size={24} />, title: 'ML Risk Prediction',
                  desc: 'Trained classifiers predict defect probability using code metrics. Get risk scores before you ship.',
                  accent: 'var(--accent-orange)', bg: 'var(--accent-orange-bg)',
                },
                {
                  icon: <Terminal size={24} />, title: 'In-Browser Execution',
                  desc: 'Run your code directly in the browser with a real terminal. Supports Python, Node.js, Java, and more.',
                  accent: 'var(--accent-green)', bg: 'var(--accent-green-bg)',
                },
                {
                  icon: <GitBranch size={24} />, title: 'Version Snapshots',
                  desc: 'Capture immutable snapshots of your code at any point. Compare changes and track project evolution over time.',
                  accent: 'var(--accent-cyan)', bg: 'rgba(57, 210, 192, 0.10)',
                },
                {
                  icon: <BarChart3 size={24} />, title: 'Analytics Dashboard',
                  desc: 'Visualize code quality trends, complexity metrics, and team activity with interactive charts and timelines.',
                  accent: 'var(--accent-pink)', bg: 'rgba(219, 97, 162, 0.10)',
                },
              ].map(f => (
                <div key={f.title} className="feature-card animate-slide" style={{ '--feature-accent': f.accent } as any}>
                  <div className="feature-card-icon" style={{ background: f.bg, color: f.accent }}>
                    {f.icon}
                  </div>
                  <h4 style={{ marginBottom: 'var(--sp-3)', fontSize: 'var(--text-lg)' }}>{f.title}</h4>
                  <p style={{ fontSize: 'var(--text-md)', margin: 0, lineHeight: 1.6 }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* How it Works */}
        <div style={{ padding: 'var(--sp-12) var(--sp-8)', background: 'var(--bg-primary)' }}>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 'var(--sp-11)' }}>
              <h2 style={{ fontSize: 'var(--text-3xl)', marginBottom: 'var(--sp-4)' }}>How it works</h2>
              <p style={{ fontSize: 'var(--text-lg)', maxWidth: 480, margin: '0 auto' }}>
                Get from code to confidence in three simple steps.
              </p>
            </div>

            <div className="flex flex-col gap-9 stagger">
              {[
                {
                  num: '1', title: 'Write & Collaborate',
                  desc: 'Create a project, invite your team, and start coding together in real-time. Every keystroke is synchronized across all editors.',
                  icon: <Code2 size={20} />,
                },
                {
                  num: '2', title: 'Analyze & Detect',
                  desc: 'Trigger a code analysis to scan your project with SonarQube. View detected code smells, complexity metrics, and quality insights.',
                  icon: <ShieldCheck size={20} />,
                },
                {
                  num: '3', title: 'Predict & Ship',
                  desc: 'The ML engine processes your code metrics and predicts defect risk. Ship with confidence knowing your code has been validated.',
                  icon: <Zap size={20} />,
                },
              ].map((step, i) => (
                <div key={step.num} className="flex gap-7 animate-slide" style={{ position: 'relative' }}>
                  <div style={{ position: 'relative' }}>
                    <div className="step-number" style={{
                      background: 'var(--accent-blue-bg)',
                      color: 'var(--accent-blue)',
                      border: '2px solid rgba(56, 139, 253, 0.3)',
                    }}>
                      {step.num}
                    </div>
                    {i < 2 && <div className="step-connector" />}
                  </div>
                  <div style={{ paddingBottom: 'var(--sp-4)' }}>
                    <div className="flex items-center gap-3" style={{ marginBottom: 'var(--sp-3)' }}>
                      <span style={{ color: 'var(--accent-blue)' }}>{step.icon}</span>
                      <h4 style={{ margin: 0 }}>{step.title}</h4>
                    </div>
                    <p style={{ margin: 0, fontSize: 'var(--text-md)', lineHeight: 1.7 }}>{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA Banner */}
        <div style={{
          padding: 'var(--sp-12) var(--sp-8)', textAlign: 'center',
          background: 'linear-gradient(180deg, var(--bg-primary) 0%, var(--bg-root) 100%)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div className="hero-glow hero-glow-blue" style={{ top: '50%', right: '30%', transform: 'translateY(-50%)', opacity: 0.6 }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h2 style={{ fontSize: 'var(--text-3xl)', marginBottom: 'var(--sp-5)' }}>Ready to build smarter?</h2>
            <p style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--sp-8)', maxWidth: 480, margin: '0 auto var(--sp-8)' }}>
              Join CodeSync and start shipping higher quality code with your team.
            </p>
            <Link href="/auth/register" className="btn btn-blue btn-lg">
              Create free account <ArrowRight size={18} />
            </Link>
          </div>
        </div>

        {/* Footer */}
        <footer className="landing-footer">
          <div className="footer-grid">
            <div>
              <div className="flex items-center gap-3" style={{ marginBottom: 'var(--sp-5)' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 'var(--radius-xs)',
                  background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Code2 size={14} color="#fff" />
                </div>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>CodeSync</span>
              </div>
              <p style={{ fontSize: 'var(--text-md)', maxWidth: 300, lineHeight: 1.6, margin: 0 }}>
                Collaborative Code Development and Intelligent Defect-Risk Analysis Platform.
              </p>
            </div>
            <div>
              <div className="footer-heading">Platform</div>
              <span className="footer-link">Real-time Editor</span>
              <span className="footer-link">Code Analysis</span>
              <span className="footer-link">Risk Prediction</span>
              <span className="footer-link">Terminal</span>
            </div>
            <div>
              <div className="footer-heading">Stack</div>
              <span className="footer-link">Next.js</span>
              <span className="footer-link">Express.js</span>
              <span className="footer-link">PostgreSQL</span>
              <span className="footer-link">SonarQube</span>
            </div>
            <div>
              <div className="footer-heading">ML</div>
              <span className="footer-link">Scikit-Learn</span>
              <span className="footer-link">FastAPI</span>
              <span className="footer-link">HGBoost</span>
              <span className="footer-link">Random Forest</span>
            </div>
          </div>
          <div className="footer-bottom">
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              © {new Date().getFullYear()} CodeSync. Built for developers.
            </span>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              Capstone Project
            </span>
          </div>
        </footer>
      </div>
    );
  }

  // Loading
  if (isLoading || loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <AppHeader user={null} onLogout={() => {}} />
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

  // Dashboard stats: count unique distinct users across all accessible projects
  const totalAnalyses = projects.reduce((sum, p) => sum + (p._count?.analyses || 0), 0);
  const uniqueMemberIds = new Set<string>();
  projects.forEach(p => {
    if (p.ownerId) uniqueMemberIds.add(p.ownerId);
    p.members?.forEach(m => uniqueMemberIds.add(m.userId));
  });
  const totalMembers = uniqueMemberIds.size || (projects.length > 0 ? 1 : 0);
  const recentProject = projects.length > 0 ? projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] : null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-root)' }}>
      <AppHeader user={user} onLogout={logout} />

      <main style={{ flex: 1, padding: 'var(--sp-9)', maxWidth: 1100, width: '100%', margin: '0 auto' }}>
        {/* Welcome & Actions */}
        <div className="flex justify-between items-start animate-in" style={{ marginBottom: 'var(--sp-8)' }}>
          <div>
            <h1 style={{ fontSize: 'var(--text-3xl)', marginBottom: 'var(--sp-2)' }}>
              Good {getGreeting()}, {user!.displayName.split(' ')[0]}
            </h1>
            <p style={{ fontSize: 'var(--text-md)', margin: 0 }}>
              {projects.length === 0 ? 'Create your first project to get started.' : `You have ${projects.length} project${projects.length !== 1 ? 's' : ''}.`}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={16} /> New Project
          </button>
        </div>

        {/* Quick Stats */}
        {projects.length > 0 && (
          <div className="stats-grid animate-in" style={{ marginBottom: 'var(--sp-9)' }}>
            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: 'var(--accent-blue-bg)', color: 'var(--accent-blue)' }}>
                <FolderCode size={22} />
              </div>
              <div>
                <div className="stat-card-value">{projects.length}</div>
                <div className="stat-card-label">Projects</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)' }}>
                <ShieldCheck size={22} />
              </div>
              <div>
                <div className="stat-card-value">{totalAnalyses}</div>
                <div className="stat-card-label">Analyses</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: 'var(--accent-green-bg)', color: 'var(--accent-green)' }}>
                <Users size={22} />
              </div>
              <div>
                <div className="stat-card-value">{totalMembers}</div>
                <div className="stat-card-label">Team Members</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: 'var(--accent-orange-bg)', color: 'var(--accent-orange)' }}>
                <Activity size={22} />
              </div>
              <div>
                <div className="stat-card-value">{recentProject ? timeAgo(recentProject.updatedAt) : '—'}</div>
                <div className="stat-card-label">Last Activity</div>
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        {projects.length > 0 && (
          <div style={{ position: 'relative', marginBottom: 'var(--sp-8)' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search projects..."
              style={{ paddingLeft: '36px', maxWidth: 400 }}
            />
          </div>
        )}

        {/* Empty State */}
        {projects.length === 0 && (
          <div className="card animate-slide">
            <div className="empty-state">
              <div className="empty-state-icon">
                <FolderCode size={28} />
              </div>
              <h3>No projects yet</h3>
              <p>Create your first project and start collaborating with your team.</p>
              <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                <Plus size={16} /> Create Project
              </button>
            </div>
          </div>
        )}

        {/* Project Grid */}
        {filteredProjects.length > 0 && (
          <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--sp-6)' }}>
            {filteredProjects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="card card-interactive animate-slide" style={{ padding: 'var(--sp-7)', height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <div className="flex items-start justify-between" style={{ marginBottom: 'var(--sp-5)' }}>
                    <div className="flex items-center gap-3" style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        width: 10, height: 10, borderRadius: '50%',
                        backgroundColor: LANG_COLORS[project.language] || 'var(--text-muted)',
                        flexShrink: 0,
                      }} />
                      <h3 className="truncate" style={{ fontSize: 'var(--text-lg)', margin: 0 }}>{project.name}</h3>
                    </div>
                    
                    {/* Action buttons */}
                    <div className="flex items-center gap-1" style={{ flexShrink: 0, marginLeft: 'var(--sp-3)' }}>
                      <button
                        type="button"
                        className="btn-icon"
                        title="Share project"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShareProject({ id: project.id, name: project.name });
                        }}
                        style={{ padding: '4px', color: 'var(--text-secondary)' }}
                      >
                        <Share2 size={15} />
                      </button>

                      {project.ownerId === user!.id && (
                        <button
                          type="button"
                          className="btn-icon"
                          title="Delete project"
                          disabled={deletingId === project.id}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteProject(project.id, project.name);
                          }}
                          style={{ padding: '4px', color: 'var(--accent-red)' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}

                      <ChevronRight size={16} style={{ color: 'var(--text-muted)', marginLeft: '2px' }} />
                    </div>
                  </div>

                  {project.description && (
                    <p className="truncate" style={{ fontSize: 'var(--text-base)', margin: '0 0 var(--sp-5)', color: 'var(--text-tertiary)' }}>
                      {project.description}
                    </p>
                  )}

                  <div className="flex items-center gap-5 flex-wrap" style={{ marginTop: 'auto', fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
                    <span className="badge badge-muted" style={{ textTransform: 'capitalize' }}>{project.language}</span>
                    <span className="flex items-center gap-2">
                      <Users size={12} /> {project._count.members}
                    </span>
                    <span className="flex items-center gap-2">
                      <Clock size={12} /> {timeAgo(project.updatedAt)}
                    </span>
                    {project._count.analyses > 0 && (
                      <span className="flex items-center gap-2">
                        <ShieldCheck size={12} /> {project._count.analyses}
                      </span>
                    )}
                    {project.ownerId !== user!.id && (
                      <span className="badge badge-blue" style={{ fontSize: '9px' }}>SHARED</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {search && filteredProjects.length === 0 && projects.length > 0 && (
          <div className="card" style={{ padding: 'var(--sp-11)', textAlign: 'center' }}>
            <p className="text-secondary">No projects matching &quot;{search}&quot;</p>
          </div>
        )}
      </main>

      {isModalOpen && (
        <CreateProjectModal
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setIsModalOpen(false);
            fetchProjects();
          }}
        />
      )}

      {shareProject && (
        <ShareProjectModal
          projectId={shareProject.id}
          projectName={shareProject.name}
          onClose={() => setShareProject(null)}
          onSuccess={() => {
            fetchProjects();
          }}
        />
      )}
    </div>
  );
}

/* App Header */
function AppHeader({ user, onLogout }: { user: any; onLogout: () => void }) {
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
      <Link href="/" className="flex items-center gap-3" style={{ textDecoration: 'none' }}>
        <div style={{
          width: 28, height: 28, borderRadius: 'var(--radius-xs)',
          background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Code2 size={16} color="#fff" />
        </div>
        <span style={{ fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>CodeSync</span>
      </Link>

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
                  <button className="dropdown-item" onClick={() => { setMenuOpen(false); }}>
                    <LayoutDashboard size={16} /> Dashboard
                  </button>
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
    </header>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
