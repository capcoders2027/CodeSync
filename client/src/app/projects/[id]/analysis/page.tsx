'use client';

import { useState, useEffect, use } from 'react';
import { useToast } from '../../../../contexts/ToastContext';
import Link from 'next/link';
import {
  ArrowLeft, ShieldCheck, AlertTriangle, Bug, Brain, TrendingUp,
  ChevronDown, ChevronRight, Activity, Copy, Code2, BarChart3,
  Loader, Filter, FileCode, AlertCircle, Clock, User, CheckCircle
} from 'lucide-react';

interface AnalysisEntry {
  id: string;
  status: string;
  createdAt: string;
  version: { versionNumber: number; name: string };
  triggeredBy: { displayName: string };
  metrics: {
    complexity: number | null;
    cognitiveComplexity: number | null;
    coverage: number | null;
    ncloc: number | null;
    duplicatedLinesDensity: number | null;
  } | null;
  _count: { smells: number };
}

interface Smell {
  id: string;
  ruleKey: string;
  severity: string;
  message: string;
  line: number | null;
  component: string | null;
}

interface Prediction {
  riskScore: number;
  riskLevel: string;
  classifierUsed: string;
  disclaimer: string;
  featureContributions?: Record<string, number>;
}

export default function AnalysisDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const [history, setHistory] = useState<AnalysisEntry[]>([]);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState<string | null>(null);
  const [smells, setSmells] = useState<Smell[]>([]);
  const [loading, setLoading] = useState(true);
  const [predicting, setPredicting] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'smells' | 'history'>('overview');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  const getHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';
    return { Authorization: `Bearer ${token}` };
  };

  useEffect(() => { fetchData(); }, [id]);

  const fetchData = async () => {
    try {
      const headers = getHeaders();
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const [analysisRes, predictRes] = await Promise.all([
        fetch(`${apiBase}/projects/${id}/analyze`, { headers }),
        fetch(`${apiBase}/projects/${id}/predict`, { headers }),
      ]);

      if (analysisRes.ok) {
        const data = await analysisRes.json();
        setHistory(data.data.history);
        if (data.data.history.length > 0) loadSmells(data.data.history[0].id);
      }
      if (predictRes.ok) {
        const data = await predictRes.json();
        if (data.data.prediction) setPrediction(data.data.prediction);
      }
    } catch (e) {
      console.error('Failed to load analysis', e);
    } finally {
      setLoading(false);
    }
  };

  const loadSmells = async (analysisId: string) => {
    setSelectedAnalysis(analysisId);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${apiBase}/projects/${id}/analyze/${analysisId}/smells`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSmells(data.data.smells);
      }
    } catch {}
  };

  const handlePredict = async () => {
    setPredicting(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${apiBase}/projects/${id}/predict`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok) {
        setPrediction(data.data.prediction);
        toast.success('Prediction complete', `Risk level: ${data.data.prediction.riskLevel}`);
      } else {
        toast.error('Prediction failed', data.message || 'Unknown error');
      }
    } catch {
      toast.error('Connection error', 'Unable to reach ML service');
    } finally {
      setPredicting(false);
    }
  };

  const latestAnalysis = history[0] || null;
  const metrics = latestAnalysis?.metrics;

  const severityConfig: Record<string, { color: string; bg: string; label: string }> = {
    BLOCKER:  { color: 'var(--accent-red)', bg: 'var(--accent-red-bg)', label: 'Blocker' },
    CRITICAL: { color: 'var(--accent-orange)', bg: 'var(--accent-orange-bg)', label: 'Critical' },
    MAJOR:    { color: 'var(--accent-yellow)', bg: 'var(--accent-yellow-bg)', label: 'Major' },
    MINOR:    { color: 'var(--accent-blue)', bg: 'var(--accent-blue-bg)', label: 'Minor' },
    INFO:     { color: 'var(--text-secondary)', bg: 'var(--bg-quaternary)', label: 'Info' },
  };

  const riskConfig: Record<string, { color: string; bg: string }> = {
    high:   { color: 'var(--accent-red)', bg: 'var(--accent-red-bg)' },
    medium: { color: 'var(--accent-yellow)', bg: 'var(--accent-yellow-bg)' },
    low:    { color: 'var(--accent-green)', bg: 'var(--accent-green-bg)' },
  };

  const filteredSmells = severityFilter === 'all' ? smells : smells.filter(s => s.severity === severityFilter);

  const severityCounts = smells.reduce<Record<string, number>>((acc, s) => {
    acc[s.severity] = (acc[s.severity] || 0) + 1;
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: '100vh', background: 'var(--bg-root)' }}>
        <div className="flex flex-col items-center gap-4">
          <span className="spinner" style={{ width: 24, height: 24 }} />
          <span className="text-secondary">Loading analysis data...</span>
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
            <BarChart3 size={18} style={{ color: 'var(--accent-purple)' }} />
            <h1 style={{ fontSize: 'var(--text-xl)', margin: 0 }}>Analysis</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/projects/${id}`} className="btn btn-sm btn-secondary">
            <Code2 size={14} /> Open IDE
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--sp-8)' }}>
        {/* ML Prediction Card */}
        {prediction && (
          <div className="card animate-slide" style={{ marginBottom: 'var(--sp-8)', overflow: 'hidden' }}>
            <div style={{
              height: 3,
              background: `linear-gradient(90deg, ${riskConfig[prediction.riskLevel]?.color || 'var(--text-muted)'}, transparent)`,
            }} />
            <div className="card-body" style={{ padding: 'var(--sp-8)' }}>
              <div className="flex items-center gap-3" style={{ marginBottom: 'var(--sp-7)' }}>
                <Brain size={20} style={{ color: 'var(--accent-purple)' }} />
                <span className="text-lg font-semibold">Defect-Risk Prediction</span>
                <span className="badge" style={{
                  background: riskConfig[prediction.riskLevel]?.bg,
                  color: riskConfig[prediction.riskLevel]?.color,
                  fontSize: 'var(--text-sm)', padding: '4px 12px', marginLeft: 'auto',
                }}>
                  {prediction.riskLevel.toUpperCase()} RISK
                </span>
              </div>

              <div className="flex items-center gap-9" style={{ flexWrap: 'wrap' }}>
                {/* Risk Score Visual */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    width: 120, height: 120, borderRadius: '50%',
                    background: `conic-gradient(${riskConfig[prediction.riskLevel]?.color} ${prediction.riskScore * 360}deg, var(--bg-quaternary) 0deg)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    position: 'relative',
                  }}>
                    <div style={{
                      width: 96, height: 96, borderRadius: '50%',
                      background: 'var(--bg-secondary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexDirection: 'column',
                    }}>
                      <span style={{
                        fontSize: 'var(--text-3xl)', fontWeight: 800, lineHeight: 1,
                        color: riskConfig[prediction.riskLevel]?.color,
                      }}>
                        {(prediction.riskScore * 100).toFixed(0)}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>/ 100</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 'var(--sp-3)' }}>Risk Score</div>
                </div>

                {/* Details */}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ marginBottom: 'var(--sp-5)' }}>
                    <div className="progress-bar" style={{ height: 8, marginBottom: 'var(--sp-3)' }}>
                      <div className="progress-fill" style={{
                        width: `${Math.min(prediction.riskScore * 100, 100)}%`,
                        background: `linear-gradient(90deg, var(--accent-green), ${riskConfig[prediction.riskLevel]?.color})`,
                      }} />
                    </div>
                    <div className="flex justify-between text-xs text-muted">
                      <span>Low Risk</span>
                      <span>High Risk</span>
                    </div>
                  </div>

                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    <div style={{ marginBottom: 'var(--sp-2)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Classifier:</span>{' '}
                      <span className="font-medium">{prediction.classifierUsed}</span>
                    </div>
                    <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
                      {prediction.disclaimer.substring(0, 180)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Run Prediction CTA */}
        {latestAnalysis && !prediction && (
          <div className="card animate-slide" style={{ marginBottom: 'var(--sp-8)' }}>
            <div className="card-body flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div style={{
                  width: 44, height: 44, borderRadius: 'var(--radius-md)',
                  background: 'var(--accent-purple-bg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Brain size={22} style={{ color: 'var(--accent-purple)' }} />
                </div>
                <div>
                  <div className="font-semibold">ML Prediction Available</div>
                  <div className="text-sm text-secondary">Run the ML model to predict defect risk from your latest analysis.</div>
                </div>
              </div>
              <button className="btn btn-purple" onClick={handlePredict} disabled={predicting}>
                {predicting ? <><Loader size={14} className="animate-spin" /> Predicting...</> : <><Brain size={14} /> Run Prediction</>}
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="tabs" style={{ marginBottom: 'var(--sp-7)' }}>
          <button className={`tab ${activeTab === 'overview' ? 'tab-active' : ''}`} onClick={() => setActiveTab('overview')}>
            <BarChart3 size={14} /> Metrics
          </button>
          <button className={`tab ${activeTab === 'smells' ? 'tab-active' : ''}`} onClick={() => setActiveTab('smells')}>
            <AlertTriangle size={14} /> Code Smells
            {smells.length > 0 && <span className="tab-count">{smells.length}</span>}
          </button>
          <button className={`tab ${activeTab === 'history' ? 'tab-active' : ''}`} onClick={() => setActiveTab('history')}>
            <Clock size={14} /> History
            <span className="tab-count">{history.length}</span>
          </button>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <>
            {metrics ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 'var(--sp-8)' }}>
                {/* Metrics Grid */}
                <div className="grid stagger" style={{
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: 'var(--sp-5)',
                  alignContent: 'start',
                }}>
                  {[
                    { label: 'Code Smells', value: latestAnalysis?._count.smells || 0, icon: <AlertTriangle size={16} />, color: 'var(--accent-yellow)' },
                    { label: 'Complexity', value: metrics.complexity?.toFixed(0) || '—', icon: <Activity size={16} />, color: 'var(--accent-purple)' },
                    { label: 'Cognitive Complexity', value: metrics.cognitiveComplexity?.toFixed(0) || '—', icon: <Brain size={16} />, color: 'var(--accent-orange)' },
                    { label: 'Lines of Code', value: metrics.ncloc ? metrics.ncloc.toLocaleString() : '—', icon: <FileCode size={16} />, color: 'var(--accent-blue)' },
                    { label: 'Coverage', value: metrics.coverage ? `${metrics.coverage.toFixed(1)}%` : '—', icon: <ShieldCheck size={16} />, color: 'var(--accent-green)' },
                    { label: 'Duplication', value: metrics.duplicatedLinesDensity ? `${metrics.duplicatedLinesDensity.toFixed(1)}%` : '—', icon: <Copy size={16} />, color: 'var(--accent-red)' },
                  ].map((m, i) => (
                    <div key={i} className="metric-card animate-slide">
                      <div className="metric-label" style={{ color: m.color }}>
                        {m.icon} {m.label}
                      </div>
                      <div className="metric-value">{m.value}</div>
                    </div>
                  ))}
                </div>

                {/* Severity Donut */}
                {smells.length > 0 && (
                  <div className="card animate-slide" style={{ padding: 'var(--sp-7)' }}>
                    <div className="text-sm font-semibold" style={{ marginBottom: 'var(--sp-6)', color: 'var(--text-secondary)' }}>
                      Severity Breakdown
                    </div>
                    <div className="flex items-center gap-7">
                      {/* Donut */}
                      <div className="severity-donut">
                        <svg viewBox="0 0 36 36">
                          {(() => {
                            const total = smells.length;
                            const severities = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];
                            const colors = ['#f85149', '#f0883e', '#d29922', '#58a6ff', '#6e7681'];
                            let offset = 0;
                            return severities.map((sev, i) => {
                              const count = severityCounts[sev] || 0;
                              const pct = total > 0 ? (count / total) * 100 : 0;
                              const dashArray = `${pct} ${100 - pct}`;
                              const el = pct > 0 ? (
                                <circle
                                  key={sev}
                                  cx="18" cy="18" r="15.915"
                                  fill="transparent"
                                  stroke={colors[i]}
                                  strokeWidth="3"
                                  strokeDasharray={dashArray}
                                  strokeDashoffset={-offset}
                                  strokeLinecap="round"
                                />
                              ) : null;
                              offset += pct;
                              return el;
                            });
                          })()}
                        </svg>
                        <div className="severity-donut-center">
                          <div className="severity-donut-count">{smells.length}</div>
                          <div className="severity-donut-label">Total</div>
                        </div>
                      </div>

                      {/* Legend */}
                      <div className="severity-legend">
                        {[
                          { key: 'BLOCKER', color: '#f85149', label: 'Blocker' },
                          { key: 'CRITICAL', color: '#f0883e', label: 'Critical' },
                          { key: 'MAJOR', color: '#d29922', label: 'Major' },
                          { key: 'MINOR', color: '#58a6ff', label: 'Minor' },
                          { key: 'INFO', color: '#6e7681', label: 'Info' },
                        ].filter(s => (severityCounts[s.key] || 0) > 0).map(s => (
                          <div key={s.key} className="severity-legend-item">
                            <div className="severity-legend-dot" style={{ background: s.color }} />
                            <span style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
                            <span className="severity-legend-count">{severityCounts[s.key] || 0}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="card">
                <div className="empty-state">
                  <div className="empty-state-icon"><BarChart3 size={28} /></div>
                  <h3>No analysis data</h3>
                  <p>Run your first analysis from the IDE to see code quality metrics here.</p>
                  <Link href={`/projects/${id}`} className="btn btn-primary">
                    <Code2 size={14} /> Open IDE
                  </Link>
                </div>
              </div>
            )}
          </>
        )}

        {/* Smells Tab */}
        {activeTab === 'smells' && (
          <>
            {smells.length > 0 ? (
              <>
                {/* Severity filter */}
                <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 'var(--sp-6)' }}>
                  <button className={`btn btn-sm ${severityFilter === 'all' ? 'btn-blue' : 'btn-ghost'}`} onClick={() => setSeverityFilter('all')}>
                    All ({smells.length})
                  </button>
                  {Object.entries(severityCounts).sort(([a], [b]) => {
                    const order = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];
                    return order.indexOf(a) - order.indexOf(b);
                  }).map(([severity, count]) => {
                    const cfg = severityConfig[severity] || severityConfig.INFO;
                    return (
                      <button
                        key={severity}
                        className={`btn btn-sm ${severityFilter === severity ? 'btn-blue' : 'btn-ghost'}`}
                        onClick={() => setSeverityFilter(severity)}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color }} /> {cfg.label} ({count})
                      </button>
                    );
                  })}
                </div>

                {/* Smells list */}
                <div className="flex flex-col gap-2">
                  {filteredSmells.slice(0, 50).map(smell => {
                    const cfg = severityConfig[smell.severity] || severityConfig.INFO;
                    return (
                      <div key={smell.id} className="card" style={{
                        padding: 'var(--sp-5) var(--sp-6)',
                        display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-5)',
                      }}>
                        <span className="badge" style={{
                          background: cfg.bg, color: cfg.color,
                          flexShrink: 0, marginTop: 2,
                        }}>
                          {cfg.label}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="text-md" style={{ lineHeight: 1.5, marginBottom: 'var(--sp-2)' }}>{smell.message}</div>
                          <div className="text-xs text-muted" style={{ fontFamily: 'var(--font-mono)' }}>
                            {smell.component || 'Unknown'}{smell.line ? `:${smell.line}` : ''} — {smell.ruleKey}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {filteredSmells.length > 50 && (
                    <div className="text-center text-sm text-secondary" style={{ padding: 'var(--sp-6)' }}>
                      + {filteredSmells.length - 50} more not shown
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="card">
                <div className="empty-state">
                  <div className="empty-state-icon"><CheckCircle size={28} /></div>
                  <h3>No code smells</h3>
                  <p>Your code is looking clean! Run an analysis to check for issues.</p>
                </div>
              </div>
            )}
          </>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <>
            {history.length === 0 ? (
              <div className="card">
                <div className="empty-state">
                  <div className="empty-state-icon"><Clock size={28} /></div>
                  <h3>No analyses yet</h3>
                  <p>Click "Analyze" in the IDE to run your first analysis.</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {history.map(entry => (
                  <div
                    key={entry.id}
                    onClick={() => { loadSmells(entry.id); setActiveTab('smells'); }}
                    className="card card-interactive"
                    style={{
                      padding: 'var(--sp-5) var(--sp-6)',
                      borderLeft: selectedAnalysis === entry.id ? '3px solid var(--accent-blue)' : '3px solid transparent',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="font-medium text-md">{entry.version.name}</span>
                        <span className={`badge ${entry.status === 'completed' ? 'badge-green' : 'badge-red'}`}>
                          {entry.status === 'completed' ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
                          {entry.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-5 text-sm text-secondary">
                        <span className="flex items-center gap-2"><AlertTriangle size={12} /> {entry._count.smells} smells</span>
                        <span className="flex items-center gap-2"><User size={12} /> {entry.triggeredBy.displayName}</span>
                        <span className="flex items-center gap-2"><Clock size={12} /> {new Date(entry.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
