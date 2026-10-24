// DP Assistant — Fiche de sécurité imprimable (Art. A322-72), A4 portrait,
// lisible en noir et blanc. Tableau complet des palanquées : prévu / réalisé.

import React from 'react';
import { CdsLink, diverFullName, formatDateTime } from '../../components/components.jsx';
import {
  formatPaliers,
  defaultUrgenceNumber,
  getEmergencyInfo,
  getPalType,
  REGLEMENTATION,
  STRUCTURE_LABELS,
  sortMembresForFiche,
  withDecoO2,
} from '../../domain/index.js';
import { pressureKey } from './execution-board.jsx';

const TYPE_SHORT = { exploration: 'Explo.', guidee: 'Guidée', formation: 'Form.', bapteme: 'Bapt.' };
const AIR_OUT = "panne d'air";

const yesNo = (v, yes = 'Oui', no = 'Non') => (v ? yes : no);

function structureLine(user) {
  if (!user?.club_nom) return "Structure non renseignée (à compléter dans l'écran Club)";
  const type = user.structure_type ? `, ${STRUCTURE_LABELS[user.structure_type] || user.structure_type}` : '';
  return `${user.club_nom}${type}${user.club_numero ? ` (${user.club_numero})` : ''}`;
}

function formatCoords(c) {
  return c?.lat != null ? `${Number(c.lat).toFixed(5)}, ${Number(c.lng).toFixed(5)}` : '—';
}

function PrevuReal({ prevu, real, unit, extra }) {
  return (
    <div className="pv">
      <span>
        <span className="lbl">Prévu </span>
        <b className="num">{prevu != null && prevu !== '' ? `${prevu} ${unit}` : '—'}</b>
      </span>
      <span>
        <span className="lbl">Réalisé </span>
        <b className="num">{real != null && real !== '' ? `${real} ${unit}` : '—'}</b>
      </span>
      {extra}
    </div>
  );
}

function PalRows({ p, pi, diversById, heuresDebut, heuresFin, realises, pressions }) {
  const sorted = sortMembresForFiche(p.membres || []);
  const gas = withDecoO2(p);
  const real = realises[p.id];
  const debut = heuresDebut[p.id],
    fin = heuresFin[p.id];
  const isSFPal = sorted.filter((m) => m.aptitude === 'GP').length >= 2;
  const palType = getPalType(p.membres || [], p.mode);
  const rows = sorted.length || 1;
  return (
    <tbody className="pal-group">
      {sorted.map((m, mi) => {
        const d = m._bapteme ? m : diversById[m.diverId] || {};
        const name = m._bapteme ? `${m.prenom || ''} ${(m.nom || '').toUpperCase()}` : d.nom ? diverFullName(d) : '?';
        const isSF = isSFPal && mi === sorted.length - 1 && m.aptitude === 'GP';
        const pr = pressions[pressureKey(p, m)];
        return (
          <tr key={`${p.id}-${mi}`}>
            {mi === 0 && (
              <td rowSpan={rows} className="pal-id">
                P{pi + 1}
                <small>{TYPE_SHORT[palType] || palType}</small>
              </td>
            )}
            <td>
              <b>{name}</b>
              <br />
              <span className="num muted">{m._bapteme ? 'Baptême' : d.licence || '—'}</span>
            </td>
            <td className="num">
              {m.aptitude || '—'}
              {isSF ? ' (SF)' : ''}
            </td>
            {mi === 0 && (
              <>
                <td rowSpan={rows}>
                  {(p.melanges || []).join(', ') || 'Air'}
                  {gas.o2 ? ` · O₂ ${gas.o2} %` : ''}
                  {gas.o2_deco ? ` · déco O₂ ${gas.o2_deco} %` : ''}
                  {p.shot_line && (
                    <>
                      <br />
                      <small>shot-line</small>
                    </>
                  )}
                  {p.no_deco && (
                    <>
                      <br />
                      <small>sans palier</small>
                    </>
                  )}
                </td>
                <td rowSpan={rows}>
                  <PrevuReal prevu={p.profMax} real={real?.profMax} unit="m" />
                </td>
                <td rowSpan={rows}>
                  <PrevuReal
                    prevu={p.duree}
                    real={real?.duree}
                    unit="min"
                    extra={
                      debut && (
                        <span className="num">
                          {debut} – {fin || '…'}
                        </span>
                      )
                    }
                  />
                </td>
                <td rowSpan={rows}>
                  <PrevuReal
                    prevu={p.dtr}
                    real={real?.dtr}
                    unit="min"
                    extra={
                      formatPaliers(real) && (
                        <span className="paliers">
                          <span className="lbl">Paliers </span>
                          {formatPaliers(real)}
                        </span>
                      )
                    }
                  />
                </td>
              </>
            )}
            <td className="num">{pr ? (pr === AIR_OUT ? AIR_OUT : `${pr} bar`) : '—'}</td>
          </tr>
        );
      })}
      {real?.commentaire && (
        <tr className="comment-row">
          <td colSpan={8}>
            <b>Commentaire : </b>
            {real.commentaire}
          </td>
        </tr>
      )}
    </tbody>
  );
}

