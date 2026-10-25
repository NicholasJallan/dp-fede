// DP Assistant — Plongeurs & palanquées.
//
// Les règles (validation, rôles proposés, plafond de profondeur, DP,
// mélanges) sont celles de la juridiction de la plongée : rulesFor(…) via
// useDiveRules (Code du sport ou Polynésie française). Ce fichier ne contient
// que l'état de l'écran, les dérivations vers `answers` et les mutations.

import React, { useState, useEffect, useMemo } from 'react';
import { Alert } from '../components/components.jsx';
import { DiverQuickAdd } from '../components/diver-quick-add.jsx';
import { Icon } from '../components/icons.jsx';
import {
  ageAt,
  CDS,
  clampProfMax,
  dtrForProf,
  getMaxEnsLevel,
  isBassinDerogation,
  minDtr,
  sortMembresForFiche,
  withDecoO2,
} from '../domain/index.js';
import { useDiveRules } from '../app/hooks/use-dive-rules.js';
import { api } from '../api/api.js';
import { useOnline } from '../offline/use-online.jsx';
import { diverFullName } from '../components/components.jsx';
import { pfDailyQuotaIssues } from '../domain/index.js';
import { PalCard } from './palanquees/pal-card.jsx';
import { DiverPool } from './palanquees/diver-pool.jsx';
import { BirthdateDialog } from './palanquees/birthdate-dialog.jsx';
import { useBirthdatePrompt } from './palanquees/use-birthdate-prompt.js';
import { clampPalMelanges } from '../app/dp-guards.js';

// Contexte d'aptitudes d'une palanquée : enseignant présent + mode (le bonus
// de formation n'existe qu'en enseignement).
function palContextOf(rules, pal, membres = pal.membres) {
  return { maxEnsLevel: getMaxEnsLevel(membres), mode: rules.palMode({ ...pal, membres }) };
}

// Plafond effectif : aptitude la plus restrictive ∩ gaz ∩ limite DP ∩ site.
function hardLimitFor(rules, pal, membres, dp, siteMax = Infinity) {
  return rules.palHardLimit({
    membres,
    dp,
    sessionMax: Infinity,
    siteMax,
    melanges: pal.melanges || ['Air'],
    mode: rules.palMode({ ...pal, membres }),
    derogation: !!pal.derogation_formation_60,
  });
}

const isEncadrantRole = (apt) => apt === 'GP' || /^E[1-4]$/.test(apt) || /^(ENS|GP)-/.test(apt || '');

// Polynésie : le DP justifie une fonction DP-40 à DP-120 (annexe I), ou est un
// enseignant en espace aquatique restreint (art. 7) ; contrôle fin par palanquée.
function dpCheckPf(answers, dpDiver, rules) {
  if (!answers.dp_id && !answers.dp_qual)
    return { tone: 'warn', text: 'Aucun directeur de plongée sélectionné (étape 1, section A).' };
  if (dpDiver && !rules.isDpCandidate(dpDiver))
    return {
      tone: 'err',
      text: "Ce plongeur n'a aucune fonction de directeur de plongée (DP-40 à DP-120, arrêté n° 199 CM, annexe I).",
    };
  return { tone: 'ok', text: 'Directeur de plongée désigné (Polynésie française, arrêté n° 199 CM).' };
}

const ageOn = (birthIso, whenIso) => ageAt(birthIso, whenIso ? new Date(whenIso) : new Date());

// DTR prévue suivant un éventuel changement de profondeur (prev → next).
function withDtrFor(prev, next) {
  if (next.profMax === prev.profMax) return next;
  return { ...next, dtr: dtrForProf(next.dtr, prev.profMax, next.profMax) };
}

const nextPalId = (pals) => 'p' + (Math.max(0, ...pals.map((p) => parseInt(p.id.slice(1), 10) || 0)) + 1);

// Validation du DP pour le lieu (III-15 a, A322-98) et le cadre (SCA : L212-1).
function dpCheck(dpQual, answers, dpDiver) {
  if (!dpQual) return { tone: 'warn', text: 'Aucun directeur de plongée sélectionné (étape 1, section A).' };
  const q = CDS.DP_QUALIF[dpQual];
  if (!q) return { tone: 'err', text: `${dpQual} ne peut pas être directeur de plongée.` };
  if (dpDiver?.dp_diplome_pro_requis)
    return {
      tone: 'err',
      text: `Structure commerciale (SCA) : le DP doit être titulaire d'un diplôme d'État (DP actuel ${dpQual}, sans diplôme pro ; L212-1).`,
    };
  const bassin = isBassinDerogation(answers, 0);
  if (bassin && !q.bassin)
    return { tone: 'err', text: 'Piscine ou fosse de 6 m au plus : DP enseignant E1 minimum (A322-98).' };
  if (!bassin && !q.naturel)
    return {
      tone: 'err',
      text: `DP ${dpQual} : piscine ou fosse de 6 m au plus uniquement. En milieu naturel, DP P5/DPE, E3 ou E4 (III-15 a).`,
    };
  return { tone: 'ok', text: `DP ${dpQual} valide pour ce lieu.` };
}

