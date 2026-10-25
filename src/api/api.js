// DP Assistant — API fetch wrapper
// Reads CSRF token via getCsrfToken (./google-drive.js) and attaches
// it as a header on state-changing requests.
//
// Club : chaque requête métier porte `X-DP-Club: <club courant>` (comme
// l'outbox) — la réponse concerne le club affiché, jamais un autre choisi
// côté serveur entre-temps. Exceptions : /auth/* (session et découverte du
// club courant). 403 CLUB_NOT_MEMBER → événement dp:clubNotMember : l'app
// resynchronise son club courant (src/club/club-context.jsx).
//
// `api` est un singleton partagé : src/offline/offline-api.js le décore en
// place au démarrage (src/app/bootstrap.js) avant tout usage.

import { getCsrfToken } from './google-drive.js';
import { notifyIfAuthExpired } from './auth-events.js';
import { filenameFromDisposition } from './download.js';
import { clubHeaders, getCurrentClubId } from './club-header.js';
import { REQUEST_TIMEOUT_MS, timeoutSignal } from './fetch-timeout.js';

// Génération PDF (mPDF sur le Pi) et import CSV : plus longs qu'une requête JSON.
const SLOW_REQUEST_TIMEOUT_MS = 90_000;

const API_BASE = '/api';
const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const enc = encodeURIComponent;

// Routes sans en-tête de club : session et découverte du club courant.
const NO_CLUB_HEADER = /^\/auth\//;

// Erreur HTTP portant le statut et le code stable du serveur (403
// CLUB_NOT_MEMBER, 409 LAST_RESPONSABLE…, cf. docs/api-club.md).
function httpError(message, status, code = null) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

// En-tête du club courant pour `path` (et club ciblé, pour le signalement).
function clubScope(path) {
  const clubId = NO_CLUB_HEADER.test(path) ? null : getCurrentClubId();
  return { clubId, headers: clubHeaders(clubId) };
}

// Échec HTTP : session expirée, club quitté, puis erreur levée.
function failure(res, path, clubId, message, code) {
  notifyIfAuthExpired(res.status, path);
  if (res.status === 403 && code === 'CLUB_NOT_MEMBER') {
    window.dispatchEvent(new CustomEvent('dp:clubNotMember', { detail: { clubId } }));
  }
  return httpError(message, res.status, code);
}

async function errorBody(res) {
  const text = await res.text().catch(() => '');
  try {
    const j = JSON.parse(text);
    if (j?.error) return { message: j.error, code: j.code || null };
  } catch {
    /* corps non JSON */
  }
  return { message: text.trim().slice(0, 300) || `HTTP ${res.status}`, code: null };
}

// options.form (FormData) : envoi multipart, le navigateur pose lui-même
// le Content-Type (frontière) — sert à l'import CSV, octets bruts conservés
// pour la détection d'encodage côté serveur.
async function apiFetch(path, options = {}) {
  const { form, body, headers: extra, ...rest } = options;
  const method = (options.method || 'GET').toUpperCase();
  const scope = clubScope(path);
  const headers = { ...(form ? {} : { 'Content-Type': 'application/json' }), ...scope.headers, ...(extra || {}) };

  if (WRITE_METHODS.includes(method)) {
    headers['X-CSRF-Token'] = getCsrfToken();
  }

  const res = await fetch(API_BASE + path, {
    ...rest,
    method,
    headers,
    credentials: 'include',
    cache: 'no-store',
    signal: timeoutSignal(form ? SLOW_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS, rest.signal),
    body: form || (body != null ? JSON.stringify(body) : undefined),
  });

  const json = await res.json().catch(() => ({ ok: false, error: 'Réponse invalide' }));

  if (!json.ok) {
    throw failure(res, path, scope.clubId, json.error || `HTTP ${res.status}`, json.code || null);
  }

  return json.data;
}

