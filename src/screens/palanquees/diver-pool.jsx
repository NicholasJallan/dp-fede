// DP Assistant — Annuaire des plongeurs disponibles (colonne de gauche de
// l'écran palanquées) : recherche, groupes repliables, ajout à une palanquée.

import React, { useState, useMemo, useId } from 'react';
import { Pill, diverFullName } from '../../components/components.jsx';
import { Icon } from '../../components/icons.jsx';

const alpha = (a, b) => (`${a.nom} ${a.prenom || ''}`).localeCompare(`${b.nom} ${b.prenom || ''}`, 'fr');
const lvlOrd = (np) => ({ N3: 0, N2: 1, N1: 2 })[np] ?? 3;

function groupDivers(list) {
  const g = { e3e4: [], e1e2n4: [], autres: [] };
  list.forEach(d => {
    const ne = d.niveau_encadrant, np = d.niveau_plongeur;
    if (['E3', 'E4'].includes(ne)) g.e3e4.push(d);
    else if (['E1', 'E2'].includes(ne) || np === 'N4' || ne === 'N4' || ne === 'N5') g.e1e2n4.push(d);
    else g.autres.push(d);
  });
  g.e3e4.sort(alpha);
  g.e1e2n4.sort(alpha);
  g.autres.sort((a, b) => (lvlOrd(a.niveau_plongeur) - lvlOrd(b.niveau_plongeur)) || alpha(a, b));
  return [
    { id: 'e3e4',   label: 'Encadrants E3, E4',     divers: g.e3e4 },
    { id: 'e1e2n4', label: 'Encadrants E1, E2, N4, N5', divers: g.e1e2n4 },
    { id: 'autres', label: 'Plongeurs',              divers: g.autres },
  ].filter(x => x.divers.length > 0);
}

function DiverCard({ d, palanquees, onAdd, onAddNew }) {
  const ne = d.niveau_encadrant, np = d.niveau_plongeur;
  const quals = [
    (d.nitrox || []).includes('PN-C') ? 'PN-C' : (d.nitrox || []).includes('PN') ? 'PN' : null,
    (d.trimix || []).length ? d.trimix[d.trimix.length - 1] : null,
    (d.recycleurs || []).length ? 'CCR' : null,
  ].filter(Boolean);
  return (
    <div className="diver-card">
      <div className="info">
        <Pill tone={ne ? 'ink' : 'default'}>{ne || np || 'Débutant'}</Pill>
        <b>{diverFullName(d)}</b>
        {quals.length > 0 && <span className="quals">{quals.join(' ')}</span>}
      </div>
      <select className="input" value="" aria-label={`Ajouter ${diverFullName(d)} à une palanquée`}
        onChange={e => {
          const v = e.target.value;
          if (v === '__new__') onAddNew(d.id);
          else if (v) onAdd(v, d.id);
        }}>
        <option value="">Ajouter à…</option>
        {palanquees.map((p, i) => <option key={p.id} value={p.id}>P{i + 1} — {p.nom}</option>)}
        <option value="__new__">Nouvelle palanquée</option>
      </select>
    </div>
  );
}

function PoolGroup({ group, open, onToggle, children }) {
  const bodyId = useId();
  return (
    <div className="pool-group">
      <button type="button" className="pool-group-header" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <span>{group.label}</span>
        <span className="pool-group-meta">
          <span className="pool-group-count">{group.divers.length}</span>
          <Icon.ChevronDown />
        </span>
      </button>
      {open && <div className="pool-group-body" id={bodyId}>{children}</div>}
    </div>
  );
}

export function DiverPool({ divers, assignedIds, palanquees, onAdd, onAddNew, onCreate }) {
  const [filter, setFilter] = useState('');
  const [closed, setClosed] = useState(() => new Set());
  const searchId = useId();

  const available = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return divers.filter(d => !assignedIds.has(d.id) && (!f
      || d.nom.toLowerCase().includes(f) || (d.prenom || '').toLowerCase().includes(f)
      || (d.niveau_encadrant || d.niveau_plongeur || '').toLowerCase().includes(f)));
  }, [divers, filter, assignedIds]);
  const groups = useMemo(() => groupDivers(available), [available]);

  const toggle = (id) => setClosed(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <section className="diver-pool" aria-labelledby={`${searchId}-title`}>
      <h2 id={`${searchId}-title`}>Annuaire <span className="num">{available.length}/{divers.length} disponibles</span></h2>
      <label className="sr-only" htmlFor={searchId}>Rechercher un plongeur</label>
      <input id={searchId} className="input" type="search" placeholder="Nom, prénom ou niveau"
        value={filter} onChange={e => setFilter(e.target.value)} />
      {groups.length === 0 && (
        <p className="muted small">{divers.length === 0 ? 'Annuaire vide.' : 'Aucun plongeur disponible avec ce filtre.'}</p>
      )}
      {groups.map(g => (
        <PoolGroup key={g.id} group={g} open={!closed.has(g.id)} onToggle={() => toggle(g.id)}>
          {g.divers.map(d => (
            <DiverCard key={d.id} d={d} palanquees={palanquees} onAdd={onAdd} onAddNew={onAddNew} />
          ))}
        </PoolGroup>
      ))}
      <button type="button" className="btn block" onClick={onCreate}>
        <Icon.Plus />Nouveau plongeur ou baptême
      </button>
    </section>
  );
}
