// DP Assistant — Étape 4 : suivi des palanquées et fiche de sécurité (Art. A322-72).
//
// À l'écran : une carte « cadran » par palanquée (ENTRÉE / SORTIE,
// chronomètre, pressions de sortie). Le tableau complet de la fiche reste
// disponible (repliable) et est toujours imprimé (A4, noir et blanc).

import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../auth/auth-context.jsx';
import { useToasts } from '../components/toast.jsx';
import { Alert, CdsLink } from '../components/components.jsx';
import { ConfirmDialog } from '../components/dialog.jsx';
import { Icon } from '../components/icons.jsx';
import { initialPaliers, isBassinDerogation } from '../domain/index.js';
import { api } from '../api/api.js';
import { exitProgress } from '../app/derive.js';
import { Cadran, ExecSummary, pressureKey } from './fiche/execution-board.jsx';
import { FinDialog } from './fiche/fin-dialog.jsx';
import { FicheDocument } from './fiche/fiche-document.jsx';
import { addMinutes, diffMinutes, nowHHMM } from './fiche/time.js';

// Entrée / sortie des palanquées. Logique de fin conservée : heure de fin =
// heure d'entrée + durée saisie ; pression par défaut 50 bar matérialisée
// pour chaque membre (présente dans le PDF même sans saisie).
function useDiveTracking({ answers, palanquees, heuresDebut, setHeuresDebut, setHeuresFin, realises, setRealises, setPressions }) {
  const [fin, setFin] = useState(null);
  const [finForm, setFinForm] = useState({ duree: '', profMax: '', dtr: '', commentaire: '', ...initialPaliers(null) });
  const [confirmDepart, setConfirmDepart] = useState(null);

  const start = (palId) => {
    // Premier départ : confirmation (verrouille définitivement la préparation).
    if (Object.keys(heuresDebut).length === 0) setConfirmDepart(palId);
    else setHeuresDebut(prev => ({ ...prev, [palId]: nowHHMM() }));
  };
  const confirmStart = () => {
    if (!confirmDepart) return;
    setHeuresDebut(prev => ({ ...prev, [confirmDepart]: nowHHMM() }));
    setConfirmDepart(null);
  };

  const openFin = (pal) => {
    const endTime = nowHHMM();
    const debut = heuresDebut[pal.id];
    const elapsed = debut ? diffMinutes(debut, endTime) : null;
    // DTR prévue saisie par le DP (jamais calculée d'office) ; bornée à la durée réelle.
    const dtrPrevue = pal.dtr ?? null;
    const dtr = (dtrPrevue !== null && elapsed !== null && dtrPrevue > elapsed) ? elapsed : dtrPrevue;
    const previous = realises[pal.id];
    setFinForm({
      duree: elapsed !== null ? String(elapsed) : '',
      profMax: String(pal.profMax || ''),
      dtr: dtr === null ? '' : String(dtr),
      commentaire: previous?.commentaire || '',
      // Paliers et palier de confort : stockés dans render_state.realises (fiche + PDF).
      ...initialPaliers(previous),
    });
    const siteProfMax = answers.site_prof_max ? parseInt(answers.site_prof_max, 10) : null;
    setFin({ palId: pal.id, endTime, elapsed, debut, siteProfMax });
  };

  const confirmFin = () => {
    if (!fin) return;
    const duree = parseInt(finForm.duree, 10);
    const endTime = (fin.debut && isFinite(duree)) ? addMinutes(fin.debut, duree) : fin.endTime;
    setHeuresFin(prev => ({ ...prev, [fin.palId]: endTime }));
    setRealises(prev => ({ ...prev, [fin.palId]: { ...finForm } }));
    const pal = palanquees.find(p => p.id === fin.palId);
    if (pal) {
      setPressions(prev => {
        const next = { ...prev };
        (pal.membres || []).forEach(m => { if (next[pressureKey(pal, m)] === undefined) next[pressureKey(pal, m)] = '50'; });
        return next;
      });
    }
    setFin(null);
  };

  return { fin, setFin, finForm, setFinForm, confirmDepart, setConfirmDepart, start, confirmStart, openFin, confirmFin };
}

