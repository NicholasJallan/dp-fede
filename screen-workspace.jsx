// DP Assistant — choix de l'espace de travail (personnel ou structure partagée)
//
// Affiché juste après une connexion Google, et rouvrable depuis la topbar.
// Le scope actif est porté par la session côté serveur : basculer déclenche
// window.switchScope (lib/scope.js), qui purge les caches locaux puis recharge.

import React, { useState, useEffect } from 'react';
import { useAuth } from './auth-context.jsx';

function ScreenWorkspace({ onDone }) {
  const { user, switchScope } = useAuth();
  const [list, setList] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState('');

  useEffect(() => {
    let cancelled = false;
    api.workspaces.list()
      .then(ws => { if (!cancelled) setList(ws || []); })
      .catch(() => { if (!cancelled) setList([]); });
    return () => { cancelled = true; };
  }, []);

  const activeId = (user && user.workspace) ? user.workspace.id : null;

  // Les items d'outbox ne portent pas de scope : ils partiraient dans le
  // mauvais espace. switchScope() applique déjà cette garde, on la répète ici
  // pour le parcours « rejoindre », qui bascule lui aussi.
  async function assertNoPendingWrites() {
    if (!window.scopePendingWrites) return;
    const n = await window.scopePendingWrites();
    if (n > 0) {
      throw new Error(
        n + ' modification(s) pas encore envoyée(s). Reconnectez-vous à Internet avant de changer d\'espace.'
      );
    }
  }

  async function choose(id) {
    setErr(''); setBusy(true);
    try {
      if (id === activeId) { onDone(); return; }
      await switchScope(id); // recharge la page en cas de succès
    } catch (e) {
      setErr(e.message || 'Bascule impossible.');
      setBusy(false);
    }
  }

  async function join(ev) {
    ev.preventDefault();
    setErr(''); setBusy(true);
    try {
      await assertNoPendingWrites();
      await api.workspaces.join(code.trim());
      if (window.purgeLocalScope) await window.purgeLocalScope();
      window.location.reload();
    } catch (e) {
      setErr(e.message || 'Code refusé.');
      setBusy(false);
    }
  }

  function Choice({ id, title, sub, active }) {
    return (
      <button
        className={'btn lg' + (active ? ' primary' : '')}
        style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', marginBottom: 10 }}
        disabled={busy}
        onClick={() => choose(id)}
      >
        <span style={{ display: 'block' }}>
          <b style={{ display: 'block' }}>{title}</b>
          <span style={{ fontSize: 12, opacity: 0.75 }}>{active ? 'Espace actif · ' : ''}{sub}</span>
        </span>
      </button>
    );
  }

  return (
    <div className="login-shell">
      <div className="login-card" style={{ maxWidth: 460 }}>
        <div className="login-logo">
          <span className="dot"></span>
          <span>DP/ASSISTANT</span>
        </div>

        <h1 className="login-title">Espace de travail</h1>
        <p className="login-sub">
          Un espace partagé met en commun l'annuaire des plongeurs, les sites et
          les fiches de sécurité de tous ses membres.
        </p>

        <div style={{ marginTop: 18, textAlign: 'left' }}>
          <Choice
            id={null}
            title="Mon espace personnel"
            sub="Vos plongeurs et vos fiches, visibles de vous seul"
            active={activeId === null}
          />

          {list === null && <p className="muted" style={{ fontSize: 13 }}>Chargement des structures…</p>}

          {(list || []).map(ws => (
            <Choice
              key={ws.id}
              id={ws.id}
              title={ws.name}
              sub={ws.members_count + (ws.members_count > 1 ? ' membres' : ' membre')}
              active={activeId === ws.id}
            />
          ))}
        </div>

        <form onSubmit={join} style={{ marginTop: 18, textAlign: 'left' }}>
          <label className="field-label" htmlFor="ws-code">Rejoindre une structure</label>
          <p className="field-hint" style={{ margin: '2px 0 8px' }}>
            Saisissez le code d'invitation communiqué par l'organisateur.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="ws-code"
              className="input"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="BEPPA-HENDAYE-2026"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck="false"
              style={{ flex: 1 }}
            />
            <button className="btn" type="submit" disabled={busy || code.trim().length < 3}>
              Rejoindre
            </button>
          </div>
        </form>

        {err && (
          <div style={{
            marginTop: 14, padding: '10px 14px',
            background: 'rgba(224,120,86,0.08)',
            border: '1px solid rgba(224,120,86,0.35)',
            borderRadius: 8, fontSize: 13, textAlign: 'left', lineHeight: 1.5,
          }}>
            {err}
          </div>
        )}

        {onDone && (
          <button className="btn ghost" style={{ marginTop: 14 }} disabled={busy} onClick={onDone}>
            Annuler
          </button>
        )}
      </div>
    </div>
  );
}

export { ScreenWorkspace };
