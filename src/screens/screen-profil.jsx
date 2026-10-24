// DP Assistant — Profilage de la plongée (v2)

import React, { useState, useEffect, useEffectEvent, useMemo } from 'react';
import { useAuth } from '../auth/auth-context.jsx';
import {
  Alert,
  Field,
  Opt,
  Question,
  Pill,
  CdsLink,
  diverFullName,
  formatDateTime,
} from '../components/components.jsx';
import { Icon, StatusIcon } from '../components/icons.jsx';
import { DiverQuickAdd } from '../components/diver-form.jsx';
import { SiteFormModal } from './screen-admin-sites.jsx';
import { diplomeProLabel, getMilieuType, matchCondition, QUESTIONS, STRUCTURE_LABELS } from '../domain/index.js';
import { api } from '../api/api.js';

// ── DPPicker ──────────────────────────────────────────────────────────────
function DPPicker({ id, value, divers, onChange, setDivers }) {
  const [showAdd, setShowAdd] = useState(false);

  const candidates = useMemo(
    () =>
      divers.filter((d) => {
        const ne = d.niveau_encadrant;
        return ne && ['E1', 'E2', 'E3', 'E4', 'N5'].includes(ne);
      }),
    [divers],
  );

  const onCreated = (newDiver) => {
    setDivers((prev) => [...prev, newDiver].sort((a, b) => a.nom.localeCompare(b.nom)));
    if (newDiver.niveau_encadrant && ['E1', 'E2', 'E3', 'E4', 'N5'].includes(newDiver.niveau_encadrant)) {
      onChange(newDiver.id);
    }
    setShowAdd(false);
  };

  return (
    <div>
      <div className="picker-row">
        <select id={id} className="input" value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choisir le directeur de plongée</option>
          {candidates.map((d) => (
            <option key={d.id} value={d.id} disabled={d.dp_diplome_pro_requis && d.id !== value}>
              {diverFullName(d)} ({d.niveau_encadrant}){d.diplome_pro ? ` — ${diplomeProLabel(d.diplome_pro)}` : ''}
              {d.dp_diplome_pro_requis ? ' — diplôme pro requis (SCA)' : ''}
            </option>
          ))}
        </select>
        {setDivers && (
          <button
            type="button"
            className="btn icon"
            onClick={() => setShowAdd(true)}
            aria-label="Créer un plongeur"
            title="Créer un plongeur"
          >
            <Icon.Plus />
          </button>
        )}
      </div>
      {candidates.length === 0 && (
        <p className="field-hint warn">
          Aucun plongeur de l'annuaire ne peut être DP. Ajoutez un plongeur de niveau encadrant E1 à E4 ou N5.
        </p>
      )}

      {showAdd && <DiverQuickAdd onCreated={onCreated} onClose={() => setShowAdd(false)} />}
    </div>
  );
}