// Fichier binaire (PDF archivé, CSV) : { blob, filename }.
async function apiBlob(path, fallbackName) {
  const scope = clubScope(path);
  const res = await fetch(API_BASE + path, {
    credentials: 'include',
    cache: 'no-store',
    headers: scope.headers,
    signal: timeoutSignal(SLOW_REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const { message, code } = await errorBody(res);
    throw failure(res, path, scope.clubId, message, code);
  }
  return {
    blob: await res.blob(),
    filename: filenameFromDisposition(res.headers.get('Content-Disposition'), fallbackName),
  };
}

function query(params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${enc(k)}=${enc(v)}`)
    .join('&');
  return qs ? `?${qs}` : '';
}

// Import de l'annuaire (docs/import-plongeurs.md) : simulation puis application.
function importDivers(file, { dryRun = true, profile = 'auto' } = {}) {
  const form = new FormData();
  form.append('file', file, file.name || 'plongeurs.csv');
  form.append('profile', profile);
  if (dryRun) form.append('dry_run', '1');
  return apiFetch(`/divers/import${dryRun ? '?dry_run=1' : ''}`, { method: 'POST', form });
}

const CONFIRM_DELETE = { confirm: 'SUPPRIMER' };

// Génère un PDF côté serveur (mPDF) depuis les données de la plongée en base.
// type : 'fiche' | 'checklist'. Retourne un Blob.
async function fetchPdfBlob(diveId, type = 'fiche') {
  const scope = clubScope('/pdf/fiche');
  const res = await fetch(`${API_BASE}/pdf/fiche`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': getCsrfToken(),
      ...scope.headers,
    },
    body: JSON.stringify({ dive_id: diveId, type }),
    signal: timeoutSignal(SLOW_REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const { message, code } = await errorBody(res);
    throw failure(res, '/pdf/fiche', scope.clubId, `PDF ${type} — HTTP ${res.status} : ${message}`, code);
  }
  return await res.blob();
}

export const api = {
  auth: {
    google: (credential) => apiFetch('/auth/google', { method: 'POST', body: { credential } }),
    me: () => apiFetch('/auth/me'),
    logout: () => apiFetch('/auth/logout', { method: 'POST', body: {} }),
    update: (data) => apiFetch('/auth/account', { method: 'PATCH', body: data }),
  },
  divers: {
    list: () => apiFetch('/divers'),
    create: (d) => apiFetch('/divers', { method: 'POST', body: d }),
    update: (id, d) => apiFetch(`/divers/${id}`, { method: 'PUT', body: d }),
    delete: (id) => apiFetch(`/divers/${id}`, { method: 'DELETE', body: {} }),
    // Non décoré par l'offline : l'import exige le réseau (rapport serveur).
    import: importDivers,
  },
  sites: {
    list: () => apiFetch('/sites'),
    create: (s) => apiFetch('/sites', { method: 'POST', body: s }),
    update: (id, s) => apiFetch(`/sites/${id}`, { method: 'PUT', body: s }),
    delete: (id) => apiFetch(`/sites/${id}`, { method: 'DELETE', body: {} }),
  },
  users: {
    list: () => apiFetch('/users'),
    stats: () => apiFetch('/users/stats'),
    setRole: (id, role) => apiFetch(`/users/${id}/role`, { method: 'PATCH', body: { role } }),
    delete: (id) => apiFetch(`/users/${id}`, { method: 'DELETE', body: {} }),
  },
  dives: {
    list: () => apiFetch('/dives'),
    get: (id) => apiFetch(`/dives/${id}`),
    // Charge du jour (Polynésie, art. 5) : plongées du club à cette date, hors plongée courante.
    dayLoad: (date, exclude) =>
      apiFetch(`/dives/day-load?date=${encodeURIComponent(date)}&exclude=${encodeURIComponent(exclude || '')}`),
    create: (data) => apiFetch('/dives', { method: 'POST', body: data }),
    update: (id, patch) => apiFetch(`/dives/${id}`, { method: 'PATCH', body: patch }),
    delete: (id) => apiFetch(`/dives/${id}`, { method: 'DELETE', body: {} }),
    // Envoi réseau immédiat, sans passer par l'outbox (non décoré par
    // src/offline/offline-api.js) : utilisé juste avant une génération PDF serveur.
    pushNow: (id, patch) => apiFetch(`/dives/${id}`, { method: 'PATCH', body: patch }),
    // PDF archivés par le club (A322-72) : id serveur ou client_uuid.
    documents: (id) => apiFetch(`/dives/${enc(id)}/documents`),
    downloadDocument: (id, type) => apiBlob(`/dives/${enc(id)}/documents/${enc(type)}`, `${type}.pdf`),
    regenerateDocuments: (id) => apiFetch(`/dives/${enc(id)}/documents`, { method: 'POST', body: {} }),
  },
  club: {
    get: () => apiFetch('/club'),
    update: (fields) => apiFetch('/club', { method: 'PATCH', body: fields }),
    delete: () => apiFetch('/club', { method: 'DELETE', body: CONFIRM_DELETE }),
    memberships: () => apiFetch('/club/memberships'),
    switch: (clubId) => apiFetch('/club/switch', { method: 'POST', body: { club_id: clubId } }),
    members: () => apiFetch('/club/members'),
    setRole: (userId, role) => apiFetch(`/club/members/${enc(userId)}`, { method: 'PATCH', body: { role } }),
    removeMember: (userId) => apiFetch(`/club/members/${enc(userId)}`, { method: 'DELETE', body: {} }),
    invitations: {
      list: () => apiFetch('/club/invitations'),
      create: ({ email, role }) => apiFetch('/club/invitations', { method: 'POST', body: { email, role } }),
      revoke: (id) => apiFetch(`/club/invitations/${enc(id)}`, { method: 'DELETE', body: {} }),
      preview: (token) => apiFetch('/club/invitations/preview', { method: 'POST', body: { token } }),
      accept: (token) => apiFetch('/club/invitations/accept', { method: 'POST', body: { token } }),
    },
    alerts: (days = 30) => apiFetch(`/club/alerts${query({ days })}`),
    stats: ({ from, to } = {}) => apiFetch(`/club/stats${query({ from, to })}`),
    statsCsv: ({ from, to } = {}) => apiBlob(`/club/stats${query({ from, to, format: 'csv' })}`, 'statistiques.csv'),
  },
  account: {
    export: () => apiFetch('/account/export'),
    delete: () => apiFetch('/account', { method: 'DELETE', body: CONFIRM_DELETE }),
  },
  pdf: {
    blob: fetchPdfBlob,
  },
  proxy: {
    maree: (lat, lng, date) =>
      apiFetch(
        `/proxy/maree?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&date=${encodeURIComponent(date)}`,
      ),
  },
};
