'use client';

import React, { useRef, useEffect } from 'react';
import { useTabs, EditorTab } from '../contexts/TabsContext';
import { X, FileCode } from 'lucide-react';

const FILE_COLORS: Record<string, string> = {
  '.py': '#3572A5', '.js': '#f1e05a', '.ts': '#3178c6', '.tsx': '#3178c6',
  '.jsx': '#f1e05a', '.json': '#6e7681', '.md': '#58a6ff', '.html': '#e34c26',
  '.css': '#563d7c', '.java': '#b07219',
};

function getFileColor(name: string) {
  const ext = name.slice(name.lastIndexOf('.'));
  return FILE_COLORS[ext] || 'var(--text-tertiary)';
}

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useTabs();
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);

  // Scroll active tab into view
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [activeTabId]);

  if (tabs.length === 0) return null;

  const handleClose = (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    closeTab(fileId);
  };

  const handleMiddleClick = (e: React.MouseEvent, fileId: string) => {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(fileId);
    }
  };

  return (
    <div
      ref={scrollRef}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        height: 35,
        minHeight: 35,
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-subtle)',
        overflowX: 'auto',
        overflowY: 'hidden',
        flexShrink: 0,
      }}
      className="tab-bar-scroll"
    >
      {tabs.map((tab) => {
        const isActive = tab.fileId === activeTabId;

        return (
          <div
            key={tab.fileId}
            ref={isActive ? activeTabRef : null}
            onClick={() => setActiveTab(tab.fileId)}
            onMouseDown={(e) => handleMiddleClick(e, tab.fileId)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-3)',
              padding: '0 var(--sp-4)',
              paddingRight: 'var(--sp-2)',
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              borderRight: '1px solid var(--border-subtle)',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              backgroundColor: isActive ? 'var(--bg-primary)' : 'transparent',
              borderBottom: isActive ? '2px solid var(--accent-blue)' : '2px solid transparent',
              transition: 'background var(--transition-fast), color var(--transition-fast)',
              minWidth: 'fit-content',
              position: 'relative',
            }}
            onMouseEnter={e => {
              if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
            }}
            onMouseLeave={e => {
              if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            {/* File icon */}
            <FileCode size={13} style={{ color: getFileColor(tab.fileName), flexShrink: 0 }} />

            {/* Dirty indicator + filename */}
            <span style={{ fontFamily: 'var(--font-mono)', letterSpacing: '-0.01em' }}>
              {tab.isDirty && (
                <span style={{
                  display: 'inline-block',
                  width: 6, height: 6,
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent-orange)',
                  marginRight: 4,
                  verticalAlign: 'middle',
                }} />
              )}
              {tab.fileName}
            </span>

            {/* Close button */}
            <button
              onClick={(e) => handleClose(e, tab.fileId)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 18,
                height: 18,
                border: 'none',
                background: 'transparent',
                color: 'var(--text-muted)',
                borderRadius: 'var(--radius-xs)',
                cursor: 'pointer',
                flexShrink: 0,
                padding: 0,
                transition: 'all var(--transition-fast)',
                marginLeft: 'var(--sp-1)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = 'var(--bg-quaternary)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
              aria-label={`Close ${tab.fileName}`}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