// ── SitePicker + quick-add ────────────────────────────────────────────────
function SitePicker({ id, value, sites, setSites, onChange, answers }) {
  const [showAdd, setShowAdd] = useState(false);

  // Filtrage selon qualité DP : E1 → piscine ≤6m, E2 → piscine/fosse ≤20m
  const dpQual = answers?.dp_qual || null;
  const filteredSites = useMemo(() => {
    return sites.filter((s) => {
      const milieu = getMilieuType(s.milieu);
      const profMax = s.profondeur_max || 999;
      if (dpQual === 'E1') return milieu === 'piscine' && profMax <= 6;
      if (dpQual === 'E2') return (milieu === 'piscine' || milieu === 'fosse') && profMax <= 20;
      return true; // E3, E4, N5 : tous milieux
    });
  }, [sites, dpQual]);

  const selected = sites.find((s) => s.id === value);

  return (
    <div>
      <div className="picker-row">
        <select id={id} className="input" value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choisir un site</option>
          {filteredSites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
              {s.ville ? `, ${s.ville}` : ''}
              {s.pays_code ? ` (${s.pays_code})` : ''}, {s.milieu}
              {s.profondeur_max ? `, ${s.profondeur_max} m` : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn icon"
          onClick={() => setShowAdd(true)}
          aria-label="Créer un site"
          title="Créer un site"
        >
          <Icon.Plus />
        </button>
      </div>
      {dpQual === 'E1' && filteredSites.length < sites.length && (
        <p className="field-hint warn">
          Un E1 ne dirige qu'en piscine (6 m au plus) : {sites.length - filteredSites.length} site(s) masqué(s).
        </p>
      )}
      {dpQual === 'E2' && filteredSites.length < sites.length && (
        <p className="field-hint warn">
          Un E2 ne dirige qu'en piscine ou fosse (20 m au plus) : {sites.length - filteredSites.length} site(s)
          masqué(s).
        </p>
      )}

      {selected && (
        <div className="info-box">
          <div>
            <b>{selected.nom}</b>, {selected.milieu}
            {selected.profondeur_max ? (
              <>
                , <span className="num">{selected.profondeur_max} m</span> au plus
              </>
            ) : (
              ''
            )}
          </div>
          <div className="row tight">
            {selected.depart_bord && <Pill>Départ du bord</Pill>}
            {selected.depart_bateau && <Pill>Départ en bateau</Pill>}
          </div>
          {selected.notes && <div className="muted">{selected.notes}</div>}
          {selected.coordonnees?.lat && (
            <div className="coords">
              {Number(selected.coordonnees.lat).toFixed(5)}, {Number(selected.coordonnees.lng).toFixed(5)}
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <SiteFormModal
          title="Nouveau site"
          onSave={async (payload) => {
            const s = await api.sites.create(payload);
            setSites((prev) => [...prev, s].sort((a, b) => a.nom.localeCompare(b.nom)));
            onChange(s.id);
          }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

// ── MeteoField ────────────────────────────────────────────────────────────
// Open-meteo : prévisions horaires sur 16 jours, créneau le plus proche de
// l'heure planifiée. En cas d'échec : message dans l'interface, le champ
// n'est jamais modifié.
async function fetchMeteoText(lat, lng, date) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    '&hourly=temperature_2m,windspeed_10m,windgusts_10m,weathercode,visibility&forecast_days=16&timezone=auto';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`le service météo a répondu ${res.status}`);
  const data = await res.json().catch(() => null);
  if (!data || data.error) throw new Error(data?.reason || 'réponse du service météo illisible');
  const times = data.hourly?.time || [];
  if (!times.length) throw new Error('aucune prévision disponible pour ce lieu');

  let target = date ? new Date(date) : new Date();
  if (isNaN(target.getTime())) target = new Date();
  let best = 0,
    bestDiff = Infinity;
  times.forEach((t, k) => {
    const diff = Math.abs(new Date(t).getTime() - target.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      best = k;
    }
  });
  const h = data.hourly;
  const fmt = (v, digits = 0) => (v != null ? v.toFixed(digits) : '?');
  const offsetH = Math.round(bestDiff / 3_600_000);
  const offset = offsetH > 24 ? `, prévision décalée de ${offsetH} h` : '';
  return (
    `Météo (open-meteo, ${formatDateTime(h.time[best])}${offset}) : ${meteoCode(h.weathercode?.[best])}, ` +
    `vent ${fmt(h.windspeed_10m?.[best])} km/h (rafales ${fmt(h.windgusts_10m?.[best])} km/h), ` +
    `${fmt(h.temperature_2m?.[best], 1)} °C, visibilité ${h.visibility?.[best] != null ? (h.visibility[best] / 1000).toFixed(1) : '?'} km`
  );
}

function MeteoField({ id, value, onChange, site, date }) {
  const [fetching, setFetching] = useState(false);
  const [err, setErr] = useState('');
  const lat = parseFloat(site?.coordonnees?.lat);
  const lng = parseFloat(site?.coordonnees?.lng);
  const hasCoords = isFinite(lat) && isFinite(lng);

  const fetchMeteo = async () => {
    setFetching(true);
    setErr('');
    try {
      const text = await fetchMeteoText(lat, lng, date);
      onChange((value ? `${value}\n` : '') + text);
    } catch (e) {
      console.warn('[DP] météo indisponible :', e?.message || e);
      setErr(navigator.onLine === false ? 'pas de réseau' : e?.message || 'erreur inconnue');
    } finally {
      setFetching(false);
    }
  };

  return (
    <div>
      <div className="fetch-row">
        {hasCoords ? (
          <button type="button" className="btn" onClick={fetchMeteo} disabled={fetching}>
            {fetching ? 'Récupération de la météo…' : 'Préremplir avec la météo'}
          </button>
        ) : (
          <span className="muted small">Ajoutez les coordonnées GPS du site pour préremplir la météo.</span>
        )}
        {err && (
          <span className="field-error" role="alert">
            <StatusIcon tone="warn" />
            Météo indisponible : {err}. Saisissez les conditions à la main.
          </span>
        )}
      </div>
      <textarea
        id={id}
        className="textarea"
        rows={3}
        placeholder="Vent, état de la mer, courant, visibilité estimée"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// Codes météo WMO simplifiés
function meteoCode(code) {
  if (code == null) return 'Météo inconnue';
  if (code === 0) return 'Ciel dégagé';
  if (code <= 3) return 'Partiellement nuageux';
  if (code <= 48) return 'Brumeux / brouillard';
  if (code <= 67) return 'Pluie';
  if (code <= 77) return 'Neige';
  if (code <= 82) return 'Averses';
  if (code <= 99) return 'Orage';
  return 'Variable';
}

// ── MareeField ─────────────────────────────────────────────────────────────
// Proxy PHP → maree.shom.fr : port le plus proche + coefficients et heures du jour.
function MareeField({ id, value, onChange, site, date }) {
  const [fetching, setFetching] = useState(false);
  const [err, setErr] = useState('');

  const fetchMaree = async () => {
    const coords = site?.coordonnees;
    const lat = parseFloat(coords?.lat);
    const lng = parseFloat(coords?.lng);
    if (!isFinite(lat) || !isFinite(lng)) {
      setErr('coordonnées GPS manquantes sur le site');
      return;
    }
    const diveDate = date ? date.slice(0, 10) : new Date().toISOString().slice(0, 10);
    setFetching(true);
    setErr('');
    try {
      const data = await api.proxy.maree(lat, lng, diveDate);
      // data = { harbor, date, tides }
      const text = `Marées ${data.harbor} (${data.date.split('-').reverse().join('/')}) : ${data.tides}`;
      onChange(text);
    } catch (e) {
      setErr(e?.message || 'erreur inconnue');
    } finally {
      setFetching(false);
    }
  };

  return (
    <div>
      <div className="fetch-row">
        {site?.coordonnees?.lat ? (
          <button type="button" className="btn" onClick={fetchMaree} disabled={fetching}>
            {fetching ? 'Récupération des marées…' : 'Préremplir avec le SHOM'}
          </button>
        ) : (
          <span className="muted small">Ajoutez les coordonnées GPS du site pour préremplir les marées.</span>
        )}
        {err && (
          <span className="field-error" role="alert">
            <StatusIcon tone="warn" />
            Marées indisponibles : {err}
          </span>
        )}
      </div>
      <input
        id={id}
        className="input"
        type="text"
        placeholder="PM 14h12, coefficient 87"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

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
  const propagateDp = useEffectEvent(() => {
    setAnswer('dp_qual', dpQual || '');
    setAnswer('dp_nom', selectedDP ? diverFullName(selectedDP) : '');
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

  // Numéro d'urgence par défaut selon pays du site + compte utilisateur
  const defaultUrgence = useEffectEvent(() => {
    if (answers.urgence_num) return;
    const code = selectedSite?.pays_code || '';
    const userDefault = user?.urgence_defaut || '18';
    if (code === 'CH') setAnswer('urgence_num', '144');
    else if (code === 'FR') setAnswer('urgence_num', '18');
    else setAnswer('urgence_num', userDefault);
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
                      Structure commerciale (SCA) : le DP doit être titulaire d'un diplôme d'État (DEJEPS, DESJEPS,
                      BEES…). Choisir un autre DP ou compléter sa fiche.
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