// PDF serveur (mPDF) après envoi de l'état courant ; repli impression navigateur.
function usePdfDownload({ diveId, answers, palanquees, renderState, pressions, realises, heuresDebut, heuresFin }) {
  const { showToast } = useToasts();
  const [busy, setBusy] = useState(false);
  const download = async () => {
    if (!diveId) { window.print(); return; }
    setBusy(true);
    try {
      await api.dives.pushNow(diveId, {
        answers, palanquees,
        render_state: { ...(renderState || {}), pressions, realises, heuresDebut, heuresFin },
      });
      const blob = await api.pdf.blob(diveId, 'fiche');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `fiche-securite-${(answers.date || '').slice(0, 10)}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch (err) {
      showToast({ tone: 'warn', title: 'PDF serveur indisponible', body: `${err?.message || err}\nImpression navigateur à la place.` });
      window.print();
    } finally {
      setBusy(false);
    }
  };
  return { busy, download };
}

function ScreenFiche(props) {
  const { answers, palanquees, divers, setAnswer, pressions, setPressions, realises, heuresDebut, heuresFin } = props;
  const { user } = useAuth();
  const diversById = useMemo(() => Object.fromEntries(divers.map(d => [d.id, d])), [divers]);
  const [obs, setObs] = useState(answers.fiche_observations || '');
  const [showDoc, setShowDoc] = useState(false);
  const track = useDiveTracking(props);
  const pdf = usePdfDownload(props);
  const exit = exitProgress(palanquees, heuresDebut, heuresFin);

  useEffect(() => {
    if (setAnswer) setAnswer('fiche_observations', obs);
  }, [obs]); // eslint-disable-line react-hooks/exhaustive-deps

  const finPal = track.fin ? palanquees.find(p => p.id === track.fin.palId) : null;
  const finIdx = finPal ? palanquees.indexOf(finPal) : -1;
  const bassin = isBassinDerogation(answers, Math.max(0, ...palanquees.map(p => Number(p.profMax) || 0)));

  return (
    <div className="fiche-screen">
      <div className="page-head">
        <p className="step-tag"><span className="num">4</span>Suivi des palanquées</p>
        <h1>Fiche de sécurité <CdsLink art="A322-72" /></h1>
        <p>Appuyez sur ENTRÉE à la mise à l'eau et sur SORTIE au retour de chaque palanquée. La fiche est à conserver un an.</p>
        <div className="page-head-actions no-print">
          <button type="button" className="btn" onClick={pdf.download} disabled={pdf.busy}>
            <Icon.Download />{pdf.busy ? 'Génération du PDF…' : 'Télécharger le PDF'}
          </button>
          <button type="button" className="btn ghost" onClick={() => window.print()}><Icon.Print />Imprimer</button>
        </div>
      </div>

      {bassin && (
        <Alert tone="info" title="Piscine ou fosse de 6 m au plus">
          La fiche de sécurité n'est pas obligatoire et un DP E1 suffit <CdsLink art="A322-98" compact />.
          Vous pouvez la compléter comme trace volontaire.
        </Alert>
      )}

      <section className="exec-board" aria-label="Suivi des palanquées">
        <ExecSummary exit={exit} />
        {palanquees.length === 0 && (
          <div className="empty-state"><b>Aucune palanquée</b><span>La préparation ne contient pas de palanquée à suivre.</span></div>
        )}
        <div className="cadran-list">
          {palanquees.map((p, i) => (
            <Cadran key={p.id} pal={p} index={i} diversById={diversById}
              debut={heuresDebut[p.id]} fin={heuresFin[p.id]} real={realises[p.id]} pressions={pressions}
              onStart={() => track.start(p.id)} onEnd={() => track.openFin(p)}
              onPressure={(key, v) => setPressions(prev => ({ ...prev, [key]: v }))} />
          ))}
        </div>
        <div className="field exec-notes">
          <label htmlFor="fiche-obs">Observations générales</label>
          <textarea id="fiche-obs" className="textarea" value={obs} onChange={e => setObs(e.target.value)}
            placeholder={`${answers.shot_line ? 'Shot-line installée. ' : ''}Conditions particulières, incidents, points d'attention`} />
        </div>
      </section>

      <div className="fiche-toggle no-print">
        <button type="button" className="btn" aria-expanded={showDoc} aria-controls="fiche-doc" onClick={() => setShowDoc(v => !v)}>
          <Icon.ChevronDown />{showDoc ? 'Masquer la fiche complète' : 'Afficher la fiche complète (A4)'}
        </button>
      </div>
      <div id="fiche-doc" className={`fiche-wrap ${showDoc ? '' : 'is-collapsed'}`}>
        <FicheDocument answers={answers} palanquees={palanquees} diversById={diversById} user={user}
          heuresDebut={heuresDebut} heuresFin={heuresFin} realises={realises} pressions={pressions} observations={obs} />
      </div>

      {track.fin && finPal && (
        <FinDialog palLabel={`P${finIdx + 1} ${finPal.nom || ''}`.trim()} fin={track.fin}
          form={track.finForm} setForm={track.setFinForm} noDeco={!!finPal.no_deco}
          onCancel={() => track.setFin(null)} onConfirm={track.confirmFin} />
      )}

      {track.confirmDepart && (
        <ConfirmDialog title="Première mise à l'eau" icon="warn" tone="warn" confirmLabel="Confirmer l'entrée"
          onCancel={() => track.setConfirmDepart(null)} onConfirm={track.confirmStart}>
          <p>Dès la première palanquée à l'eau, <b>le profil, les palanquées et la check-list sont définitivement verrouillés.</b></p>
          <p>Confirmez que la préparation est complète et validée.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

export { ScreenFiche };
