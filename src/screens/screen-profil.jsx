// DP Assistant — Profilage de la plongée (v2)

import React, { useState, useEffect, useEffectEvent, useMemo } from 'react';
import { useAuth } from '../auth/auth-context.jsx';
import { Alert, Field, Opt, Question, Pill, CdsLink, diverFullName } from '../components/components.jsx';
import {
  diplomeProLabel,
  matchCondition,
  QUESTIONS,
  resolveUrgenceNumber,
  STRUCTURE_LABELS,
  URGENCE_PAR_PAYS,
} from '../domain/index.js';
import { dpAnswerFields } from '../app/dp-guards.js';

import { DPPicker, SitePicker } from './profil/pickers.jsx';
import { MeteoField, MareeField } from './profil/conditions-fields.jsx';

// ── ScreenProfil ──────────────────────────────────────────────────────────
function ScreenProfil({ answers, setAnswer, derived, divers, setDivers, sites, setSites }) {
  const { user } = useAuth();
  const sections = QUESTIONS;
  const [activeId, setActiveId] = useState(sections[0].id);

  const visibleSections = sections.filter((s) => !s.when || s.when(answers));

  // DP sélectionné
  const selectedDP = useMemo(() => divers.find((d) => d.id === answers.dp_id), [divers, answers.dp_id]);
  const dpQual = selectedDP?.niveau_encadrant || null;
  const dpN5 = dpQual === 'N5';

  // Site sélectionné
  const selectedSite = useMemo(() => sites.find((s) => s.id === answers.site_id), [sites, answers.site_id]);

  // Les propagations ci-dessous ne se déclenchent que sur leur clé (DP, site,
  // pays…) : un rechargement de l'annuaire ne doit pas réécrire la saisie.
  // useEffectEvent lit les valeurs courantes sans en faire des dépendances.

  // Quand DP change → propager dp_qual
  // DP introuvable (annuaire pas encore chargé, DP supprimé) : rien n'est effacé.
  const propagateDp = useEffectEvent(() => {
    const fields = dpAnswerFields(answers.dp_id, selectedDP);
    if (!fields) return;
    setAnswer('dp_qual', fields.dp_qual);
    setAnswer('dp_nom', fields.dp_nom);
  });
  useEffect(() => {
    propagateDp();
  }, [answers.dp_id]);

  // Quand site change → propager milieu + depart_bord/bateau + shot_line par défaut + détection Atlantique
  const propagateSite = useEffectEvent(() => {
    if (selectedSite) {
      setAnswer('milieu', selectedSite.milieu);
      setAnswer('depart_bord', selectedSite.depart_bord);
      setAnswer('depart_bateau', selectedSite.depart_bateau);
      setAnswer('site_nom', selectedSite.nom);
      setAnswer('site_ville', selectedSite.ville || '');
      setAnswer('site_pays', selectedSite.pays || '');
      setAnswer('site_pays_code', selectedSite.pays_code || '');
      setAnswer('site_prof_max', selectedSite.profondeur_max || null);
      // Plan de secours : champs site réutilisés dans le bloc « conduite à tenir » de la fiche
      setAnswer('site_acces_secours', selectedSite.acces_secours || '');
      setAnswer('site_caisson', selectedSite.caisson || '');
      setAnswer('site_coords', selectedSite.coordonnees || null);
      // Pré-cocher shot_line si dispo sur le site (toujours modifiable)
      if (selectedSite.shot_line && answers.shot_line === undefined) {
        setAnswer('shot_line', true);
      }
      // Atlantique / Manche / Mer du Nord : longitude < 7°E (suffisant pour France)
      const lng = selectedSite.coordonnees?.lng;
      const isAtlantique = typeof lng === 'number' && lng < 7;
      setAnswer('site_atlantique', isAtlantique);
    }
  });
  useEffect(() => {
    propagateSite();
  }, [answers.site_id]);

  // Date/heure initialisée à la prochaine heure pleine
  const initDate = useEffectEvent(() => {
    if (!answers.date) {
      const d = new Date();
      d.setMinutes(0, 0, 0);
      d.setHours(d.getHours() + 1);
      // Format ISO local pour input datetime-local : YYYY-MM-DDTHH:MM
      const pad = (n) => String(n).padStart(2, '0');
      const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      setAnswer('date', iso);
    }
  });
  useEffect(() => {
    initDate();
  }, []);

  // Numéro d'urgence : suit le pays du site (y compris après un changement de
  // site) tant que le DP ne l'a pas saisi lui-même (urgence_manuel).
  const defaultUrgence = useEffectEvent(() => {
    const next = resolveUrgenceNumber({
      paysCode: selectedSite?.pays_code,
      clubDefault: user?.urgence_defaut,
      current: answers.urgence_num,
      manual: answers.urgence_manuel,
    });
    if (next !== answers.urgence_num) setAnswer('urgence_num', next);
  });
  useEffect(() => {
    defaultUrgence();
  }, [selectedSite?.pays_code, user?.urgence_defaut]);

  // Scroll-spy (lit toujours les sections visibles courantes)
  const onScroll = useEffectEvent(() => {
    let current = visibleSections[0]?.id;
    for (const s of visibleSections) {
      const el = document.getElementById('sect-' + s.id);
      if (!el) continue;
      if (el.getBoundingClientRect().top < 160) current = s.id;
    }
    setActiveId(current);
  });
  useEffect(() => {
    const handler = () => onScroll();
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const scrollTo = (id) => {
    const el = document.getElementById('sect-' + id);
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - 120,
      behavior: reduce ? 'auto' : 'smooth',
    });
  };

  // Forcer paliers obligatoires si prof ≥ 60m
  const forcePaliers = useEffectEvent(() => {
    const prof = parseInt(String(answers.prof_max || '').replace(/\D/g, ''), 10);
    if (prof >= 60 && !answers.paliers) setAnswer('paliers', true);
  });
  useEffect(() => {
    forcePaliers();
  }, [answers.prof_max]);

  // Structure type display
  const structureLabel = user?.structure_type ? STRUCTURE_LABELS[user.structure_type] || user.structure_type : null;

  const renderQuestion = (q) => {
    if (!matchCondition(q.when, answers)) return null;
    const val = answers[q.id];
    const set = (v) => setAnswer(q.id, v);

    // Types spéciaux
    if (q.id === 'dp_id') {
      return (
        <Field key={q.id} label={q.label} hint={q.hint} regRef={q.ref} required={q.required}>
          {({ id }) => (
            <>
              <DPPicker id={id} value={val} divers={divers} setDivers={setDivers} onChange={set} />
              {selectedDP && (
                <div className="info-box">
                  <div className="row tight">
                    <b>{diverFullName(selectedDP)}</b>
                    <Pill tone="ink">{dpQual}</Pill>
                    {selectedDP.diplome_pro && <Pill>{diplomeProLabel(selectedDP.diplome_pro)}</Pill>}
                  </div>
                  {selectedDP.niveau_encadrant_annuaire !== undefined && (
                    <span>
                      Niveau retenu ({structureLabel || 'cette structure'}) : {dpQual}, d'après le diplôme professionnel
                      ; niveau encadrant à l'annuaire : {selectedDP.niveau_encadrant_annuaire || 'aucun'}.
                    </span>
                  )}
                  {dpN5 && <span>N5 : exploration uniquement, pas d'aptitude E1 à E4 en palanquée.</span>}
                  {selectedDP.dp_diplome_pro_requis && (
                    <Alert tone="err">
                      Structure commerciale (SCA) : le DP doit être titulaire d'un diplôme d'État reconnu (DEJEPS,
                      DESJEPS, BEES ; BPJEPS en piscine ou fosse ≤ 6 m). Choisir un autre DP ou compléter sa fiche.
                    </Alert>
                  )}
                </div>
              )}
            </>
          )}
        </Field>
      );
    }

    if (q.id === 'structure') {
      return (
        <Field key={q.id} label={q.label} hint={q.hint} group>
          <p className={structureLabel ? '' : 'muted'}>
            {structureLabel || 'Non renseignée : à compléter dans Mon compte.'}
            {user?.club_nom ? (
              <>
                , <b>{user.club_nom}</b>
              </>
            ) : null}
          </p>
        </Field>
      );
    }

    if (q.id === 'site_id') {
      return (
        <Field key={q.id} label={q.label} hint={q.hint} required={q.required}>
          {({ id }) => (
            <SitePicker id={id} value={val} sites={sites} setSites={setSites} onChange={set} answers={answers} />
          )}
        </Field>
      );
    }

    if (q.id === 'urgence_num') {
      const paysCode = selectedSite?.pays_code;
      const auto = resolveUrgenceNumber({ paysCode, clubDefault: user?.urgence_defaut });
      const manual = answers.urgence_manuel === true;
      return (
        <Field
          key={q.id}
          label={q.label}
          hint={manual ? 'Saisi par le DP : ne suit plus le pays du site.' : q.hint}
          regRef={q.ref}
        >
          {({ id, hintId }) => (
            <>
              <input
                id={id}
                className="input"
                type="tel"
                inputMode="tel"
                aria-describedby={hintId}
                value={val || ''}
                onChange={(e) => {
                  setAnswer('urgence_manuel', true);
                  set(e.target.value);
                }}
              />
              {manual && auto !== val && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setAnswer('urgence_manuel', false);
                    setAnswer('urgence_num', auto);
                  }}
                >
                  Revenir au {auto}
                  {URGENCE_PAR_PAYS[paysCode] ? ` (${paysCode})` : ''}
                </button>
              )}
            </>
          )}
        </Field>
      );
    }

    if (q.id === 'meteo') {
      return (
        <Field key={q.id} label={q.label} hint={q.hint}>
          {({ id }) => <MeteoField id={id} value={val} onChange={set} site={selectedSite} date={answers.date} />}
        </Field>
      );
    }

    if (q.id === 'maree_horaire') {
      return (
        <Field key={q.id} label={q.label} hint={q.hint} regRef={q.ref}>
          {({ id }) => <MareeField id={id} value={val} onChange={set} site={selectedSite} date={answers.date} />}
        </Field>
      );
    }

    if (q.id === 'trimix_secu_note') {
      return (
        <Alert key={q.id} tone="info">
          Trimix : la sécurité surface continue est obligatoire pendant toute la durée de la plongée{' '}
          <CdsLink art="A322-91" />.
        </Alert>
      );
    }

    if (q.type === 'divers-multi') {
      const current = Array.isArray(val) ? val : [];
      const toggle = (id) => {
        const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
        set(next);
      };
      return (
        <Field key={q.id} label={q.label} hint={q.hint} regRef={q.ref} group>
          <div className="opt-group col-3">
            {divers.map((d) => (
              <Opt
                key={d.id}
                label={diverFullName(d)}
                multi
                checked={current.includes(d.id)}
                onClick={() => toggle(d.id)}
              />
            ))}
            {divers.length === 0 && <span className="muted">Aucun plongeur dans l'annuaire.</span>}
          </div>
        </Field>
      );
    }

    return <Question key={q.id} q={q} value={val} onChange={(_, v) => set(v)} />;
  };

  return (
    <div>
      <div className="page-head">
        <p className="step-tag">
          <span className="num">1</span>Profil de la plongée
        </p>
        <h1>Caractériser la plongée à venir</h1>
        <p>Les réponses pilotent les questions suivantes, la check-list et les règles appliquées aux palanquées.</p>
      </div>

      <nav className="subnav" aria-label="Sections du profil">
        {visibleSections.map((s) => (
          <a
            key={s.id}
            href={`#sect-${s.id}`}
            aria-current={activeId === s.id ? 'true' : undefined}
            onClick={(e) => {
              e.preventDefault();
              scrollTo(s.id);
            }}
          >
            <span className="num">{s.id}</span>
            {s.title}
          </a>
        ))}
      </nav>

      {visibleSections.map((s) => (
        <section className="card profil-section" key={s.id} id={`sect-${s.id}`} aria-labelledby={`sect-${s.id}-t`}>
          <div className="card-head">
            <span className="ix">{s.id}</span>
            <h2 id={`sect-${s.id}-t`}>{s.title}</h2>
          </div>
          <div className="card-body dense">{s.questions.map((q) => renderQuestion(q))}</div>
        </section>
      ))}

      {derived.notes.length > 0 && (
        <div className="mt-4">
          {derived.notes.map((n, i) => (
            <Alert key={i} tone={n.tone}>
              {n.text}
            </Alert>
          ))}
        </div>
      )}

      <p className="disclaimer">
        Outil d'aide à la décision : il ne se substitue pas à la responsabilité du directeur de plongée.
      </p>
    </div>
  );
}

export { ScreenProfil };
