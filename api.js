// DP Assistant — API fetch wrapper
// Reads CSRF token via window.getCsrfToken (lib/google-drive.js) and attaches
// it as a header on state-changing requests.

const API_BASE = '/api';

async function apiFetch(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers['X-CSRF-Token'] = window.getCsrfToken ? window.getCsrfToken() : '';
  }

  const res = await fetch(API_BASE + path, {
    ...options,
    method,
    headers,
    credentials: 'include',
    cache: 'no-store',
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
    stats:      ()           => apiFetch('/users/stats'),
    setRole:    (id, role)   => apiFetch(`/users/${id}/role`, { method: 'PATCH', body: { role } }),
    delete:     (id)         => apiFetch(`/users/${id}`, { method: 'DELETE', body: {} }),
  },
  workspaces: {
    // Structures partagées : le scope actif est porté par la session côté
    // serveur, pas par le client — d'où l'absence d'id dans les autres appels.
    list:     ()      => apiFetch('/workspaces'),
    all:      ()      => apiFetch('/workspaces/all'),
    join:     (code)  => apiFetch('/workspaces/join', { method: 'POST', body: { code } }),
    activate: (id)    => apiFetch('/workspaces/activate', { method: 'POST', body: { workspace_id: id } }),
    create:   (d)     => apiFetch('/workspaces', { method: 'POST', body: d }),
    leave:    (id)    => apiFetch(`/workspaces/${id}/members/me`, { method: 'DELETE', body: {} }),
  },
  dives: {
    list:   ()           => apiFetch('/dives'),
    get:    (id)         => apiFetch(`/dives/${id}`),
    create: (data)       => apiFetch('/dives', { method: 'POST', body: data }),
    update: (id, patch)  => apiFetch(`/dives/${id}`, { method: 'PATCH', body: patch }),
    delete: (id)         => apiFetch(`/dives/${id}`, { method: 'DELETE', body: {} }),
  },
};

Object.assign(window, { api });
