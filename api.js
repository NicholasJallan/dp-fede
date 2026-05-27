// DP Assistant — API fetch wrapper
// Reads CSRF token from cookie and attaches as header on state-changing requests

const API_BASE = '/api';

function getCsrfToken() {
  const m = document.cookie.match(/(?:^|; )dp_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

async function apiFetch(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers['X-CSRF-Token'] = getCsrfToken();
  }

  const res = await fetch(API_BASE + path, {
    ...options,
    method,
    headers,
    credentials: 'include',
    body: options.body != null ? JSON.stringify(options.body) : undefined,
  });

  const json = await res.json().catch(() => ({ ok: false, error: 'Réponse invalide' }));

  if (!json.ok) {
    const err = new Error(json.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }

  return json.data;
}

const api = {
  auth: {
    google: (credential) => apiFetch('/auth/google', { method: 'POST', body: { credential } }),
    me:     ()           => apiFetch('/auth/me'),
    logout: ()           => apiFetch('/auth/logout', { method: 'POST', body: {} }),
    update: (data)       => apiFetch('/auth/account', { method: 'PATCH', body: data }),
  },
  divers: {
    list:   ()           => apiFetch('/divers'),
    create: (d)          => apiFetch('/divers', { method: 'POST', body: d }),
    update: (id, d)      => apiFetch(`/divers/${id}`, { method: 'PUT', body: d }),
    delete: (id)         => apiFetch(`/divers/${id}`, { method: 'DELETE', body: {} }),
  },
  sites: {
    list:   ()           => apiFetch('/sites'),
    create: (s)          => apiFetch('/sites', { method: 'POST', body: s }),
    update: (id, s)      => apiFetch(`/sites/${id}`, { method: 'PUT', body: s }),
    delete: (id)         => apiFetch(`/sites/${id}`, { method: 'DELETE', body: {} }),
  },
  users: {
    list:       ()           => apiFetch('/users'),
    setRole:    (id, role)   => apiFetch(`/users/${id}/role`, { method: 'PATCH', body: { role } }),
    delete:     (id)         => apiFetch(`/users/${id}`, { method: 'DELETE', body: {} }),
  },
  archives: {
    list:   ()       => apiFetch('/archives'),
    get:    (id)     => apiFetch(`/archives/${id}`),
    create: (data)   => apiFetch('/archives', { method: 'POST', body: data }),
  },
};

Object.assign(window, { api });
