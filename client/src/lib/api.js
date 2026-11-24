export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor', 0);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error?.message ?? `Error ${res.status}`, res.status);
  return data;
}

const enc = encodeURIComponent;

export const api = {
  config: () => request('/api/config'),
  login: (password) => request('/api/auth/login', { method: 'POST', body: { password } }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  createLink: (payload) => request('/api/links', { method: 'POST', body: payload }),
  listLinks: ({ q = '', page = 1, pageSize = 10 } = {}) =>
    request(`/api/links?q=${enc(q)}&page=${page}&pageSize=${pageSize}`),
  updateLink: (code, patch) => request(`/api/links/${enc(code)}`, { method: 'PATCH', body: patch }),
  deleteLink: (code) => request(`/api/links/${enc(code)}`, { method: 'DELETE' }),
  linkStats: (code, range) => request(`/api/links/${enc(code)}/stats?range=${range}&tz=${enc(timeZone)}`),
  overview: (range) => request(`/api/overview?range=${range}&tz=${enc(timeZone)}`),
  qrUrl: (code) => `/api/links/${enc(code)}/qr`,
};
