'use client';

import React from 'react';
import {
  X, Play, Square, Loader, CheckCircle, XCircle, Clock,
  AlertTriangle, Settings, ChevronDown
} from 'lucide-react';

export type RunState = 'idle' | 'preparing' | 'building' | 'running' | 'completed' | 'failed' | 'stopped';

interface RunConfig {
  projectType: string;
  entryCommand: string;
  buildCommand?: string | null;
}

interface RunOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  command: string;
  projectType: string;
  triggeredBy?: string;
}

interface RunOutputPanelProps {
  runState: RunState;
  runOutput: RunOutput | null;
  runConfig: RunConfig | null;
  projectName: string;
  onClose: () => void;
  onStop: () => void;
  onConfigOpen: () => void;
}

const STATE_CONFIG: Record<RunState, { icon: React.ReactNode; label: string; color: string }> = {
  idle: { icon: <Play size={12} />, label: 'Ready', color: 'var(--text-muted)' },
  preparing: { icon: <Loader size={12} className="animate-spin" />, label: 'Preparing', color: 'var(--accent-yellow)' },
  building: { icon: <Loader size={12} className="animate-spin" />, label: 'Building', color: 'var(--accent-blue)' },
  running: { icon: <Loader size={12} className="animate-spin" />, label: 'Running', color: 'var(--accent-green)' },
  completed: { icon: <CheckCircle size={12} />, label: 'Completed', color: 'var(--accent-green)' },
  failed: { icon: <XCircle size={12} />, label: 'Failed', color: 'var(--accent-red)' },
  stopped: { icon: <Square size={12} />, label: 'Stopped', color: 'var(--accent-yellow)' },
};

export function RunOutputPanel({
  runState, runOutput, runConfig, projectName, onClose, onStop, onConfigOpen,
}: RunOutputPanelProps) {
  const stateInfo = STATE_CONFIG[runState];

  return (
    <div style={{
      borderTop: '1px solid var(--border-default)',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      backgroundColor: 'var(--bg-root)',
      maxHeight: '40vh',
    }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{
        padding: '0 var(--sp-5)',
        height: 32,
        minHeight: 32,
        borderBottom: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--bg-secondary)',
        flexShrink: 0,
      }}>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 text-sm font-medium" style={{ color: stateInfo.color }}>
            {stateInfo.icon}
            {stateInfo.label}
          </span>
          <div className="separator-vertical" />
          <span className="text-xs text-secondary">{projectName}</span>
          {runConfig && (
            <>
              <span className="text-xs text-muted">·</span>
              <span className="text-xs text-muted" style={{ fontFamily: 'var(--font-mono)' }}>
                {runConfig.entryCommand}
              </span>
            </>
          )}
          {runOutput?.duration ? (
            <>
              <span className="text-xs text-muted">·</span>
              <span className="flex items-center gap-1 text-xs text-muted">
                <Clock size={10} /> {runOutput.duration}ms
              </span>
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          {(runState === 'running' || runState === 'preparing' || runState === 'building') && (
            <button className="btn-icon" onClick={onStop} style={{ padding: '3px' }} data-tooltip="Stop">
              <Square size={13} style={{ color: 'var(--accent-red)' }} />
            </button>
          )}
          <button className="btn-icon" onClick={onConfigOpen} style={{ padding: '3px' }} data-tooltip="Run Config">
            <Settings size={13} />
          </button>
          <button className="btn-icon" onClick={onClose} style={{ padding: '3px' }}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Output */}
      <div style={{
        flex: 1,
        padding: 'var(--sp-5)',
        overflowY: 'auto',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-sm)',
        lineHeight: 1.7,
        minHeight: 80,
      }}>
        {/* Running indicator */}
        {(runState === 'preparing' || runState === 'building' || runState === 'running') && !runOutput && (
          <div className="flex items-center gap-3" style={{ color: stateInfo.color }}>
            <Loader size={14} className="animate-spin" />
            <span>
              {runState === 'preparing' && 'Setting up execution sandbox...'}
              {runState === 'building' && 'Building project...'}
              {runState === 'running' && 'Running project...'}
            </span>
          </div>
        )}

        {/* Output content */}
        {runOutput && (
          <>
            {/* Command line */}
            <div style={{ color: 'var(--text-muted)', marginBottom: 'var(--sp-4)' }}>
              $ {runOutput.command}
            </div>

            {runOutput.stdout && (
              <pre style={{
                margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                color: 'var(--text-primary)',
              }}>
                {runOutput.stdout}
              </pre>
            )}

            {runOutput.stderr && (
              <pre style={{
                margin: runOutput.stdout ? 'var(--sp-4) 0 0' : 0,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                color: 'var(--accent-red)',
              }}>
                {runOutput.stderr}
              </pre>
            )}

            {/* Exit status */}
            <div style={{
              marginTop: 'var(--sp-5)',
              paddingTop: 'var(--sp-4)',
              borderTop: '1px solid var(--border-subtle)',
              color: runOutput.exitCode === 0 ? 'var(--accent-green)' : 'var(--accent-red)',
              display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
            }}>
              {runOutput.exitCode === 0
                ? <><CheckCircle size={13} /> Process exited successfully</>
                : <><XCircle size={13} /> Process exited with code {runOutput.exitCode}</>
              }
              <span className="text-muted" style={{ marginLeft: 'var(--sp-3)' }}>
                ({runOutput.duration}ms)
              </span>
            </div>
          </>
        )}

        {/* Idle */}
        {runState === 'idle' && !runOutput && (
          <div className="text-muted" style={{ fontFamily: 'var(--font-sans)' }}>
            Click <strong>▶ Run Project</strong> to execute.
          </div>
        )}
      </div>
    </div>
  );
}
