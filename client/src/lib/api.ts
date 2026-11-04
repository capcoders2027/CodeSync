const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function api<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: T; message?: string }> {
  const url = `${API_BASE}${endpoint}`;

  const headers: Record<string, string> = {
    ...getAuthHeaders(),
    ...(options.headers as Record<string, string> || {}),
  };

  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, { ...options, headers });
  const json = await res.json().catch(() => ({}));

  return {
    ok: res.ok,
    status: res.status,
    data: json.data,
    message: json.message,
  };
}

export const apiGet = <T = any>(endpoint: string) => api<T>(endpoint);

export const apiPost = <T = any>(endpoint: string, body?: any) =>
  api<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });

export const apiPut = <T = any>(endpoint: string, body?: any) =>
  api<T>(endpoint, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });

export const apiDelete = <T = any>(endpoint: string) =>
  api<T>(endpoint, { method: 'DELETE' });
