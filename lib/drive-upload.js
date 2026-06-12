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

(function (root) {
  const DRIVE_API   = 'https://www.googleapis.com/drive/v3/files';
  const UPLOAD_API  = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink';
  const FOLDER_MIME = 'application/vnd.google-apps.folder';

  // Récupère l'ID du dossier `name` (créé par cette app, scope drive.file)
  // ou le crée. Retourne l'ID Drive.
  async function driveGetOrCreateFolder(token, name) {
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

  // Upload un blob dans le dossier `folderId` avec le nom `filename`.
  // Retourne { id, webViewLink } pour pouvoir afficher un lien clickable.
  async function driveUploadFile(token, blob, filename, folderId) {
    const form = new FormData();
    form.append('metadata',
      new Blob([JSON.stringify({ name: filename, parents: [folderId] })], { type: 'application/json' }));
    form.append('file', blob, filename);
    const res = await fetch(UPLOAD_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await res.json();
    if (!res.ok || !data.id) {
      throw new Error('Upload Drive échoué : ' + JSON.stringify(data).slice(0, 200));
    }
    return data;
  }

  const api = { driveGetOrCreateFolder, driveUploadFile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
