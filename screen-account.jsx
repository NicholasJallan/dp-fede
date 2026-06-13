// DP Assistant — Compte utilisateur

import React, { useState } from 'react';
import { useAuth } from './auth-context.jsx';
import { Alert, Opt } from './components.jsx';

function ScreenAccount() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({
    nom: user?.nom || '',
    prenom: user?.prenom || '',
    club_nom: user?.club_nom || '',
    club_numero: user?.club_numero || '',
    club_siret: user?.club_siret || '',
    structure_type: user?.structure_type || '',
    president_prenom: user?.president_prenom || '',
    president_nom: user?.president_nom || '',
    president_tel: user?.president_tel || '',
    urgence_defaut: user?.urgence_defaut || '18',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const onSave = async () => {
    setSaving(true); setError(''); setSaved(false);
    try {
      const updated = await api.auth.update(form);
      setUser(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const STRUCTURE_TYPES = [
    { value:'club',  label:'Club FFESSM associatif' },
    { value:'sca',   label:'Structure Commerciale Agréée (SCA)' },
    { value:'csa',   label:'Convention de Section d\'Activité (CSA)' },
    { value:'autre', label:'Autre' },
  ];

  const isClub = form.structure_type === 'club';

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Paramètres</div>
        <h1>Mon compte</h1>
        <p>Informations personnelles et structure.</p>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Identité</h2>
          <small className="muted">Connecté via Google · {user?.email}</small>
        </div>
        <div className="card-body" style={{ display:'grid', gap:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="field">
              <label>Prénom</label>
              <input className="input" value={form.prenom} onChange={e => set('prenom', e.target.value)} />
            </div>
            <div className="field">
              <label>Nom</label>
              <input className="input" value={form.nom} onChange={e => set('nom', e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop:16 }}>
        <div className="card-head"><h2>Structure</h2></div>
        <div className="card-body" style={{ display:'grid', gap:12 }}>
          <div className="field">
            <label>Type de structure</label>
            <div className="opt-group col-2" style={{ marginTop:4 }}>
              {STRUCTURE_TYPES.map(t => (
                <Opt key={t.value} label={t.label} checked={form.structure_type === t.value}
                  onClick={() => set('structure_type', t.value)} />
              ))}
            </div>
          </div>
          <div className="field">
            <label>Nom du club ou de la structure</label>
            <input className="input" value={form.club_nom} onChange={e => set('club_nom', e.target.value)}
              placeholder="Club de Plongée XYZ / ACSMJ 29" />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="field">
              <label>Numéro de club FFESSM</label>
              <input className="input" value={form.club_numero} onChange={e => set('club_numero', e.target.value)}
                placeholder="A-29-001" />
            </div>
            <div className="field">
              <label>SIRET / Numéro d'entreprise</label>
              <input className="input" value={form.club_siret} onChange={e => set('club_siret', e.target.value)}
                placeholder="123 456 789 00012" />
            </div>
          </div>
        </div>
      </div>

      {isClub && (
        <div className="card" style={{ marginTop:16 }}>
          <div className="card-head">
            <h2>Président du club</h2>
            <small className="muted">Coordonnées pour fiches FFESSM</small>
          </div>
          <div className="card-body" style={{ display:'grid', gap:12 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div className="field">
                <label>Prénom</label>
                <input className="input" value={form.president_prenom}
                  onChange={e => set('president_prenom', e.target.value)} />
              </div>
              <div className="field">
                <label>Nom</label>
                <input className="input" value={form.president_nom}
                  onChange={e => set('president_nom', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Téléphone</label>
              <input className="input" value={form.president_tel}
                onChange={e => set('president_tel', e.target.value)}
                placeholder="+33 6 12 34 56 78" />
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop:16 }}>
        <div className="card-head"><h2>Sécurité</h2></div>
        <div className="card-body" style={{ display:'grid', gap:12 }}>
          <div className="field">
            <label>Numéro d'urgence par défaut</label>
            <input className="input" value={form.urgence_defaut}
              onChange={e => set('urgence_defaut', e.target.value)}
              placeholder="18 (France) · 144 (Suisse) · 112 (Europe)" />
            <div className="field-hint">Pré-rempli avec ce numéro sur la fiche de sécurité (peut être modifié au cas par cas selon le pays du site).</div>
          </div>
        </div>
      </div>

      {error && <Alert tone="warn" style={{ marginTop:12 }}>{error}</Alert>}
      {saved  && <Alert tone="ok"   style={{ marginTop:12 }}>Enregistré.</Alert>}

      <div className="row" style={{ marginTop:16, gap:8 }}>
        <button className="btn primary" onClick={onSave} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {window.REGLEMENTATION && (
        <div className="muted" style={{ marginTop:24, fontSize:12, textAlign:'center' }}>
          {window.REGLEMENTATION.label}.<br />
          <span style={{ fontSize:11 }}>{window.REGLEMENTATION.textes}</span>
        </div>
      )}
    </div>
  );
}

export { ScreenAccount };
