// DP Assistant — Plongeurs & palanquées.
//
// La logique métier (validatePal, derivePalMode, getMaxEnsLevel) vit dans
// src/domain/pal-rules.js ; le plafond de profondeur dans
// src/domain/depth-clamp.js. Ce fichier ne contient que l'état de l'écran,
// les dérivations vers `answers` et les mutations des palanquées.

import React, { useState, useEffect, useMemo } from 'react';
import { Alert } from '../components/components.jsx';
import { DiverQuickAdd } from '../components/diver-form.jsx';
import { Icon } from '../components/icons.jsx';
import {
  aptitudeMaxDepth, CDS, clampProfMax, computePalHardLimit, derivePalMode, getAvailableMelanges,
  getDiverAptitudes, getDpMaxDepth, getMaxEnsLevel, getPalType, isBassinDerogation,
  sortMembresForFiche, validatePal,
} from '../domain/index.js';
import { PalCard } from './palanquees/pal-card.jsx';
import { DiverPool } from './palanquees/diver-pool.jsx';

// Contexte d'aptitudes d'une palanquée : enseignant présent + mode (le bonus
// de formation n'existe qu'en enseignement).
function palContextOf(pal, membres = pal.membres) {
  return { maxEnsLevel: getMaxEnsLevel(membres), mode: derivePalMode({ ...pal, membres }) };
}

// Plafond effectif : aptitude la plus restrictive ∩ gaz ∩ limite DP ∩ site.
function hardLimitFor(pal, membres, dp, siteMax = Infinity) {
  return computePalHardLimit({
    membres, dp, sessionMax: Infinity, siteMax,
    melanges: pal.melanges || ['Air'],
    mode: derivePalMode({ ...pal, membres }),
    aptitudeMaxDepth, getPalType, getDpMaxDepth,
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

const nextPalId = (pals) => 'p' + (Math.max(0, ...pals.map(p => parseInt(p.id.slice(1), 10) || 0)) + 1);

// Validation du DP pour le lieu (III-15 a, A322-98).
function dpCheck(dpQual, answers) {
  if (!dpQual) return { tone: 'warn', text: 'Aucun directeur de plongée sélectionné (étape 1, section A).' };
  const q = CDS.DP_QUALIF[dpQual];
  if (!q) return { tone: 'err', text: `${dpQual} ne peut pas être directeur de plongée.` };
  const bassin = isBassinDerogation(answers, 0);
  if (bassin && !q.bassin) return { tone: 'err', text: 'Piscine ou fosse de 6 m au plus : DP enseignant E1 minimum (A322-98).' };
  if (!bassin && !q.naturel) return { tone: 'err', text: `DP ${dpQual} : piscine ou fosse de 6 m au plus uniquement. En milieu naturel, DP P5/DPE, E3 ou E4 (III-15 a).` };
  return { tone: 'ok', text: `DP ${dpQual} valide pour ce lieu.` };
}

// Valeurs de `answers` dérivées des palanquées (ne pas re-questionner le DP).
function useDerivedAnswers({ palanquees, divers, diversById, answers, setAnswer }) {
  useEffect(() => {
    if (!palanquees.length) { setAnswer('activite', 'Exploration'); return; }
    const modes = new Set(palanquees.filter(p => p.membres.length).map(p => derivePalMode(p)));
    const hasEns = modes.has('enseignement'), hasExp = modes.has('exploration');
    setAnswer('activite', (hasEns && hasExp) ? 'Mixte' : hasEns ? 'Enseignement' : 'Exploration');
  }, [palanquees]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const hasMinor = palanquees.some(p => p.membres.some(m => {
      if (m._bapteme) return false;
      const age = ageAt(diversById[m.diverId]?.date_naissance, answers.date);
      return age !== null && age < 18;
    }));
    if (hasMinor && !answers.mineurs) setAnswer('mineurs', true);
  }, [palanquees, divers, answers.date]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!palanquees.length) { setAnswer('prof_max', null); return; }
    const maxDepth = Math.max(...palanquees.map(p => p.profMax || 0));
    setAnswer('prof_max', maxDepth > 0 ? `${maxDepth} m` : null);
  }, [palanquees]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const all = new Set();
    palanquees.forEach(p => (p.melanges || []).forEach(m => all.add(m)));
    setAnswer('air', all.has('Air'));
    setAnswer('nitrox', all.has('Nx ≤ 40%') || all.has('Nx > 40%'));
    setAnswer('nitrox_sup_40', all.has('Nx > 40%'));
    setAnswer('trimix', all.has('Tx'));
  }, [palanquees]); // eslint-disable-line react-hooks/exhaustive-deps
}

