// DP Assistant — Annuaire des plongeurs (v2)

import React, { useState, useEffect } from 'react';
import { Alert, Pill, diverFullName } from '../components/components.jsx';
import { TrimixQualToggles, toggleTrimixQual, trimixPrereq, BirthDateField, DiverExtraQuals, plongeurForEncadrant } from '../components/diver-form.jsx';
import { APTITUDE_MAP } from '../domain/index.js';
import { api } from '../api/api.js';

const NIVEAUX_PLONGEUR  = ['N1','N2','N3'];
const NIVEAUX_ENCADRANT = ['N4','N5','E1','E2','E3','E4'];

const emptyDiver = () => ({
  nom:'', prenom:'', licence:'',
  niveau_plongeur:'', niveau_encadrant:'',
  nitrox:[], trimix:[], recycleurs:[],
  diplome_pro:'', rifap:false, tiv:false,
  aptitudes_sup:[], medical:'', notes:'', date_naissance:''
});

// Aptitudes obligatoires pour un niveau (non décochables)
function getMandatoryAptitudes(np, ne) {
  const map = APTITUDE_MAP || {};
  const mandatory = new Set();
  if (np && map[np]) map[np].mandatory.forEach(a => mandatory.add(a));
  if (ne && map[ne]) map[ne].mandatory.forEach(a => mandatory.add(a));
  return mandatory;
}

// Aptitudes optionnelles disponibles
function getOptionalAptitudes(np, ne) {
  const map = APTITUDE_MAP || {};
  const opts = new Set();
  if (np && map[np]) map[np].optional.forEach(a => opts.add(a));
  if (ne && map[ne]) map[ne].optional.forEach(a => opts.add(a));
  return opts;
}

function AptitudesGroup({ form, setField }) {
  const np  = form.niveau_plongeur;
  const ne  = form.niveau_encadrant;
  if (!np && !ne) return null;

  const mandatory = getMandatoryAptitudes(np, ne);
  const optional  = getOptionalAptitudes(np, ne);
  const allApts   = [...mandatory, ...optional];

  if (allApts.length === 0) return null;

  const toggle = (a) => {
    if (mandatory.has(a)) return; // non décochable
    const cur = form.aptitudes_sup || [];
    setField('aptitudes_sup', cur.includes(a) ? cur.filter(x => x !== a) : [...cur, a]);
  };
  const isOn = (a) => mandatory.has(a) || (form.aptitudes_sup || []).includes(a);

  return (
    <div className="field" style={{ marginTop:10 }}>
      <label>Aptitudes</label>
      <div className="qualifs-grid">
        {allApts.map(a => {
          const locked = mandatory.has(a);
          const on     = isOn(a);
          return (
            <label key={a} className={`qualif-toggle ${on ? 'on' : ''} ${locked ? 'locked' : ''}`}
              title={locked ? 'Aptitude obligatoire pour ce niveau' : ''}>
              <input type="checkbox" checked={on} onChange={() => toggle(a)} disabled={locked} />
              {a}
            </label>
          );
        })}
      </div>
      <div className="field-hint">Les aptitudes grisées sont incluses de droit avec le niveau.</div>
    </div>
  );
}

