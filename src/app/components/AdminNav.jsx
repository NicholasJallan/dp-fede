// Onglets des écrans d'administration / compte / historique.

import React from 'react';
import { isSuperAdmin } from '../../auth/super-admin.js';
import { PARENT_SCREEN } from '../constants.js';

export function AdminNav({ screen, user, onNavigate }) {
  const items = [
    { id: 'archives', label: 'Historique' },
    { id: 'admin-divers', label: 'Annuaire des plongeurs' },
    { id: 'admin-sites', label: 'Sites de plongée' },
    { id: 'club', label: 'Club' },
    { id: 'stats', label: 'Statistiques' },
    ...(isSuperAdmin(user) ? [{ id: 'admin-users', label: 'Utilisateurs' }] : []),
    { id: 'account', label: 'Mon compte' },
  ];
  const active = screen === 'stats' ? 'stats' : PARENT_SCREEN[screen] || screen;
  return (
    <nav className="subtabs" aria-label="Administration">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="subtab"
          aria-current={active === item.id ? 'page' : undefined}
          onClick={() => onNavigate(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
