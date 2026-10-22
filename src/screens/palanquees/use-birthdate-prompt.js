// DP Assistant — Ouverture de la saisie rapide de date de naissance :
// d'office quand un plongeur sans date rejoint une palanquée (une seule fois
// par plongeur si le DP répond « Plus tard »), ou depuis l'alerte AGE_UNKNOWN.
// Réservé aux rôles qui peuvent modifier l'annuaire.

import { useState } from 'react';
import { api } from '../../api/api.js';
import { useClub } from '../../club/club-context.jsx';
import { diverToForm, formToPayload } from '../../components/diver-payload.js';

export function useBirthdatePrompt({ diversById, setDivers }) {
  const canEdit = useClub().can('divers.write');
  const [diverId, setDiverId] = useState(null);
  const [dismissed, setDismissed] = useState(() => new Set());

  const open = (id) => {
    if (diversById[id]) setDiverId(id);
  };
  const promptIfMissing = (id) => {
    const d = diversById[id];
    if (canEdit && d && !d.date_naissance && !dismissed.has(id)) setDiverId(id);
  };
  const close = () => {
    setDismissed((prev) => new Set([...prev, diverId]));
    setDiverId(null);
  };
  // PUT /api/divers/:id réécrit la fiche entière : on renvoie la fiche lue.
  const save = async (iso) => {
    const d = diversById[diverId];
    await api.divers.update(d.id, formToPayload({ ...diverToForm(d), date_naissance: iso }));
    setDivers((prev) => prev.map((x) => (x.id === d.id ? { ...x, date_naissance: iso } : x)));
    setDiverId(null);
  };

  return {
    diver: diverId ? diversById[diverId] || null : null,
    open: canEdit ? open : undefined,
    promptIfMissing,
    close,
    save,
  };
}