function usePalanqueeMutations({ setPalanquees, diversById, dpDiver, siteMax, defaultMode, answers }) {
  const derivePalNom = (index, membres) => {
    const enc = membres.find(m => m.aptitude === 'GP' || ['E1', 'E2', 'E3', 'E4'].includes(m.aptitude));
    const prenom = enc && !enc._bapteme ? (diversById[enc.diverId]?.prenom || null) : null;
    return `Palanquée ${index + 1}${prenom ? ` ${prenom}` : ''}`;
  };
  const mapPal = (palId, fn) => setPalanquees(prev => prev.map((p, i) => (p.id === palId ? fn(p, i) : p)));
  const autoAptitude = (d, pal) => {
    const apts = d ? getDiverAptitudes(d, false, palContextOf(pal)) : [];
    return apts.length === 1 ? apts[0] : '';
  };
  const newPal = (id, index, membres, profMax) => ({
    id, nom: derivePalNom(index, membres), nomAuto: true, mode: defaultMode,
    membres, profMax, duree: 35, dtr: null, melanges: ['Air'],
    no_deco: !answers.paliers, shot_line: !!answers.shot_line,
  });

  return {
    addToPal: (palId, diverId) => mapPal(palId, (p, i) => {
      if (p.membres.find(m => m.diverId === diverId)) return p;
      const membres = sortMembresForFiche([...p.membres, { diverId, aptitude: autoAptitude(diversById[diverId], p) }]);
      return { ...p, membres, nom: p.nomAuto ? derivePalNom(i, membres) : p.nom,
        profMax: clampProfMax(p.profMax, hardLimitFor(p, membres, dpDiver, siteMax)) };
    }),
    removeFromPal: (palId, idOrIdx) => mapPal(palId, (p, i) => {
      const membres = p.membres.filter(m => (m._bapteme ? m.id !== idOrIdx : m.diverId !== idOrIdx));
      return { ...p, membres, nom: p.nomAuto ? derivePalNom(i, membres) : p.nom };
    }),
    setAptitude: (palId, diverId, aptitude) => mapPal(palId, (p, i) => {
      let membres = p.membres.map(m => (!m._bapteme && m.diverId === diverId ? { ...m, aptitude } : m));
      // Propage l'aptitude aux membres sans aptitude si elle leur est ouverte.
      const ctx = palContextOf(p, membres);
      membres = sortMembresForFiche(membres.map(m => {
        if (m.aptitude || m._bapteme || !diversById[m.diverId]) return m;
        return getDiverAptitudes(diversById[m.diverId], false, ctx).includes(aptitude) ? { ...m, aptitude } : m;
      }));
      return { ...p, membres, nom: p.nomAuto ? derivePalNom(i, membres) : p.nom,
        profMax: clampProfMax(p.profMax, hardLimitFor(p, membres, dpDiver, siteMax)) };
    }),
    setField: (palId, field, value) => mapPal(palId, p => ({ ...p, [field]: value, ...(field === 'nom' ? { nomAuto: false } : {}) })),
    toggleMelange: (palId, m) => mapPal(palId, p => {
      const cur = p.melanges || [];
      return { ...p, melanges: cur.includes(m) ? cur.filter(x => x !== m) : [...cur, m] };
    }),
    setProf: (palId, profMax) => mapPal(palId, p => ({ ...p, profMax: clampProfMax(profMax, hardLimitFor(p, p.membres || [], dpDiver, siteMax)) })),
    toggleNoDeco: (palId) => mapPal(palId, p => ({ ...p, no_deco: !p.no_deco })),
    setMode: (palId, mode) => mapPal(palId, p => {
      // Les aptitudes « bonus formation » ne valent pas en exploration : vidées.
      const next = { ...p, mode };
      const ctx = palContextOf(next);
      const membres = p.membres.map(m => {
        const d = !m._bapteme && diversById[m.diverId];
        return d && m.aptitude && !getDiverAptitudes(d, false, ctx).includes(m.aptitude) ? { ...m, aptitude: '' } : m;
      });
      return { ...next, membres };
    }),
    addPal: () => setPalanquees(prev => {
      const dpLimit = getDpMaxDepth('exploration', dpDiver) || Infinity;
      return [...prev, newPal(nextPalId(prev), prev.length, [], Math.min(60, siteMax, dpLimit))];
    }),
    addPalWithDiver: (diverId) => setPalanquees(prev => {
      const base = { melanges: ['Air'], mode: defaultMode, membres: [] };
      const membres = [{ diverId, aptitude: autoAptitude(diversById[diverId], base) }];
      const hardLimit = hardLimitFor(base, membres, dpDiver, siteMax);
      return [...prev, newPal(nextPalId(prev), prev.length, membres, Number.isFinite(hardLimit) ? hardLimit : 60)];
    }),
    removePal: (palId) => setPalanquees(prev => prev.filter(p => p.id !== palId)
      .map((p, i) => (p.nomAuto ? { ...p, nom: derivePalNom(i, p.membres) } : p))),
    addBapteme: (bap) => setPalanquees(prev => {
      const member = { ...bap, aptitude: 'Baptême', _bapteme: true };
      if (prev.length === 0) {
        return [{ id: 'p1', nom: 'Palanquée 1', membres: [member], profMax: 6, duree: 20, dtr: null,
          melanges: ['Air'], no_deco: true, shot_line: false }];
      }
      const last = prev.length - 1;
      return prev.map((p, i) => (i === last ? { ...p, no_deco: true, membres: sortMembresForFiche([...p.membres, member]) } : p));
    }),
  };
}