// Valeurs de `answers` dérivées des palanquées (ne pas re-questionner le DP).
function useDerivedAnswers({ palanquees, divers, diversById, answers, setAnswer, rules }) {
  useEffect(() => {
    if (!palanquees.length) {
      setAnswer('activite', 'Exploration');
      return;
    }
    const modes = new Set(palanquees.filter((p) => p.membres.length).map((p) => rules.palMode(p)));
    const hasEns = modes.has('enseignement'),
      hasExp = modes.has('exploration');
    setAnswer('activite', hasEns && hasExp ? 'Mixte' : hasEns ? 'Enseignement' : 'Exploration');
  }, [palanquees]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const hasMinor = palanquees.some((p) =>
      p.membres.some((m) => {
        if (m._bapteme) return false;
        const age = ageOn(diversById[m.diverId]?.date_naissance, answers.date);
        return age !== null && age < 18;
      }),
    );
    if (hasMinor && !answers.mineurs) setAnswer('mineurs', true);
  }, [palanquees, divers, answers.date]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!palanquees.length) {
      setAnswer('prof_max', null);
      return;
    }
    const maxDepth = Math.max(...palanquees.map((p) => p.profMax || 0));
    setAnswer('prof_max', maxDepth > 0 ? `${maxDepth} m` : null);
  }, [palanquees]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const all = new Set();
    palanquees.forEach((p) => (p.melanges || []).forEach((m) => all.add(m)));
    setAnswer('air', all.has('Air'));
    setAnswer('nitrox', all.has('Nx ≤ 40%') || all.has('Nx > 40%'));
    setAnswer('nitrox_sup_40', all.has('Nx > 40%'));
    setAnswer('trimix', all.has('Tx'));
  }, [palanquees]); // eslint-disable-line react-hooks/exhaustive-deps
}

