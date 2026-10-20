// DP Assistant — Plongeurs & Palanquées (v3 — règles FFESSM / CdS complètes)
//
// La logique métier (validatePal, peLevel, paLevel, getMaxEnsLevel) est dans
// lib/pal-rules.js. Le calcul partagé de plafond profondeur est dans
// lib/depth-clamp.js. Ce fichier ne contient plus que la UI + les callbacks
// CRUD.

import React, { useState, useEffect, useMemo } from 'react';
import { Alert, Pill, diverFullName } from './components.jsx';
import { DiverQuickAdd } from './diver-form.jsx';

const PAL_COLORS = {
  exploration: 'pal-explo',
  guidee:      'pal-guidee',
  formation:   'pal-form',
  bapteme:     'pal-bapteme',
};

// Helpers délégués à lib/pal-rules.js (chargé avant data.js)
const { getMaxEnsLevel, validatePal, derivePalMode } = window;

const ENS_ROLES = ['E1', 'E2', 'E3', 'E4'];

// Contexte d'aptitudes d'une palanquée : enseignant présent + mode (le bonus
// de formation n'existe qu'en enseignement).
function palContextOf(pal, membres = pal.membres) {
  return { maxEnsLevel: getMaxEnsLevel(membres), mode: derivePalMode({ ...pal, membres }) };
}

// ── AptitudeSelect ────────────────────────────────────────────────────────
function AptitudeSelect({ diver, value, palContext, onChange, invalid }) {
  const available = window.getDiverAptitudes(diver, false, palContext);
  const single = available.length === 1 ? available[0] : null;
  // Une seule aptitude possible : sélection automatique (après rendu).
  useEffect(() => {
    if (single && !value) onChange(single);
  }, [single, value]);
  if (available.length === 0) return <span className="muted">—</span>;
  return (
    <select className={`role-sel${invalid ? ' invalid' : ''}`} value={value || ''}
      aria-label={`Aptitude de ${diverFullName(diver)}`}
      aria-invalid={invalid || undefined}
      onChange={e => onChange(e.target.value)}>
      <option value="">— aptitude —</option>
      {available.map(a => <option key={a} value={a}>{a}</option>)}
      {value && !available.includes(value) && <option value={value}>{value} (non justifiée)</option>}
    </select>
  );
}

// Calcul partagé du plafond effectif d'une palanquée. Wrapper de
// window.computePalHardLimit qui injecte automatiquement les dépendances
// depuis data.js (aptitudeMaxDepth, getPalType, getDpMaxDepth).
function hardLimitFor(pal, membres, dp, siteMax = Infinity) {
  return window.computePalHardLimit({
    membres, dp, sessionMax: Infinity, siteMax,
    melanges: pal.melanges || ['Air'],
    mode: derivePalMode({ ...pal, membres }),
    aptitudeMaxDepth: window.aptitudeMaxDepth,
    getPalType:       window.getPalType,
    getDpMaxDepth:    window.getDpMaxDepth,
  });
}

function ageAt(birthIso, whenIso) {
  if (!birthIso) return null;
  const b = new Date(birthIso), w = whenIso ? new Date(whenIso) : new Date();
  if (isNaN(b.getTime())) return null;
  let age = w.getFullYear() - b.getFullYear();
  if (w.getMonth() < b.getMonth() || (w.getMonth() === b.getMonth() && w.getDate() < b.getDate())) age -= 1;
  return age;
}