function SecuriteSurface({ answers, diversById, urgence }) {
  const membres = Array.isArray(answers.sec_surface_membres) ? answers.sec_surface_membres : [];
  return (
    <div className="cols-2">
      <div>
        Sécurité surface : <b>{yesNo(answers.sec_surface, 'présente', 'non identifiée')}</b>
      </div>
      {membres.length > 0 && (
        <div>
          Surveillance : <b>{membres.map((id) => (diversById[id] ? diverFullName(diversById[id]) : id)).join(', ')}</b>
        </div>
      )}
      {answers.sec_surface_externes && (
        <div>
          Non-plongeurs : <b>{answers.sec_surface_externes}</b>
        </div>
      )}
      <div>
        Plan de secours : <b>{yesNo(answers.plan_secours, 'affiché et à jour', 'à vérifier')}</b>
      </div>
      <div>
        Coordonnées secours : <b>{yesNo(answers.coords_secours, 'affichées', 'à vérifier')}</b>
      </div>
      <div>
        Matériel O₂ vérifié : <b>{yesNo(answers.o2)}</b>
      </div>
      <div>
        Trousse de secours, couverture : <b>{yesNo(answers.trousse)}</b>
      </div>
      <div>
        VHF : <b>{answers.vhf ? 'embarquée et testée' : '—'}</b>
      </div>
      <div>
        Pavillon Alpha : <b>{answers.pavillon_alpha || answers.bouee_surface ? 'hissé, présent' : '—'}</b>
      </div>
      <div>
        Eau douce potable : <b>{yesNo(answers.eau_potable)}</b>
      </div>
      <div>
        Moyen de rappel : <b>{answers.moyen_rappel || (answers.rappel ? 'oui' : '—')}</b>
      </div>
      <div>
        Numéro d'urgence : <b className="num">{urgence}</b>
      </div>
    </div>
  );
}

function Complementaires({ answers }) {
  const items = [
    answers.prof_max && ['Profondeur max autorisée', answers.prof_max],
    ['Paliers de décompression', answers.paliers ? 'autorisés' : 'non autorisés'],
    answers.successive && ['Plongée successive', 'prévue'],
    answers.maree_relevant && answers.maree_horaire && ['Marées', answers.maree_horaire],
    answers.depart_bateau && ['Chef de bord', answers.chef_bord ? 'désigné' : 'non désigné'],
    answers.depart_bateau && answers.distance_cote && ['Distance de la côte', `${answers.distance_cote} M`],
    answers.recycleur && [
      'Recycleurs',
      `oui${answers.recycleur_modeles ? `, ${answers.recycleur_modeles.replace(/\n/g, ', ')}` : ''}`,
    ],
    answers.bloc_relais && [
      'Bloc relais, déco',
      Array.isArray(answers.bloc_relais_gaz) && answers.bloc_relais_gaz.length
        ? answers.bloc_relais_gaz.join(', ')
        : 'oui',
    ],
    answers.parachute_obligatoire && ['Parachute de palier', 'obligatoire par palanquée'],
    answers.parachute_par_plongeur && ['Parachute individuel', 'chaque plongeur'],
    answers.mineurs && ['Mineurs', 'présents'],
    answers.etrangers && ['Brevets étrangers', 'présents, évaluation E3'],
    answers.handisub && ['Handisub', 'présent(s)'],
  ].filter(Boolean);
  return (
    <div className="cols-2">
      {items.map(([k, v]) => (
        <div key={k}>
          {k} : <b>{v}</b>
        </div>
      ))}
    </div>
  );
}