function usePalanqueeMutations({ setPalanquees, diversById, dpDiver, siteMax, defaultMode, answers, rules }) {
  const derivePalNom = (index, membres) => {
    const enc = membres.find((m) => isEncadrantRole(m.aptitude));
    const prenom = enc && !enc._bapteme ? diversById[enc.diverId]?.prenom || null : null;
    return `Palanquée ${index + 1}${prenom ? ` ${prenom}` : ''}`;
  };
  // Toute mutation qui change la profondeur ajuste la DTR prévue (minimum 1 min / 10 m).
  const mapPal = (palId, fn) =>
    setPalanquees((prev) => prev.map((p, i) => (p.id === palId ? withDtrFor(p, fn(p, i)) : p)));
  const autoAptitude = (d, pal) => {
    const apts = d ? rules.rolesFor(d, palContextOf(rules, pal)) : [];
    return apts.length === 1 ? apts[0] : '';
  };
  const newPal = (id, index, membres, profMax) => ({
    id,
    nom: derivePalNom(index, membres),
    nomAuto: true,
    mode: defaultMode,
    membres,
    profMax,
    duree: 35,
    dtr: minDtr(profMax),
    melanges: ['Air'],
    no_deco: !answers.paliers,
    shot_line: !!answers.shot_line,
  });

  return {
    addToPal: (palId, diverId) =>
      mapPal(palId, (p, i) => {
        if (p.membres.find((m) => m.diverId === diverId)) return p;
        const membres = sortMembresForFiche([
          ...p.membres,
          { diverId, aptitude: autoAptitude(diversById[diverId], p) },
        ]);
        return {
          ...p,
          membres,
          nom: p.nomAuto ? derivePalNom(i, membres) : p.nom,
          profMax: clampProfMax(p.profMax, hardLimitFor(rules, p, membres, dpDiver, siteMax)),
        };
      }),
    removeFromPal: (palId, idOrIdx) =>
      mapPal(palId, (p, i) => {
        const membres = p.membres.filter((m) => (m._bapteme ? m.id !== idOrIdx : m.diverId !== idOrIdx));
        return { ...p, membres, nom: p.nomAuto ? derivePalNom(i, membres) : p.nom };
      }),
    setAptitude: (palId, diverId, aptitude) =>
      mapPal(palId, (p, i) => {
        let membres = p.membres.map((m) => (!m._bapteme && m.diverId === diverId ? { ...m, aptitude } : m));
        // Propage l'aptitude aux membres sans aptitude si elle leur est ouverte.
        const ctx = palContextOf(rules, p, membres);
        membres = sortMembresForFiche(
          membres.map((m) => {
            if (m.aptitude || m._bapteme || !diversById[m.diverId]) return m;
            return rules.rolesFor(diversById[m.diverId], ctx).includes(aptitude) ? { ...m, aptitude } : m;
          }),
        );
        return {
          ...p,
          membres,
          nom: p.nomAuto ? derivePalNom(i, membres) : p.nom,
          profMax: clampProfMax(p.profMax, hardLimitFor(rules, p, membres, dpDiver, siteMax)),
        };
      }),
    // Polynésie : encadrement rémunéré ou bénévole pour cette plongée (LP 5, LP 18).
    setRemunere: (palId, diverId, remunere) =>
      mapPal(palId, (p) => ({
        ...p,
        membres: p.membres.map((m) => (!m._bapteme && m.diverId === diverId ? { ...m, remunere } : m)),
      })),
    setField: (palId, field, value) =>
      mapPal(palId, (p) => ({ ...p, [field]: value, ...(field === 'nom' ? { nomAuto: false } : {}) })),
    toggleMelange: (palId, m) =>
      mapPal(palId, (p) => {
        const cur = p.melanges || [];
        return { ...p, melanges: cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m] };
      }),
    setProf: (palId, profMax) =>
      mapPal(palId, (p) => ({
        ...p,
        profMax: clampProfMax(profMax, hardLimitFor(rules, p, p.membres || [], dpDiver, siteMax)),
      })),
    toggleNoDeco: (palId) => mapPal(palId, (p) => ({ ...p, no_deco: !p.no_deco })),
    setMode: (palId, mode) =>
      mapPal(palId, (p) => {
        // Les aptitudes « bonus formation » ne valent pas en exploration : vidées.
        const next = { ...p, mode };
        const ctx = palContextOf(rules, next);
        const membres = p.membres.map((m) => {
          const d = !m._bapteme && diversById[m.diverId];
          return d && m.aptitude && !rules.rolesFor(d, ctx).includes(m.aptitude) ? { ...m, aptitude: '' } : m;
        });
        return { ...next, membres };
      }),
    addPal: () =>
      setPalanquees((prev) => {
        const limit = hardLimitFor(rules, { melanges: ['Air'], mode: defaultMode }, [], dpDiver, siteMax);
        return [...prev, newPal(nextPalId(prev), prev.length, [], Number.isFinite(limit) ? limit : 60)];
      }),
    addPalWithDiver: (diverId) =>
      setPalanquees((prev) => {
        const base = { melanges: ['Air'], mode: defaultMode, membres: [] };
        const membres = [{ diverId, aptitude: autoAptitude(diversById[diverId], base) }];
        const hardLimit = hardLimitFor(rules, base, membres, dpDiver, siteMax);
        return [...prev, newPal(nextPalId(prev), prev.length, membres, Number.isFinite(hardLimit) ? hardLimit : 60)];
      }),
    removePal: (palId) =>
      setPalanquees((prev) =>
        prev.filter((p) => p.id !== palId).map((p, i) => (p.nomAuto ? { ...p, nom: derivePalNom(i, p.membres) } : p)),
      ),
    addBapteme: (bap) =>
      setPalanquees((prev) => {
        const member = { ...bap, aptitude: 'Baptême', _bapteme: true };
        if (prev.length === 0) {
          return [
            {
              id: 'p1',
              nom: 'Palanquée 1',
              membres: [member],
              profMax: 6,
              duree: 20,
              dtr: minDtr(6),
              melanges: ['Air'],
              no_deco: true,
              shot_line: false,
            },
          ];
        }
        const last = prev.length - 1;
        return prev.map((p, i) =>
          i === last ? { ...p, no_deco: true, membres: sortMembresForFiche([...p.membres, member]) } : p,
        );
      }),
  };
}