// Mode enseignement / exploration (A322-75) : choisi par le DP dès qu'un
// enseignant est présent ; un baptême est toujours de l'enseignement.
function PalModeToggle({ pal, onChange }) {
  const apts = pal.membres.map(m => m.aptitude);
  if (!apts.some(a => ENS_ROLES.includes(a)) || apts.includes('Baptême')) return null;
  const mode = derivePalMode(pal);
  return (
    <div className="seg" role="radiogroup" aria-label="Type de plongée">
      {[['enseignement', 'Enseignement'], ['exploration', 'Exploration']].map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={mode === v}
          className={mode === v ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}


// ── ScreenPalanquees ──────────────────────────────────────────────────────
function ScreenPalanquees({ divers, setDivers, palanquees, setPalanquees, answers, setAnswer }) {
  const [filter, setFilter] = useState('');
  const [showQuickDiver, setShowQuickDiver] = useState(false);
  const [openGroups, setOpenGroups] = useState(() => new Set(['e3e4', 'e1e2n4', 'autres']));
  const toggleGroup = (id) => setOpenGroups(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // N5 → exploration uniquement (III-15 a)
  const isExploration = answers.dp_qual === 'N5';
  const dpQual = answers.dp_qual || '';
  const defaultMode = isExploration ? 'exploration' : undefined;

  // Profondeur max du site (Infinity si non définie)
  const siteMax = answers.site_prof_max ? Number(answers.site_prof_max) : Infinity;

  // DP courant (objet plongeur complet — nécessaire pour les contrôles gaz)
  const dpDiver = useMemo(
    () => divers.find(d => d.id === answers.dp_id) || null,
    [divers, answers.dp_id]
  );
  const melangesCatalog = useMemo(
    () => window.getAvailableMelanges(dpDiver),
    [dpDiver]
  );
  const allowedMelangeValues = useMemo(
    () => new Set(melangesCatalog.filter(m => m.allowed).map(m => m.value)),
    [melangesCatalog]
  );

  // Nettoyer automatiquement les mélanges devenus interdits quand le DP change
  useEffect(() => {
    setPalanquees(prev => prev.map(p => {
      const cur = p.melanges || [];
      const next = cur.filter(m => allowedMelangeValues.has(m));
      if (next.length === cur.length) return p;
      // si on a tout retiré, on rebascule sur Air (toujours autorisé)
      return { ...p, melanges: next.length > 0 ? next : ['Air'] };
    }));
  }, [allowedMelangeValues]);

  // Re-borner la profondeur des palanquées existantes quand le DP ou le site changent.
  useEffect(() => {
    setPalanquees(prev => prev.map(p => {
      const hardLimit = hardLimitFor(p, p.membres || [], dpDiver, siteMax);
      if (!Number.isFinite(hardLimit) || p.profMax <= hardLimit) return p;
      return { ...p, profMax: hardLimit };
    }));
  }, [dpDiver, siteMax]);

  // Dériver l'activité depuis le mode de chaque palanquée (A322-75)
  useEffect(() => {
    if (!palanquees.length) { setAnswer('activite', 'Exploration'); return; }
    const modes = new Set(palanquees.filter(p => p.membres.length).map(p => derivePalMode(p)));
    const hasEns = modes.has('enseignement');
    const hasExp = modes.has('exploration');
    setAnswer('activite', (hasEns && hasExp) ? 'Mixte' : hasEns ? 'Enseignement' : 'Exploration');
  }, [palanquees]);

  // Mineurs détectés depuis les dates de naissance (pas de re-questionnement)
  useEffect(() => {
    const hasMinor = palanquees.some(p => p.membres.some(m => {
      if (m._bapteme) return false;
      const age = ageAt(diversById[m.diverId]?.date_naissance, answers.date);
      return age !== null && age < 18;
    }));
    if (hasMinor && !answers.mineurs) setAnswer('mineurs', true);
  }, [palanquees, divers, answers.date]);

  // Dériver prof_max depuis la profondeur max des palanquées (valeur affichée + utilisée par checklist/fiche)
  useEffect(() => {
    if (!palanquees.length) { setAnswer('prof_max', null); return; }
    const maxDepth = Math.max(...palanquees.map(p => p.profMax || 0));
    setAnswer('prof_max', maxDepth > 0 ? `${maxDepth} m` : null);
  }, [palanquees]);

  // Dériver mélanges depuis les palanquées (remplace section D du questionnaire)
  useEffect(() => {
    const all = new Set();
    palanquees.forEach(p => (p.melanges || []).forEach(m => all.add(m)));
    setAnswer('air',          all.has('Air'));
    setAnswer('nitrox',       all.has('Nx ≤ 40%') || all.has('Nx > 40%'));
    setAnswer('nitrox_sup_40', all.has('Nx > 40%'));
    setAnswer('trimix',       all.has('Tx'));
  }, [palanquees]);

  // Ranger plongeurs assignés
  const diversById = useMemo(() => {
    const m = {}; divers.forEach(d => m[d.id] = d); return m;
  }, [divers]);

  const assignedIds = useMemo(() => {
    const s = new Set();
    palanquees.forEach(p => p.membres.forEach(m => { if (!m._bapteme) s.add(m.diverId); }));
    return s;
  }, [palanquees]);

  const filteredPool = useMemo(() => {
    const f = filter.toLowerCase();
    return divers.filter(d =>
      !assignedIds.has(d.id) && (
        !f || d.nom.toLowerCase().includes(f) || (d.prenom||'').toLowerCase().includes(f) ||
        (d.niveau_encadrant||d.niveau_plongeur||'').toLowerCase().includes(f)
      )
    );
  }, [divers, filter, assignedIds]);

  const poolGroups = useMemo(() => {
    const alpha = (a, b) =>
      (a.nom + ' ' + (a.prenom || '')).localeCompare((b.nom + ' ' + (b.prenom || '')), 'fr');
    const lvlOrd = np => ({ N3: 0, N2: 1, N1: 2 })[np] ?? 3;

    const g = { e3e4: [], e1e2n4: [], autres: [] };
    filteredPool.forEach(d => {
      const ne = d.niveau_encadrant, np = d.niveau_plongeur;
      if (['E3', 'E4'].includes(ne)) g.e3e4.push(d);
      else if (['E1', 'E2'].includes(ne) || np === 'N4') g.e1e2n4.push(d);
      else g.autres.push(d);
    });
    g.e3e4.sort(alpha);
    g.e1e2n4.sort(alpha);
    g.autres.sort((a, b) => {
      const lo = lvlOrd(a.niveau_plongeur) - lvlOrd(b.niveau_plongeur);
      return lo !== 0 ? lo : alpha(a, b);
    });
    return [
      { id: 'e3e4',   label: 'E3 / E4',      section: 'encadrants', divers: g.e3e4   },
      { id: 'e1e2n4', label: 'E1 · E2 · N4', section: 'encadrants', divers: g.e1e2n4 },
      { id: 'autres', label: 'Plongeurs',     section: 'plongeurs',  divers: g.autres  },
    ].filter(g => g.divers.length > 0);
  }, [filteredPool]);

  // Réordonne automatiquement les membres après toute attribution d'aptitude.
  const sortMembres = (membres) => window.sortMembresForFiche(membres);

  // Dérive le nom automatique d'une palanquée selon sa position et son encadrant.
  const derivePalNom = (index, membres) => {
    const enc = membres.find(m => m.aptitude === 'GP' || ['E1','E2','E3','E4'].includes(m.aptitude));
    const prenom = enc && !enc._bapteme ? (diversById[enc.diverId]?.prenom || null) : null;
    return `Palanquée ${index + 1}${prenom ? ` ${prenom}` : ''}`;
  };

  // ── CRUD palanquées ─────────────────────────────────────────────────
  const addToPal = (palId, diverId) => {
    setPalanquees(prev => prev.map((p, i) => {
      if (p.id !== palId || p.membres.find(m => m.diverId === diverId)) return p;
      const d = diversById[diverId];
      const apts = d ? window.getDiverAptitudes(d, false, palContextOf(p)) : [];
      const aptitude = apts.length === 1 ? apts[0] : '';
      const newMembres = sortMembres([...p.membres, { diverId, aptitude }]);
      const nom = p.nomAuto ? derivePalNom(i, newMembres) : p.nom;
      // addToPal préserve la profondeur existante : seule une aptitude plus
      // restrictive la réduit.
      const hardLimit = hardLimitFor(p, newMembres, dpDiver, siteMax);
      const profMax   = window.clampProfMax(p.profMax, hardLimit);
      return { ...p, membres: newMembres, nom, profMax };
    }));
  };

  const removeFromPal = (palId, idOrIdx) => {
    setPalanquees(prev => prev.map((p, i) => {
      if (p.id !== palId) return p;
      const newMembres = p.membres.filter(m =>
        m._bapteme ? m.id !== idOrIdx : m.diverId !== idOrIdx);
      const nom = p.nomAuto ? derivePalNom(i, newMembres) : p.nom;
      return { ...p, membres: newMembres, nom };
    }));
  };

  const setAptitude = (palId, key, aptitude, isBapt = false) => {
    setPalanquees(prev => prev.map((p, i) => {
      if (p.id !== palId) return p;
      // Mettre à jour le membre ciblé
      let newMembres = p.membres.map(m => {
        if (isBapt && m._bapteme && m.id === key) return { ...m, aptitude };
        if (!isBapt && !m._bapteme && m.diverId === key) return { ...m, aptitude };
        return m;
      });
      // Propager l'aptitude aux membres sans aptitude si compatible
      // palContext recalculé après mise à jour pour inclure l'éventuel enseignant
      const palCtx = palContextOf(p, newMembres);
      newMembres = newMembres.map(m => {
        if (m.aptitude || m._bapteme) return m;
        const d = diversById[m.diverId];
        if (!d) return m;
        const avail = window.getDiverAptitudes(d, false, palCtx);
        return avail.includes(aptitude) ? { ...m, aptitude } : m;
      });
      newMembres = sortMembres(newMembres);
      const nom = p.nomAuto ? derivePalNom(i, newMembres) : p.nom;
      // Plafond : aptitude la plus restrictive ∩ gaz ∩ limite DP ∩ site
      const hardLimit = hardLimitFor(p, newMembres, dpDiver, siteMax);
      const profMax   = window.clampProfMax(p.profMax, hardLimit);
      return { ...p, membres: newMembres, nom, profMax };
    }));
  };

  const setPalField = (palId, field, value) =>
    setPalanquees(prev => prev.map(p =>
      p.id === palId
        ? { ...p, [field]: value, ...(field === 'nom' ? { nomAuto: false } : {}) }
        : p
    ));

  const toggleMelange = (palId, m) => {
    setPalanquees(prev => prev.map(p => {
      if (p.id !== palId) return p;
      const cur = p.melanges || [];
      const next = cur.includes(m) ? cur.filter(x => x !== m) : [...cur, m];
      return { ...p, melanges: next };
    }));
  };

  // Profondeur bornée par aptitudes, gaz, limite DP et site. La DTR n'est
  // jamais calculée d'office : c'est une donnée de planification du DP.
  const updateProfMax = (palId, profMax) => {
    setPalanquees(prev => prev.map(p => {
      if (p.id !== palId) return p;
      const hardLimit = hardLimitFor(p, p.membres || [], dpDiver, siteMax);
      return { ...p, profMax: window.clampProfMax(profMax, hardLimit) };
    }));
  };
  const toggleNoDeco = (palId) => {
    setPalanquees(prev => prev.map(p => (p.id === palId ? { ...p, no_deco: !p.no_deco } : p)));
  };
  const setPalMode = (palId, mode) => {
    setPalanquees(prev => prev.map(p => {
      if (p.id !== palId) return p;
      // Les aptitudes « bonus formation » ne valent plus en exploration : on les vide.
      const next = { ...p, mode };
      const ctx = palContextOf(next);
      const membres = p.membres.map(m => {
        if (m._bapteme) return m;
        const d = diversById[m.diverId];
        return d && m.aptitude && !window.getDiverAptitudes(d, false, ctx).includes(m.aptitude)
          ? { ...m, aptitude: '' } : m;
      });
      return { ...next, membres };
    }));
  };

  const addPal = () => {
    const id = 'p' + (Math.max(0, ...palanquees.map(p => parseInt(p.id.slice(1)) || 0)) + 1);
    const dpLimit    = window.getDpMaxDepth('exploration', dpDiver) || Infinity;
    const initProfMax = Math.min(60, siteMax, dpLimit);
    setPalanquees(prev => [...prev, {
      id, nom: `Palanquée ${prev.length + 1}`, nomAuto: true, mode: defaultMode,
      membres: [], profMax: initProfMax, duree: 35, dtr: null,
      melanges: ['Air'],
      no_deco: !answers.paliers,
      shot_line: !!answers.shot_line,
    }]);
  };

  const removePal = (palId) =>
    setPalanquees(prev => {
      const filtered = prev.filter(p => p.id !== palId);
      return filtered.map((p, i) =>
        p.nomAuto ? { ...p, nom: derivePalNom(i, p.membres) } : p
      );
    });

  const addPalAndAddDiver = (diverId) => {
    setPalanquees(prev => {
      const newIdx = prev.length;
      const newId = 'p' + (Math.max(0, ...prev.map(p => parseInt(p.id.slice(1)) || 0)) + 1);
      const d = diversById[diverId];
      const base = { melanges: ['Air'], mode: defaultMode, membres: [] };
      const apts = d ? window.getDiverAptitudes(d, false, palContextOf(base)) : [];
      const aptitude = apts.length === 1 ? apts[0] : '';
      const newMembres = [{ diverId, aptitude }];
      const hardLimit  = hardLimitFor(base, newMembres, dpDiver, siteMax);
      const initProfMax = Number.isFinite(hardLimit) ? hardLimit : 60;
      return [...prev, {
        id: newId,
        nom: derivePalNom(newIdx, newMembres),
        nomAuto: true,
        mode: defaultMode,
        membres: newMembres,
        profMax: initProfMax, duree: 35, dtr: null,
        melanges: ['Air'],
        no_deco: !answers.paliers,
        shot_line: !!answers.shot_line,
      }];
    });
  };

  // ── DP validation (III-15 a, A322-98) ───────────────────────────────
  const dpQualOK = useMemo(() => {
    if (!dpQual) return { tone:'warn', text:'Aucun Directeur de Plongée sélectionné (section A).' };
    const q = window.CDS.DP_QUALIF[dpQual];
    if (!q) return { tone:'err', text:`${dpQual} ne peut pas être DP.` };
    const bassin = window.isBassinDerogation(answers, 0);
    if (bassin && !q.bassin) return { tone:'err', text:`Piscine / fosse ≤ 6 m : DP enseignant E1 minimum (A322-98).` };
    if (!bassin && !q.naturel) return { tone:'err', text:`DP ${dpQual} : piscine ou fosse ≤ 6 m uniquement. En milieu naturel, DP P5/DPE, E3 ou E4 (III-15 a).` };
    return { tone:'ok', text:`DP ${dpQual} valide pour ce lieu.` };
  }, [dpQual, answers.milieu, answers.site_prof_max]);

  const siteShotLine = answers.shot_line;

  const renderDiverCard = (d) => {
    const ne = d.niveau_encadrant, np = d.niveau_plongeur;
    return (
      <div className="diver-card" key={d.id}>
        <div className="info">
          <b>{diverFullName(d)}</b>
          <small>
            {ne ? <span className="pill ink" style={{ fontSize:11, padding:'1px 6px', borderRadius:3, marginRight:4 }}>{ne}</span> : null}
            {np && !ne ? <span style={{ marginRight:4 }}>{np}</span> : null}
            {!ne && !np ? <span className="pill coral" style={{ fontSize:11, padding:'1px 6px', borderRadius:3, marginRight:4 }}>Débutant</span> : null}
            {(d.nitrox||[]).includes('PN-C') && <span className="muted"> · PN-C</span>}
            {(d.trimix||[]).includes('PTH-120') && <span className="muted"> · PTH-120</span>}
            {(d.recycleurs||[]).length > 0 && <span className="muted"> · CCR</span>}
          </small>
        </div>
        <select className="role-sel"
          onChange={e => {
            const v = e.target.value;
            if (v === '__new__') addPalAndAddDiver(d.id);
            else if (v) addToPal(v, d.id);
            e.target.value = '';
          }}
          value="">
          <option value="">+ Ajouter à…</option>
          {palanquees.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
          <option value="__new__">— Nouvelle palanquée</option>
        </select>
      </div>
    );
  };

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Étape 2 / 5 · Plongeurs & palanquées</div>
        <h1>Constituer les palanquées</h1>
        <p>Ajoutez les plongeurs depuis l'annuaire, ou créez-en à la volée. Les règles FFESSM / Code du Sport sont vérifiées en temps réel.</p>
      </div>

      <Alert tone={dpQualOK.tone}>{dpQualOK.text}</Alert>
      {isExploration && <Alert tone="info">DP N5 — exploration uniquement, pas d'enseignement.</Alert>}

      <div className="divers-grid">
        {/* Annuaire */}
        <div className="diver-pool">
          <h4>Annuaire — {filteredPool.length} disponible{filteredPool.length !== 1 ? 's' : ''} / {divers.length}</h4>
          <input className="input small" type="text" placeholder="Rechercher…"
            value={filter} onChange={e => setFilter(e.target.value)} style={{ marginBottom:10 }} />
          {(() => {
            let lastSection = null;
            return poolGroups.map(group => {
              const showHeader = group.section !== lastSection;
              lastSection = group.section;
              const isOpen = openGroups.has(group.id);
              return (
                <React.Fragment key={group.id}>
                  {showHeader && group.section === 'encadrants' && (
                    <div className="pool-section-label">Encadrants</div>
                  )}
              <div className="pool-group">
                <button className="pool-group-header" aria-expanded={isOpen}
                  onClick={() => toggleGroup(group.id)}>
                  <span>{group.label}</span>
                  <span className="pool-group-meta">
                    <span className="pool-group-count">{group.divers.length}</span>
                    <span className="pool-group-chevron">▾</span>
                  </span>
                </button>
                {isOpen && (
                  <div className="pool-group-body">
                    {group.id === 'autres'
                      ? (() => {
                          const lvlLabel = np => np || 'Débutant';
                          let lastLvl = null;
                          return group.divers.map(d => {
                            const lbl = lvlLabel(d.niveau_plongeur);
                            const divider = lbl !== lastLvl ? (lastLvl = lbl, lbl) : null;
                            return (
                              <React.Fragment key={d.id}>
                                {divider && <div className="pool-level-divider">{divider}</div>}
                                {renderDiverCard(d)}
                              </React.Fragment>
                            );
                          });
                        })()
                      : group.divers.map(d => <React.Fragment key={d.id}>{renderDiverCard(d)}</React.Fragment>)
                    }
                  </div>
                )}
              </div>
                </React.Fragment>
              );
            });
          })()}
          <button className="btn ghost" style={{ marginTop:8, width:'100%' }}
            onClick={() => setShowQuickDiver(true)}>
            + Nouveau plongeur / baptême
          </button>
        </div>

        {/* Palanquées */}
        <div className="pal-list">
          {palanquees.map((p, idx) => {
            const issues  = validatePal(p, diversById, answers, dpDiver);
            const palType = window.getPalType(p.membres, p.mode);
            const colorClass = PAL_COLORS[palType] || '';
            const melanges = p.melanges || [];
            const hasNitrox = melanges.includes('Nx ≤ 40%') || melanges.includes('Nx > 40%');
            const blocking = issues.filter(v => v.tone === 'err');
            const flagged = new Set(blocking.flatMap(v => v.ids || []));
            return (
              <div className={`pal ${colorClass}${blocking.length ? ' pal-blocked' : ''}`} key={p.id}>
                <div className="pal-head">
                  <span className="num">{idx + 1}</span>
                  <input className="input small" style={{ flex:1, fontWeight:600 }}
                    value={p.nom} onChange={e => setPalField(p.id, 'nom', e.target.value)} />
                  <span className={`pal-type-badge ${colorClass}`}>{palType}</span>
                  <button className="btn ghost" aria-label={`Supprimer ${p.nom}`} onClick={() => removePal(p.id)}>×</button>
                </div>

                {blocking.length > 0 && (
                  <div className="pal-blocked-summary" role="alert">
                    {blocking.length} point{blocking.length > 1 ? 's' : ''} bloquant{blocking.length > 1 ? 's' : ''} — détail ci-dessous
                  </div>
                )}

                <PalModeToggle pal={p} onChange={mode => setPalMode(p.id, mode)} />

                <div className="pal-params">
                  <div className="p">
                    <span>Prof. max</span>
                    <b><input className="input small num" type="number" value={p.profMax}
                      onChange={e => updateProfMax(p.id, parseFloat(e.target.value)||0)} /> m</b>
                  </div>
                  <div className="p">
                    <span>Durée prévue</span>
                    <b><input className="input small num" type="number" value={p.duree}
                      onChange={e => setPalField(p.id, 'duree', parseFloat(e.target.value)||0)} /> min</b>
                  </div>
                  <div className="p">
                    <span>DTR prévue</span>
                    <b><input className="input small num" type="number" inputMode="numeric" min="0"
                      value={p.dtr ?? ''} placeholder="à saisir"
                      aria-label="Durée totale de remontée prévue (minutes)"
                      onChange={e => setPalField(p.id, 'dtr', e.target.value === '' ? null : parseFloat(e.target.value))} /> min</b>
                  </div>
                  {hasNitrox && (
                    <div className="p">
                      <span>O₂ du mélange</span>
                      <b><input className="input small num" type="number" inputMode="numeric" min="22" max="100"
                        value={p.o2 ?? ''} placeholder="%"
                        aria-label="Pourcentage d'oxygène du nitrox"
                        onChange={e => setPalField(p.id, 'o2', e.target.value === '' ? null : parseFloat(e.target.value))} /> %</b>
                    </div>
                  )}
                </div>

                <div className="pal-options">
                  <div className="qualif-row" style={{ gap: 8 }}>
                    {melangesCatalog.map(({ value, allowed, reason }) => {
                      const on = melanges.includes(value);
                      return (
                        <label key={value}
                          className={`qualif-toggle ${on ? 'on' : ''} ${allowed ? '' : 'locked'}`}
                          title={!allowed ? reason : ''}>
                          <input type="checkbox" checked={on}
                            disabled={!allowed}
                            onChange={() => allowed && toggleMelange(p.id, value)} />
                          {value}
                        </label>
                      );
                    })}
                  </div>
                  <div className="qualif-row" style={{ gap: 8, marginTop: 6 }}>
                    <label className={`qualif-toggle ${(p.no_deco || palType === 'bapteme') ? 'on' : ''} ${palType === 'bapteme' ? 'locked' : ''}`}>
                      <input type="checkbox" checked={!!(p.no_deco || palType === 'bapteme')}
                        onChange={() => palType !== 'bapteme' && toggleNoDeco(p.id)}
                        disabled={palType === 'bapteme'} />
                      Sans palier obligatoire
                    </label>
                    {siteShotLine && (
                      <label className={`qualif-toggle ${p.shot_line ? 'on' : ''}`}>
                        <input type="checkbox" checked={!!p.shot_line}
                          onChange={() => setPalField(p.id, 'shot_line', !p.shot_line)} />
                        Shot-line
                      </label>
                    )}
                  </div>
                </div>

                {p.membres.length === 0 && (
                  <div className="empty" style={{ padding:18, fontSize:13 }}>Aucun plongeur.</div>
                )}

                {p.membres.map((m) => {
                  if (m._bapteme) {
                    return (
                      <div className={`diver-row${flagged.has(m.id) ? ' flagged' : ''}`} key={'b' + m.id}>
                        <Pill tone="coral">Baptême</Pill>
                        <div className="name">
                          <b>{(m.prenom || '') + ' ' + (m.nom || '').toUpperCase()}</b>
                          <small>Non enregistré dans l'annuaire</small>
                        </div>
                        <Pill>Baptême</Pill>
                        <button className="x" aria-label="Retirer le baptisé" onClick={() => removeFromPal(p.id, m.id)}>×</button>
                      </div>
                    );
                  }
                  const d = diversById[m.diverId];
                  if (!d) return null;
                  const ne = d.niveau_encadrant, np = d.niveau_plongeur;
                  return (
                    <div className={`diver-row${flagged.has(m.diverId) ? ' flagged' : ''}`} key={m.diverId}>
                      <Pill tone="ink">{ne || np || '?'}</Pill>
                      <div className="name">
                        <b>{diverFullName(d)}</b>
                        <small>{(d.nitrox||[]).join(' ')} {(d.trimix||[]).join(' ')}</small>
                      </div>
                      <AptitudeSelect diver={d} value={m.aptitude}
                        palContext={palContextOf(p)}
                        invalid={flagged.has(m.diverId)}
                        onChange={apt => setAptitude(p.id, m.diverId, apt)} />
                      <button className="x" aria-label={`Retirer ${diverFullName(d)}`} onClick={() => removeFromPal(p.id, m.diverId)}>×</button>
                    </div>
                  );
                })}

                <div className="val-list" style={{ marginTop:10 }}>
                  {issues.map((v, i) => (
                    <div className={`v ${v.tone}`} key={i}>
                      <span className="tag">
                        {v.tone === 'err' ? 'BLOQUANT' : v.tone === 'warn' ? 'ALERTE' : 'OK'}
                      </span>
                      <span>{v.text}{v.ref && <small className="v-ref"> · CdS {v.ref}</small>}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <button className="pal-add" onClick={addPal}
            disabled={divers.every(d => assignedIds.has(d.id))}>
            + Ajouter une palanquée
          </button>
        </div>
      </div>

      {showQuickDiver && (
        <DiverQuickAdd
          allowBapteme={true}
          onClose={() => setShowQuickDiver(false)}
          onCreated={d => {
            setDivers(prev => [...prev, d].sort((a,b) => a.nom.localeCompare(b.nom)));
            setShowQuickDiver(false);
          }}
          baptemeOnSave={bap => {
            // Ajout atomique du baptême dans la dernière palanquée (création si vide)
            setPalanquees(prev => {
              if (prev.length === 0) {
                const id = 'p1';
                return [{
                  id, nom: 'Palanquée 1',
                  membres: [{ ...bap, aptitude: 'Baptême', _bapteme: true }],
                  profMax: 6, duree: 20, dtr: null,
                  melanges: ['Air'],
                  no_deco: true,
                  shot_line: false,
                }];
              }
              const lastIdx = prev.length - 1;
              return prev.map((p, i) =>
                i === lastIdx
                  ? { ...p, no_deco: true, membres: sortMembres([...p.membres, { ...bap, aptitude:'Baptême', _bapteme:true }]) }
                  : p);
            });
          }}
        />
      )}
    </div>
  );
}

export { ScreenPalanquees };
