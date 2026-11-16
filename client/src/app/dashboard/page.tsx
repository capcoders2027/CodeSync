'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/');
  }, [router]);

  return (
    <div className="flex items-center justify-center" style={{ height: '100vh', background: 'var(--bg-root)' }}>
      <div className="flex flex-col items-center gap-4">
        <span className="spinner" style={{ width: 28, height: 28 }} />
        <span style={{ color: 'var(--text-secondary)' }}>Loading Dashboard...</span>
      </div>
    </div>
  );
}
