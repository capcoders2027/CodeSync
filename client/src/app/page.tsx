'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Link from 'next/link';
import {
  Code2, ArrowRight, LayoutDashboard, Shield, Brain, Users,
  Terminal, GitBranch, Zap, BarChart3, Sun, Moon, LogOut, Sparkles
} from 'lucide-react';

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
  }, [codeLines.length]);

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

export default function Home() {
  const { user, logout } = useAuth();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tokenFromUrl = urlParams.get('token');
      if (tokenFromUrl) {
        localStorage.setItem('accessToken', tokenFromUrl);
        window.history.replaceState({}, document.title, window.location.pathname);
        window.location.reload();
      }
    }
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Landing header */}
      <header className="flex items-center justify-between" style={{
        padding: 'var(--sp-6) var(--sp-9)',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-primary)',
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <Link href="/" className="flex items-center gap-3" style={{ textDecoration: 'none' }}>
          <div style={{
            width: 32, height: 32, borderRadius: 'var(--radius-sm)',
            background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Code2 size={18} color="#fff" />
          </div>
          <span style={{ fontWeight: 700, fontSize: 'var(--text-xl)', color: 'var(--text-primary)' }}>CodeSync</span>
        </Link>

        <div className="flex items-center gap-4">
          <ThemeToggleButton />
          {user ? (
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="btn btn-blue"
                style={{ gap: '6px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
              >
                <LayoutDashboard size={15} /> Go to Dashboard
              </Link>
              <button onClick={logout} className="btn btn-ghost" title="Sign out" style={{ padding: '6px' }}>
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <>
              <Link href="/auth/login" className="btn btn-ghost">Sign in</Link>
              <Link href="/auth/register" className="btn btn-blue">Get started</Link>
            </>
          )}
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
              {user ? (
                <Link
                  href="/dashboard"
                  className="btn btn-blue btn-lg"
                  style={{ gap: '8px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                >
                  <Sparkles size={18} /> Open Workspace Dashboard <ArrowRight size={18} />
                </Link>
              ) : (
                <>
                  <Link href="/auth/register" className="btn btn-blue btn-lg">
                    Start building <ArrowRight size={18} />
                  </Link>
                  <Link href="/auth/login" className="btn btn-secondary btn-lg">Sign in</Link>
                </>
              )}
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

      {/* Features Grid */}
      <div style={{
        padding: 'var(--sp-12) var(--sp-8)',
        background: 'var(--bg-elevated)',
        borderTop: '1px solid var(--border-subtle)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 'var(--sp-12)' }}>
            <div className="badge badge-purple" style={{ marginBottom: 'var(--sp-4)', fontSize: 'var(--text-xs)' }}>
              Features
            </div>
            <h2 style={{ fontSize: 'var(--text-3xl)', marginBottom: 'var(--sp-3)' }}>
              Everything you need to write reliable software
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-lg)', maxWidth: 520, margin: '0 auto' }}>
              A complete cloud workspace combining collaborative editing, static code analysis, and ML risk forecasting.
            </p>
          </div>

          <div className="grid grid-3" style={{ gap: 'var(--sp-6)' }}>
            {[
              {
                icon: <Code2 size={24} style={{ color: 'var(--accent-blue)' }} />,
                title: 'Real-time Editor',
                desc: 'Monaco-powered editor with syntax highlighting, multi-file workspaces, and live operational transform sync.',
              },
              {
                icon: <Shield size={24} style={{ color: 'var(--accent-green)' }} />,
                title: 'SonarQube Quality',
                desc: 'Automated static analysis detecting bugs, vulnerabilities, code smells, duplication, and maintainability ratings.',
              },
              {
                icon: <Brain size={24} style={{ color: 'var(--accent-purple)' }} />,
                title: 'ML Defect Prediction',
                desc: 'Trained machine learning models analyze software engineering metrics to predict defect-risk probability before deployment.',
              },
              {
                icon: <Terminal size={24} style={{ color: 'var(--accent-cyan)' }} />,
                title: 'Interactive Terminal',
                desc: 'Secure sandboxed terminal with real-time execution, pip package installation, and interactive shell streaming.',
              },
              {
                icon: <GitBranch size={24} style={{ color: 'var(--accent-orange)' }} />,
                title: 'Version History',
                desc: 'Snapshot-based version control with diff tracking, audit trails, and instant rollback capabilities.',
              },
              {
                icon: <Zap size={24} style={{ color: 'var(--accent-yellow)' }} />,
                title: 'Live Web Previews',
                desc: 'Run Flask, FastAPI, and Express servers and preview interactive web apps instantly through cloud reverse proxy.',
              },
            ].map(f => (
              <div key={f.title} className="card" style={{ padding: 'var(--sp-7)' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-root)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', marginBottom: 'var(--sp-5)',
                }}>
                  {f.icon}
                </div>
                <h3 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--sp-2)' }}>{f.title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', lineHeight: 1.6, margin: 0 }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
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