// Re-bornages automatiques quand le DP ou le site changent.
function useAutoClamp({ setPalanquees, allowedMelangeValues, dpDiver, siteMax, rules }) {
  // DP introuvable : getAvailableMelanges(null) ne permettrait que l'air.
  useEffect(() => {
    setPalanquees((prev) => clampPalMelanges(prev, allowedMelangeValues, dpDiver));
  }, [allowedMelangeValues]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPalanquees((prev) =>
      prev.map((p) => {
        const hardLimit = hardLimitFor(rules, p, p.membres || [], dpDiver, siteMax);
        return !Number.isFinite(hardLimit) || p.profMax <= hardLimit ? p : withDtrFor(p, { ...p, profMax: hardLimit });
      }),
    );
  }, [dpDiver, siteMax, rules]); // eslint-disable-line react-hooks/exhaustive-deps

  // Palanquées saisies avec une version antérieure : DTR minimum proposée et
  // O₂ du gaz de déco sorti du champ « gaz fond ».
  useEffect(() => {
    const upgrade = (p) => {
      const next = withDecoO2(p);
      return next.dtr == null && next.profMax > 0 ? { ...next, dtr: minDtr(next.profMax) } : next;
    };
    setPalanquees((prev) => (prev.some((p) => upgrade(p) !== p) ? prev.map(upgrade) : prev));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

// Polynésie, art. 5 : autres plongées du club le même jour (en ligne seulement).
function useDayLoad(enabled, date, diveId) {
  const online = useOnline();
  const [state, setState] = useState({ entries: null, offline: false });
  const day = typeof date === 'string' ? date.slice(0, 10) : '';
  useEffect(() => {
    if (!enabled || !day) return undefined;
    if (!online) {
      setState({ entries: null, offline: true });
      return undefined;
    }
    let alive = true;
    api.dives
      .dayLoad(day, diveId)
      .then((r) => alive && setState({ entries: r?.entries || [], offline: false }))
      .catch(() => alive && setState({ entries: null, offline: true }));
    return () => {
      alive = false;
    };
  }, [enabled, day, diveId, online]);
  return state;
}

function ScreenPalanquees({ divers, setDivers, palanquees, setPalanquees, answers, setAnswer, diveId }) {
  const [showQuickDiver, setShowQuickDiver] = useState(false);
  const { rules, ruleAnswers, jurisdiction, lucratif } = useDiveRules(answers);
  const pf = jurisdiction === 'PF';
  const isExplorationOnly = !pf && answers.dp_qual === 'N5';
  const siteMax = answers.site_prof_max ? Number(answers.site_prof_max) : Infinity;

  const diversById = useMemo(() => Object.fromEntries(divers.map((d) => [d.id, d])), [divers]);
  const dpDiver = useMemo(() => divers.find((d) => d.id === answers.dp_id) || null, [divers, answers.dp_id]);
  const melangesCatalog = useMemo(() => rules.availableMelanges(dpDiver), [rules, dpDiver]);
  const allowedMelangeValues = useMemo(
    () => new Set(melangesCatalog.filter((m) => m.allowed).map((m) => m.value)),
    [melangesCatalog],
  );
  const assignedIds = useMemo(
    () => new Set(palanquees.flatMap((p) => p.membres.filter((m) => !m._bapteme).map((m) => m.diverId))),
    [palanquees],
  );
  const dpState = useMemo(
    () => (pf ? dpCheckPf(answers, dpDiver, rules) : dpCheck(answers.dp_qual || '', answers, dpDiver)),
    [pf, rules, answers, dpDiver],
  );

  useAutoClamp({ setPalanquees, allowedMelangeValues, dpDiver, siteMax, rules });
  useDerivedAnswers({ palanquees, divers, diversById, answers, setAnswer, rules });
  const mut = usePalanqueeMutations({
    setPalanquees,
    diversById,
    dpDiver,
    siteMax,
    answers,
    rules,
    defaultMode: isExplorationOnly ? 'exploration' : undefined,
  });
  const birthdate = useBirthdatePrompt({ diversById, setDivers });

  const dayLoad = useDayLoad(pf, answers.date, diveId);
  const quotaIssues = useMemo(
    () => (pf && dayLoad.entries ? pfDailyQuotaIssues({ id: diveId, palanquees }, dayLoad.entries) : []),
    [pf, dayLoad.entries, diveId, palanquees],
  );

  const blockedCount = palanquees.filter((p) =>
    rules.validatePal(p, diversById, ruleAnswers, dpDiver).some((i) => i.tone === 'err'),
  ).length;

  return (
    <div>
      <div className="page-head">
        <p className="step-tag">
          <span className="num">2</span>Plongeurs et palanquées
        </p>
        <h1>Constituer les palanquées</h1>
        <p>
          Ajoutez les plongeurs depuis l'annuaire. Chaque palanquée est vérifiée en direct selon{' '}
          {pf ? 'la réglementation de la Polynésie française (arrêté n° 199 CM)' : 'le Code du sport'}.
        </p>
      </div>

      <Alert tone={dpState.tone}>{dpState.text}</Alert>
      {pf && !lucratif && (answers.dp_id || answers.dp_qual) && (
        <label className="qualif-toggle">
          <input
            type="checkbox"
            checked={!!(answers.dp_remunere ?? dpDiver?.pf?.patente)}
            onChange={(e) => setAnswer('dp_remunere', e.target.checked)}
          />
          Directeur de plongée rémunéré pour cette plongée (diplôme homologué exigé, LP 18)
        </label>
      )}
      {isExplorationOnly && <Alert tone="info">DP N5 : exploration uniquement, pas d'enseignement.</Alert>}
      {blockedCount > 0 && (
        <Alert
          tone="err"
          title={`${blockedCount} palanquée${blockedCount > 1 ? 's' : ''} bloquée${blockedCount > 1 ? 's' : ''}`}
        >
          Les règles non respectées sont détaillées dans chaque palanquée encadrée en rouge.
        </Alert>
      )}
      {quotaIssues.length > 0 && (
        <Alert tone="warn" title="Quotas journaliers (arrêté n° 199 CM, art. 5)">
          <ul>
            {quotaIssues.map((q) => (
              <li key={`${q.code}-${q.ids[0]}`}>
                <b>{diversById[q.ids[0]] ? diverFullName(diversById[q.ids[0]]) : q.ids[0]}</b> : {q.text}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {pf && dayLoad.offline && <Alert tone="info">Quotas journaliers (art. 5) non vérifiés hors ligne.</Alert>}

      {/* Conteneur de requêtes : annuaire et palanquées côte à côte dès que la
          place le permet (tablette portrait, ou à côté de la synthèse). */}
      <div className="pal-layout">
        <div className="divers-grid">
          <DiverPool
            divers={divers}
            assignedIds={assignedIds}
            palanquees={palanquees}
            onAdd={(palId, diverId) => {
              mut.addToPal(palId, diverId);
              birthdate.promptIfMissing(diverId);
            }}
            onAddNew={(diverId) => {
              mut.addPalWithDiver(diverId);
              birthdate.promptIfMissing(diverId);
            }}
            onCreate={() => setShowQuickDiver(true)}
          />

          <div className="pal-list">
            {palanquees.length === 0 && (
              <div className="empty-state">
                <b>Aucune palanquée</b>
                <span>Ajoutez un plongeur depuis l'annuaire (« Nouvelle palanquée ») ou créez une palanquée vide.</span>
              </div>
            )}
            {palanquees.map((p, idx) => (
              <PalCard
                key={p.id}
                pal={p}
                index={idx}
                ctx={{
                  diversById,
                  issues: rules.validatePal(p, diversById, ruleAnswers, dpDiver),
                  palType: rules.palType(p.membres, pf ? rules.palMode(p) : p.mode),
                  palContext: palContextOf(rules, p),
                  hardLimit: hardLimitFor(rules, p, p.membres || [], dpDiver, siteMax),
                  rules,
                  jurisdiction,
                  lucratif,
                  melangesCatalog,
                  siteShotLine: !!answers.shot_line,
                  actions: {
                    setField: (f, v) => mut.setField(p.id, f, v),
                    setProf: (v) => mut.setProf(p.id, v),
                    setMode: (m) => mut.setMode(p.id, m),
                    toggleMelange: (m) => mut.toggleMelange(p.id, m),
                    toggleNoDeco: () => mut.toggleNoDeco(p.id),
                    setAptitude: (diverId, apt) => mut.setAptitude(p.id, diverId, apt),
                    setRemunere: (diverId, v) => mut.setRemunere(p.id, diverId, v),
                    removeMember: (id) => mut.removeFromPal(p.id, id),
                    remove: () => mut.removePal(p.id),
                    editBirthdate: birthdate.open,
                  },
                }}
              />
            ))}
            <button
              type="button"
              className="pal-add"
              onClick={mut.addPal}
              disabled={divers.length > 0 && divers.every((d) => assignedIds.has(d.id))}
            >
              <Icon.Plus />
              Ajouter une palanquée
            </button>
          </div>
        </div>
      </div>

      {showQuickDiver && (
        <DiverQuickAdd
          allowBapteme
          onClose={() => setShowQuickDiver(false)}
          onCreated={(d) => {
            setDivers((prev) => [...prev, d].sort((a, b) => a.nom.localeCompare(b.nom)));
            setShowQuickDiver(false);
          }}
          baptemeOnSave={mut.addBapteme}
        />
      )}
      {birthdate.diver && <BirthdateDialog diver={birthdate.diver} onSave={birthdate.save} onClose={birthdate.close} />}
    </div>
  );
}

export { ScreenPalanquees };