function ScreenAdminDivers({ divers, setDivers, diversLoaded }) {
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyDiver());
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Le store divers est désormais partagé via le shell (src/app/hooks/use-directory.js) ; pas de fetch local.
  const loading = !diversLoaded;

  const openNew  = () => { setForm(emptyDiver()); setEditing('new'); setError(''); };
  const openEdit = (d) => {
    setForm({
      nom: d.nom, prenom: d.prenom || '', licence: d.licence || '',
      niveau_plongeur: d.niveau_plongeur || '',
      niveau_encadrant: d.niveau_encadrant || '',
      nitrox: d.nitrox || [],
      trimix: d.trimix || [],
      recycleurs: d.recycleurs || [],
      diplome_pro: d.diplome_pro || '',
      rifap: !!d.rifap, tiv: !!d.tiv,
      aptitudes_sup: d.aptitudes_sup || [],
      medical: d.medical || '', notes: d.notes || '',
      date_naissance: d.date_naissance || '',
    });
    setEditing(d);
    setError('');
  };
  const closeModal = () => { setEditing(null); setSaving(false); setError(''); };
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Quand niveau encadrant sélectionné → forcer niveau plongeur à N3
  const setNiveauEncadrant = (ne) => {
    setForm(f => ({
      ...f,
      niveau_encadrant: ne,
      niveau_plongeur: plongeurForEncadrant(ne, f.niveau_plongeur),
      rifap: ne ? true : f.rifap,
    }));
  };

  // Diplôme professionnel : DEJEPS → force E3 minimum + PN-C (donc PN)
  // DESJEPS → E4 minimum + PN-C
  const setDiplomePro = (val) => {
    setForm(f => {
      let ne = f.niveau_encadrant;
      let nx = [...f.nitrox];
      if (val === 'DEJEPS') {
        if (!['E3','E4'].includes(ne)) ne = 'E3';
        if (!nx.includes('PN'))   nx.push('PN');
        if (!nx.includes('PN-C')) nx.push('PN-C');
      } else if (val === 'DESJEPS') {
        if (ne !== 'E4') ne = 'E4';
        if (!nx.includes('PN'))   nx.push('PN');
        if (!nx.includes('PN-C')) nx.push('PN-C');
      }
      return {
        ...f,
        diplome_pro: val,
        niveau_encadrant: ne,
        niveau_plongeur: plongeurForEncadrant(ne, f.niveau_plongeur),
        rifap: ne ? true : f.rifap,
        nitrox: nx,
      };
    });
  };

  // Nitrox cascade : PN-C implique PN
  const toggleNitrox = (val) => {
    setForm(f => {
      let nx = [...f.nitrox];
      if (nx.includes(val)) {
        nx = nx.filter(x => x !== val);
        if (val === 'PN') nx = nx.filter(x => x !== 'PN-C');
      } else {
        nx.push(val);
        if (val === 'PN-C' && !nx.includes('PN')) nx.push('PN');
      }
      return { ...f, nitrox: nx };
    });
  };

  // Trimix cascade : PTH-120 ⊃ PTH-70 ⊃ PTH-40 (annexe III-18 a)
  const toggleTrimix = (val) => setForm(f => ({ ...f, trimix: toggleTrimixQual(f.trimix, val) }));

  const toggleRecycleur = (val) => setForm(f => ({
    ...f,
    recycleurs: f.recycleurs.includes(val)
      ? f.recycleurs.filter(x => x !== val)
      : [...f.recycleurs, val]
  }));

  // Nettoyage automatique si les pré-requis disparaissent
  useEffect(() => {
    const kept = form.trimix.filter(q => !trimixPrereq(form, q));
    if (kept.length !== form.trimix.length) setForm(f => ({ ...f, trimix: kept }));
  }, [form.nitrox, form.niveau_plongeur, form.niveau_encadrant]);

  const onSave = async () => {
    if (!form.nom.trim())   { setError('Le nom est requis'); return; }
    if (!form.medical)      { setError('La date du certificat médical est obligatoire'); return; }
    // Pas de niveau = licencié débutant (Baptême ou PE20, en formation uniquement).
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        diplome_pro: form.diplome_pro || null,
        niveau_plongeur: form.niveau_plongeur || null,
        niveau_encadrant: form.niveau_encadrant || null,
      };
      if (editing === 'new') {
        const d = await api.divers.create(payload);
        setDivers(prev => [...prev, d].sort((a, b) => a.nom.localeCompare(b.nom)));
      } else {
        const d = await api.divers.update(editing.id, payload);
        setDivers(prev => prev.map(x => x.id === d.id ? d : x));
      }
      closeModal();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id) => {
    try {
      await api.divers.delete(id);
      setDivers(prev => prev.filter(d => d.id !== id));
      setConfirmDelete(null);
    } catch (err) { setError(err.message); }
  };

  const filtered = divers.filter(d => {
    const f = filter.toLowerCase();
    return !f || d.nom.toLowerCase().includes(f)
      || (d.prenom || '').toLowerCase().includes(f)
      || (d.niveau_encadrant || d.niveau_plongeur || '').toLowerCase().includes(f)
      || (d.licence || '').includes(f);
  });

  const diverLabel = (d) => {
    const ne = d.niveau_encadrant;
    const np = d.niveau_plongeur;
    if (ne) return ne;
    if (np) return np;
    return 'Débutant';
  };

  const medExpiry = (d) => {
    if (!d.medical) return null;
    const exp = new Date(d.medical);
    exp.setFullYear(exp.getFullYear() + 1);
    return exp;
  };
  const medExpired = (d) => { const e = medExpiry(d); return e && e < new Date(); };

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Administration</div>
        <h1>Annuaire des plongeurs</h1>
        <p>{divers.length} plongeur{divers.length !== 1 ? 's' : ''} enregistré{divers.length !== 1 ? 's' : ''}.</p>
      </div>

      {error && !editing && <Alert tone="warn">{error}</Alert>}

      <div className="row" style={{ marginBottom:14, gap:8 }}>
        <input className="input" placeholder="Rechercher…" value={filter}
          onChange={e => setFilter(e.target.value)} style={{ flex:1 }} />
        <button className="btn primary" onClick={openNew}>+ Nouveau plongeur</button>
      </div>

      {loading && <div className="muted">Chargement…</div>}

      <div className="diver-admin-list">
        {filtered.map(d => (
          <div className="diver-admin-row" key={d.id}>
            <div className="info">
              <b>{diverFullName(d)}
                {d._pending && (
                  <span title="Modification non encore synchronisée avec le serveur"
                    style={{ display:'inline-block', width:8, height:8, borderRadius:'50%',
                      background:'var(--coral, #e07856)', marginLeft:8, verticalAlign:'middle' }} />
                )}
              </b>
              <div className="meta-row">
                <Pill tone="ink">{diverLabel(d)}</Pill>
                {(d.nitrox || []).includes('PN-C') && <Pill tone="kelp">PN-C</Pill>}
                {(d.nitrox || []).includes('PN')   && !(d.nitrox||[]).includes('PN-C') && <Pill tone="kelp">PN</Pill>}
                {(d.trimix || []).includes('PTH-120') && <Pill tone="sun">PTH-120</Pill>}
                {(d.trimix || []).includes('PTH-70')  && !(d.trimix||[]).includes('PTH-120') && <Pill tone="sun">PTH-70</Pill>}
                {(d.trimix || []).includes('PTH-40')  && !(d.trimix||[]).includes('PTH-70') && <Pill tone="sun">PTH-40</Pill>}
                {(d.recycleurs || []).length > 0 && <Pill tone="coral">CCR</Pill>}
                {d.rifap && <Pill>RIFAP</Pill>}
                {d.tiv   && <Pill>TIV</Pill>}
                {d.licence && <span className="muted" style={{ fontSize:11, fontFamily:'var(--t-mono)' }}>{d.licence}</span>}
              </div>
              {d.medical && (
                <small className={medExpired(d) ? 'text-coral' : 'muted'}>
                  Certificat médical : émis le {d.medical}
                  {' '}(valable jusqu'au {medExpiry(d).toLocaleDateString('fr-FR')}){medExpired(d) ? ' ⚠ Expiré' : ''}
                </small>
              )}
            </div>
            <div className="diver-admin-actions">
              <button className="btn ghost" onClick={() => openEdit(d)}>Modifier</button>
              <button className="btn ghost err" onClick={() => setConfirmDelete(d)}>Supprimer</button>
            </div>
          </div>
        ))}
        {!loading && filtered.length === 0 && <div className="empty">Aucun plongeur trouvé.</div>}
      </div>

      {editing !== null && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal modal-wide">
            <div className="modal-head">
              <h3>{editing === 'new' ? 'Nouveau plongeur' : `Modifier ${diverFullName(editing)}`}</h3>
              <button className="x" onClick={closeModal}>×</button>
            </div>
            <div className="modal-body">
              {error && <Alert tone="warn" style={{ marginBottom:10 }}>{error}</Alert>}

              {/* Identité */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div className="field">
                  <label>Nom *</label>
                  <input className="input" value={form.nom} onChange={e => setField('nom', e.target.value)} />
                </div>
                <div className="field">
                  <label>Prénom</label>
                  <input className="input" value={form.prenom} onChange={e => setField('prenom', e.target.value)} />
                </div>
              </div>
              <div className="field" style={{ marginTop:10 }}>
                <label>Numéro de licence</label>
                <input className="input" value={form.licence} onChange={e => setField('licence', e.target.value)}
                  placeholder="A-29-001234" style={{ fontFamily:'var(--t-mono)' }} />
              </div>

              <hr />

              {/* Niveaux */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div className="field">
                  <label>Niveau plongeur</label>
                  <select className="input" value={form.niveau_plongeur}
                    onChange={e => setField('niveau_plongeur', e.target.value)}
                    disabled={!!form.niveau_encadrant && form.niveau_encadrant !== 'E1'}>
                    <option value="">— aucun / baptême —</option>
                    {NIVEAUX_PLONGEUR.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  {form.niveau_encadrant && <div className="field-hint">N3 pour un encadrant (N2 possible pour un E1)</div>}
                </div>
                <div className="field">
                  <label>Niveau encadrant</label>
                  <select className="input" value={form.niveau_encadrant}
                    onChange={e => setNiveauEncadrant(e.target.value)}>
                    <option value="">— aucun —</option>
                    {NIVEAUX_ENCADRANT.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              <AptitudesGroup form={form} setField={setField} />

              {!form.niveau_plongeur && !form.niveau_encadrant && (
                <div className="field-hint" style={{ marginTop:6, color:'var(--coral)' }}>
                  Sans niveau = licencié débutant — autorisé en Baptême ou PE20, uniquement
                  dans une palanquée de formation (avec un enseignant E1→E4).
                </div>
              )}

              <hr />

              {/* Groupes qualifications */}
              <div className="qualif-section">
                <div className="qualif-section-label">Nitrox</div>
                <div className="qualif-row">
                  {['PN','PN-C'].map(q => {
                    const on = form.nitrox.includes(q);
                    const locked = q === 'PN' && form.nitrox.includes('PN-C');
                    return (
                      <label key={q} className={`qualif-toggle ${on ? 'on' : ''} ${locked ? 'locked' : ''}`}>
                        <input type="checkbox" checked={on} onChange={() => toggleNitrox(q)} disabled={locked} />
                        {q}{q === 'PN-C' ? ' (implique PN)' : ''}
                      </label>
                    );
                  })}
                </div>
              </div>

              <TrimixQualToggles form={form} onToggle={toggleTrimix} />

              <DiverExtraQuals form={form} setField={setField}
                onToggleRecycleur={toggleRecycleur} onDiplomePro={setDiplomePro} />

              <hr />

              <div className="field" style={{ marginTop:10 }}>
                <label htmlFor="admin-diver-medical">Certificat médical (date d'émission) *</label>
                <input id="admin-diver-medical" className="input" type="date" value={form.medical}
                  onChange={e => setField('medical', e.target.value)} required />
              </div>

              <BirthDateField value={form.date_naissance} onChange={v => setField('date_naissance', v)} />

              <div className="field" style={{ marginTop:10 }}>
                <label>Notes</label>
                <textarea className="textarea" value={form.notes}
                  onChange={e => setField('notes', e.target.value)} rows={2} />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={closeModal}>Annuler</button>
              <button className="btn primary" onClick={onSave} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:400 }}>
            <div className="modal-head"><h3>Supprimer {diverFullName(confirmDelete)} ?</h3></div>
            <div className="modal-body"><p>Cette action est irréversible.</p></div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setConfirmDelete(null)}>Annuler</button>
              <button className="btn primary err" onClick={() => onDelete(confirmDelete.id)}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { ScreenAdminDivers, NIVEAUX_PLONGEUR, NIVEAUX_ENCADRANT };
