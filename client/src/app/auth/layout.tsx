'use client';

import Link from 'next/link';
import { Code2 } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Left panel — branding */}
      <div className="hide-mobile" style={{
        width: '45%',
        background: 'linear-gradient(145deg, var(--bg-root) 0%, #0f172a 50%, #0c1222 100%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 'var(--sp-11)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Subtle grid pattern */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.03,
          backgroundImage: 'linear-gradient(var(--text-secondary) 1px, transparent 1px), linear-gradient(90deg, var(--text-secondary) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />

        <Link href="/" className="flex items-center gap-3" style={{ textDecoration: 'none', position: 'relative', zIndex: 1 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Code2 size={20} color="#fff" />
          </div>
          <span style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>CodeSync</span>
        </Link>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1 style={{ fontSize: 'var(--text-4xl)', lineHeight: 1.2, marginBottom: 'var(--sp-6)', maxWidth: 420 }}>
            Collaborate on code.<br />
            <span style={{ color: 'var(--accent-blue)' }}>Ship with confidence.</span>
          </h1>
          <p style={{ fontSize: 'var(--text-lg)', color: 'var(--text-secondary)', maxWidth: 400, lineHeight: 1.6 }}>
            Real-time collaborative coding with intelligent defect-risk analysis and static code quality insights.
          </p>

          <div style={{ display: 'flex', gap: 'var(--sp-9)', marginTop: 'var(--sp-10)' }}>
            {[
              { value: 'Real-time', label: 'Collaboration' },
              { value: 'ML-Powered', label: 'Risk Analysis' },
              { value: 'SonarQube', label: 'Code Quality' },
            ].map((stat) => (
              <div key={stat.label}>
                <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>{stat.value}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', position: 'relative', zIndex: 1 }}>
          © {new Date().getFullYear()} CodeSync. Built for developers.
        </div>
      </div>

      {/* Right panel — form */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--sp-9)',
        background: 'var(--bg-primary)',
      }}>
        <div className="animate-in" style={{ width: '100%', maxWidth: 400 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
