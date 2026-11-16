/**
 * Returns the active API base URL.
 * Automatically points to the production Render backend when accessed from Vercel / non-localhost domains,
 * and defaults to localhost:3001 in local development.
 */
export function getApiBase(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl;
  }
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return 'https://codesync-server-ealz.onrender.com/api';
  }
  return envUrl || 'http://localhost:3001/api';
}

export function getWsBase(): string {
  const apiBase = getApiBase();
  return apiBase.replace(/^http/, 'ws').replace(/\/api$/, '');
}
