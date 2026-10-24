// DP Assistant — Helpers Google Drive REST.
//
// Avant : driveGetOrCreateFolder + driveUploadFile étaient dupliqués dans
// screen-archive.jsx (proceedWithToken ET finalizePendingDrive). Toute
// modification (timeout, headers, gestion erreur) devait être propagée à
// la main.
//
// Maintenant : un seul module. Utilisé par :
//   - ScreenArchive.proceedWithToken (premier archivage)
//   - finalizePendingDrive (reprise après reconnexion)

import { timeoutSignal } from './fetch-timeout.js';

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const UPLOAD_TIMEOUT_MS = 60_000;

// Récupère l'ID du dossier `name` (créé par cette app, scope drive.file)
// ou le crée. Retourne l'ID Drive.
export async function driveGetOrCreateFolder(token, name) {
  const q = encodeURIComponent(`name='${name}' and mimeType='${FOLDER_MIME}' and trashed=false`);
  const list = await fetch(`${DRIVE_API}?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (list.ok) {
    const data = await list.json();
    if (data.files && data.files.length > 0) return data.files[0].id;
  }
  const create = await fetch(DRIVE_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
  });
  const folder = await create.json();
  if (!create.ok || !folder.id) {
    const msg = folder?.error?.message || folder?.error?.status || JSON.stringify(folder).slice(0, 200);
    throw new Error(`Drive — impossible de créer le dossier ${name} : ${msg}`);
  }
  return folder.id;
}

// Drive : apostrophe et antislash d'une valeur de requête `q` échappés.
const driveQueryValue = (s) => String(s).replace(/[\\']/g, (c) => `\\${c}`);

// Upload idempotent : un nouvel essai (fiche envoyée, check-list en échec)
// ne recrée pas de doublon. Recherche en échec → upload quand même : mieux
// un doublon qu'une fiche absente.
export async function driveUploadFileOnce(token, blob, filename, folderId) {
  const q = `name='${driveQueryValue(filename)}' and '${driveQueryValue(folderId)}' in parents and trashed=false`;
  const res = await fetch(
    `${DRIVE_API}?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('files(id,webViewLink)')}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (res.ok) {
    const data = await res.json();
    const found = data?.files?.[0];
    if (found?.id) return { id: found.id, webViewLink: found.webViewLink };
  }
  return driveUploadFile(token, blob, filename, folderId);
}

// Upload un blob dans le dossier `folderId` avec le nom `filename`.
// Retourne { id, webViewLink } pour pouvoir afficher un lien clickable.
export async function driveUploadFile(token, blob, filename, folderId) {
  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify({ name: filename, parents: [folderId] })], { type: 'application/json' }),
  );
  form.append('file', blob, filename);
  const res = await fetch(UPLOAD_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: timeoutSignal(UPLOAD_TIMEOUT_MS),
  });
  const data = await res.json();
  if (!res.ok || !data.id) {
    throw new Error('Upload Drive échoué : ' + JSON.stringify(data).slice(0, 200));
  }
  return data;
}
