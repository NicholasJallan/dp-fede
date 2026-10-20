// DP Assistant — Check-list opérationnelle.
//   mode 'prepare' → phase 1 (avant l'arrivée sur site)
//   mode 'execute' → phase 2 (sur site) ; la décision finale du DP est le
//   verrou qui autorise le passage à la fiche (mise à l'eau).

import React, { useState, useMemo, useId } from 'react';
import { Pill, CdsLink } from '../components/components.jsx';
import { Icon, StatusIcon } from '../components/icons.jsx';
import { visibleChecklist, GO_DECISION_ID } from '../app/derive.js';

const TAG_LABELS = {
  meteo: 'Météo',
  materiel: 'Matériel',
  nitrox: 'Nitrox',
  trimix: 'Trimix',
  recycleur: 'Recycleur',
  secours: 'Secours',
  plongeurs: 'Plongeurs',
  etrangers: 'Brevets étrangers',
  mineurs: 'Mineurs',
  bateau: 'Bateau',
  bord: 'Bord',
  fiche: 'Fiche',
};

function RappelCard({ answers, setAnswer }) {
  const id = useId();
  const onChange = (v) => {
    setAnswer('moyen_rappel', v);
    try {
      localStorage.setItem('dp-rappel-moyen', v);
    } catch (err) {
      console.warn('[DP] mémorisation du moyen de rappel :', err?.message || err);
    }
  };
  return (
    <section className="card mb-3" aria-labelledby={`${id}-t`}>
      <div className="card-head">
        <h2 id={`${id}-t`}>Moyen de rappel des plongeurs</h2>
      </div>
      <div className="card-body stack">
        <div className="field plain">
          <label htmlFor={id}>Signal utilisé pour rappeler les plongeurs en surface</label>
          <input
            id={id}
            className="input"
            type="text"
            aria-describedby={`${id}-h`}
            placeholder="Sondeur, pétard acoustique, coups sur la coque, corde de liaison…"
            value={answers.moyen_rappel || ''}
            disabled={!!answers.rappel_impossible}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="field-hint" id={`${id}-h`}>
            {answers.rappel_impossible
              ? 'Aucun rappel possible déclaré.'
              : 'Mémorisé et repris à la prochaine plongée.'}
          </span>
        </div>
        <label className={`qualif-toggle ${answers.rappel_impossible ? 'on' : ''}`}>
          <input
            type="checkbox"
            checked={!!answers.rappel_impossible}
            onChange={(e) => {
              setAnswer('rappel_impossible', e.target.checked || undefined);
              if (e.target.checked) setAnswer('moyen_rappel', '');
            }}
          />
          Pas de rappel possible (départ du bord sans moyen acoustique)
        </label>
      </div>
    </section>
  );
}

function ChecklistItem({ it, checked, comment, onToggle, onComment }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const isGate = it.id === GO_DECISION_ID;
  return (
    <div className={`cl-item ${checked ? 'done' : ''} ${isGate ? 'is-gate' : ''}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-labelledby={titleId}
        className="cl-check"
        onClick={onToggle}
      >
        <Icon.Check />
      </button>
      <div className="cl-body">
        <span className="title" id={titleId} onClick={onToggle}>
          {it.text}
        </span>
        {isGate && (
          <span className="cl-gate-note">
            <StatusIcon tone={checked ? 'ok' : 'warn'} />
            {checked ? "Mise à l'eau autorisée par le DP." : 'Requis pour passer au suivi des palanquées.'}
          </span>
        )}
        <div className="meta">
          {it.ref && <CdsLink refText={it.ref} compact />}
          {(it.tags || []).map((t) => (
            <Pill key={t}>{TAG_LABELS[t] || t}</Pill>
          ))}
          <span className="spacer" />
          <button
            type="button"
            className="btn ghost"
            aria-expanded={open || !!comment}
            onClick={() => setOpen((o) => !o)}
          >
            {comment ? 'Modifier la note' : 'Ajouter une note'}
          </button>
        </div>
        {(open || comment) && (
          <textarea
            className="textarea"
            aria-label={`Note : ${it.text}`}
            placeholder="Valeur, remarque, signataire…"
            value={comment || ''}
            onChange={(e) => onComment(e.target.value)}
          />
        )}
      </div>
    </div>
  );
}

function ScreenChecklist({ answers, setAnswer, checked, setChecked, comments, setComment, mode = 'execute' }) {
  const phases = useMemo(() => visibleChecklist(answers, mode), [answers, mode]);
  const items = phases.flatMap((p) => p.items);
  const total = items.length;
  const done = items.filter((i) => checked[i.id]).length;
  const conditional = items.filter((i) => i.when).length;
  const isPrepare = mode === 'prepare';

  return (
    <div>
      <div className="page-head">
        <p className="step-tag">
          <span className="num">3</span>Check-list, {isPrepare ? 'phase 1 : préparation' : 'phase 2 : sur site'}
        </p>
        <h1>{isPrepare ? "Avant l'arrivée sur site" : "Sur site, avant la mise à l'eau"}</h1>
        <p>
          {total} contrôle{total > 1 ? 's' : ''}, dont {conditional} déclenché{conditional > 1 ? 's' : ''} par le profil
          de la plongée.
          {!isPrepare && " La décision finale du DP autorise la mise à l'eau."}
        </p>
      </div>

      <div className="cl-toolbar">
        <span className="cl-count">
          {done}/{total}
          <small>cochés</small>
        </span>
        {answers.nitrox && <Pill>Nitrox</Pill>}
        {answers.trimix && <Pill>Trimix</Pill>}
        {answers.recycleur && <Pill>Recycleur</Pill>}
        {answers.depart_bateau && <Pill>Bateau</Pill>}
        {answers.mineurs && <Pill>Mineurs</Pill>}
        {(answers.activite === 'Enseignement' || answers.activite === 'Mixte') && <Pill>Enseignement</Pill>}
        <span className="spacer" />
        <button type="button" className="btn" onClick={() => window.print()}>
          <Icon.Print />
          Imprimer
        </button>
      </div>

      <RappelCard answers={answers} setAnswer={setAnswer} />

      {phases.map((p) => {
        const phaseDone = p.items.filter((i) => checked[i.id]).length;
        return (
          <section className="cl-phase" key={p.phase} aria-labelledby={`phase-${p.phase}`}>
            <div className="cl-phase-head">
              <h2 id={`phase-${p.phase}`}>{p.phaseTitle}</h2>
              <span className="count">
                {phaseDone}/{p.items.length}
              </span>
            </div>
            {p.items.length === 0 && <p className="empty">Aucun contrôle pour cette phase.</p>}
            {p.items.map((it) => (
              <ChecklistItem
                key={it.id}
                it={it}
                checked={!!checked[it.id]}
                comment={comments[it.id]}
                onToggle={() => setChecked(it.id, !checked[it.id])}
                onComment={(v) => setComment(it.id, v)}
              />
            ))}
          </section>
        );
      })}

      <p className="disclaimer">
        Check-list générée à partir du profil de la plongée et des références Code du sport et MFT FFESSM rappelées.
        Elle ne dispense pas le DP de la lecture des textes en vigueur.
      </p>
    </div>
  );
}

export { ScreenChecklist };