// Re-bornages automatiques quand le DP ou le site changent.
function useAutoClamp({ setPalanquees, allowedMelangeValues, dpDiver, siteMax }) {
  useEffect(() => {
    setPalanquees(prev => prev.map(p => {
      const cur = p.melanges || [];
      const next = cur.filter(m => allowedMelangeValues.has(m));
      if (next.length === cur.length) return p;
      return { ...p, melanges: next.length > 0 ? next : ['Air'] };
    }));
  }, [allowedMelangeValues]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPalanquees(prev => prev.map(p => {
      const hardLimit = hardLimitFor(p, p.membres || [], dpDiver, siteMax);
      return (!Number.isFinite(hardLimit) || p.profMax <= hardLimit) ? p : { ...p, profMax: hardLimit };
    }));
  }, [dpDiver, siteMax]); // eslint-disable-line react-hooks/exhaustive-deps
}

function ScreenPalanquees({ divers, setDivers, palanquees, setPalanquees, answers, setAnswer }) {
  const [showQuickDiver, setShowQuickDiver] = useState(false);
  const isExplorationOnly = answers.dp_qual === 'N5';
  const siteMax = answers.site_prof_max ? Number(answers.site_prof_max) : Infinity;

  const diversById = useMemo(() => Object.fromEntries(divers.map(d => [d.id, d])), [divers]);
  const dpDiver = useMemo(() => divers.find(d => d.id === answers.dp_id) || null, [divers, answers.dp_id]);
  const melangesCatalog = useMemo(() => getAvailableMelanges(dpDiver), [dpDiver]);
  const allowedMelangeValues = useMemo(
    () => new Set(melangesCatalog.filter(m => m.allowed).map(m => m.value)), [melangesCatalog]);
  const assignedIds = useMemo(() => new Set(palanquees.flatMap(p => p.membres.filter(m => !m._bapteme).map(m => m.diverId))), [palanquees]);
  const dpState = useMemo(() => dpCheck(answers.dp_qual || '', answers), [answers]);

  useAutoClamp({ setPalanquees, allowedMelangeValues, dpDiver, siteMax });
  useDerivedAnswers({ palanquees, divers, diversById, answers, setAnswer });
  const mut = usePalanqueeMutations({
    setPalanquees, diversById, dpDiver, siteMax, answers,
    defaultMode: isExplorationOnly ? 'exploration' : undefined,
  });

  const blockedCount = palanquees.filter(p => validatePal(p, diversById, answers, dpDiver).some(i => i.tone === 'err')).length;

  return (
    <div>
      <div className="page-head">
        <p className="step-tag"><span className="num">2</span>Plongeurs et palanquées</p>
        <h1>Constituer les palanquées</h1>
        <p>Ajoutez les plongeurs depuis l'annuaire. Chaque palanquée est vérifiée en direct selon le Code du sport.</p>
      </div>

      <Alert tone={dpState.tone}>{dpState.text}</Alert>
      {isExplorationOnly && <Alert tone="info">DP N5 : exploration uniquement, pas d'enseignement.</Alert>}
      {blockedCount > 0 && (
        <Alert tone="err" title={`${blockedCount} palanquée${blockedCount > 1 ? 's' : ''} bloquée${blockedCount > 1 ? 's' : ''}`}>
          Les règles non respectées sont détaillées dans chaque palanquée encadrée en rouge.
        </Alert>
      )}

      {/* Conteneur de requêtes : annuaire et palanquées côte à côte dès que la
          place le permet (tablette portrait, ou à côté de la synthèse). */}
      <div className="pal-layout">
      <div className="divers-grid">
        <DiverPool divers={divers} assignedIds={assignedIds} palanquees={palanquees}
          onAdd={mut.addToPal} onAddNew={mut.addPalWithDiver} onCreate={() => setShowQuickDiver(true)} />

        <div className="pal-list">
          {palanquees.length === 0 && (
            <div className="empty-state">
              <b>Aucune palanquée</b>
              <span>Ajoutez un plongeur depuis l'annuaire (« Nouvelle palanquée ») ou créez une palanquée vide.</span>
            </div>
          )}
          {palanquees.map((p, idx) => (
            <PalCard key={p.id} pal={p} index={idx} ctx={{
              diversById,
              issues: validatePal(p, diversById, answers, dpDiver),
              palType: getPalType(p.membres, p.mode),
              palContext: palContextOf(p),
              hardLimit: hardLimitFor(p, p.membres || [], dpDiver, siteMax),
              melangesCatalog,
              siteShotLine: !!answers.shot_line,
              actions: {
                setField: (f, v) => mut.setField(p.id, f, v),
                setProf: (v) => mut.setProf(p.id, v),
                setMode: (m) => mut.setMode(p.id, m),
                toggleMelange: (m) => mut.toggleMelange(p.id, m),
                toggleNoDeco: () => mut.toggleNoDeco(p.id),
                setAptitude: (diverId, apt) => mut.setAptitude(p.id, diverId, apt),
                removeMember: (id) => mut.removeFromPal(p.id, id),
                remove: () => mut.removePal(p.id),
              },
            }} />
          ))}
          <button type="button" className="pal-add" onClick={mut.addPal}
            disabled={divers.length > 0 && divers.every(d => assignedIds.has(d.id))}>
            <Icon.Plus />Ajouter une palanquée
          </button>
        </div>
      </div>
      </div>

      {showQuickDiver && (
        <DiverQuickAdd
          allowBapteme
          onClose={() => setShowQuickDiver(false)}
          onCreated={d => {
            setDivers(prev => [...prev, d].sort((a, b) => a.nom.localeCompare(b.nom)));
            setShowQuickDiver(false);
          }}
          baptemeOnSave={mut.addBapteme}
        />
      )}
    </div>
  );
}

export { ScreenPalanquees };