export function FicheDocument({
  answers,
  palanquees,
  diversById,
  user,
  heuresDebut,
  heuresFin,
  realises,
  pressions,
  observations,
}) {
  const urgence = answers.urgence_num || defaultUrgenceNumber(answers.site_pays_code, user?.urgence_defaut);
  const emi = getEmergencyInfo(answers.site_pays_code, answers.milieu);
  const depart =
    [answers.depart_bord && 'Du bord', answers.depart_bateau && 'En bateau'].filter(Boolean).join(', ') || '—';
  const allGas = [...new Set(palanquees.flatMap((p) => p.melanges || []))];
  const aptUsage = {};
  palanquees.forEach((p) =>
    p.membres.forEach((m) => {
      const a = m.aptitude || 'Sans';
      aptUsage[a] = (aptUsage[a] || 0) + 1;
    }),
  );
  const place = [answers.site_nom || answers.site || '—', answers.site_ville, answers.site_pays]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="fiche">
      <div className="fheader">
        <div>
          <p className="doc-kind">Fiche de sécurité, art. A322-72 du Code du sport</p>
          <p className="site">{place}</p>
          <p className="structure">{structureLine(user)}</p>
          {user?.president_nom && (
            <p className="structure">
              Président : {user.president_prenom} {user.president_nom}
              {user.president_tel ? `, ${user.president_tel}` : ''}
            </p>
          )}
        </div>
        <div className="right">
          <p className="when">{formatDateTime(answers.date)}</p>
          <p>
            DP : {answers.dp_nom || '—'} ({answers.dp_qual || '—'})
          </p>
          <p>Activité : {answers.activite || '—'}</p>
          <p className="urg">
            Urgences : <span className="num">{urgence}</span>
            {answers.site_pays_code === 'CH' ? ', 1414 (REGA)' : ''}
          </p>
        </div>
      </div>

      <div className="fiche-grid">
        <div className="cell">
          <div className="k">Milieu</div>
          <div className="v">{answers.milieu || '—'}</div>
        </div>
        <div className="cell">
          <div className="k">Départ</div>
          <div className="v">
            {depart}
            {answers.shot_line ? ', shot-line' : ''}
          </div>
        </div>
        <div className="cell">
          <div className="k">Mélanges</div>
          <div className="v">{allGas.join(', ') || '—'}</div>
        </div>
      </div>
      <div className="fiche-grid full">
        <div className="cell">
          <div className="k">Conditions</div>
          <div className="v">{answers.meteo || '—'}</div>
        </div>
      </div>

      <h3>Palanquées : paramètres prévus et réalisés</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Plongeur</th>
              <th scope="col">Aptitude</th>
              <th scope="col">Mélange</th>
              <th scope="col">Profondeur</th>
              <th scope="col">Durée</th>
              <th scope="col">DTR</th>
              <th scope="col">Pression sortie</th>
            </tr>
          </thead>
          {palanquees.map((p, pi) => (
            <PalRows
              key={p.id}
              p={p}
              pi={pi}
              diversById={diversById}
              heuresDebut={heuresDebut}
              heuresFin={heuresFin}
              realises={realises}
              pressions={pressions}
            />
          ))}
        </table>
      </div>

      <h3>Sécurité surface</h3>
      <SecuriteSurface answers={answers} diversById={diversById} urgence={urgence} />

      <h3>Conduite à tenir : déclenchement des secours</h3>
      <div className="fiche-secours">
        <p className="urg">
          Urgence : <span className="num">{urgence}</span>. {emi.secondaryNums}
        </p>
        <p>
          1. Sortir la victime de l'eau. 2. O₂ normobare 15 L/min. 3. Alerter les secours. 4. Surveiller, réanimer si
          besoin.
        </p>
        <p>
          Lieu, RDV secours : <b>{answers.site_acces_secours || answers.site_nom || '—'}</b>
        </p>
        <p>
          Coordonnées GPS : <b className="num">{formatCoords(answers.site_coords)}</b>
        </p>
        <p>
          Caisson, hôpital de référence : <b>{answers.site_caisson || '—'}</b>
        </p>
        {emi.vhf && (
          <p>
            VHF, canal de détresse : <b>{emi.vhf}</b>
          </p>
        )}
      </div>

      <h3>Aptitudes mises en œuvre</h3>
      <div className="apt-usage">
        {Object.entries(aptUsage).map(([apt, n]) => (
          <span key={apt}>
            {apt} × {n}
          </span>
        ))}
        {Object.keys(aptUsage).length === 0 && <span>—</span>}
      </div>

      <h3>Paramètres complémentaires</h3>
      <Complementaires answers={answers} />

      <h3>Observations générales</h3>
      <div className="obs">{observations || ' '}</div>

      <div className="signatures">
        <div className="sig">
          <div className="area"></div>Signature DP : {answers.dp_nom || '—'}
        </div>
        <div className="sig">
          <div className="area"></div>Signature encadrant(s)
        </div>
        <div className="sig">
          <div className="area"></div>Signature exploitant
        </div>
      </div>

      <p className="legal">
        Document à conserver un an au moins par l'établissement <CdsLink art="A322-72" compact />. Outil d'aide à la
        décision : la responsabilité personnelle du directeur de plongée demeure entière.
        {REGLEMENTATION && <> {REGLEMENTATION.label}.</>}
      </p>
    </div>
  );
}
