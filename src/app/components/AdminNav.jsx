// Onglets des écrans d'administration / compte / historique.

import React from 'react';
import { isSuperAdmin } from '../../auth/super-admin.js';

export function AdminNav({ screen, user, onNavigate }) {
  const items = [
    { id: 'archives',     label: 'Historique' },
    { id: 'admin-divers', label: 'Annuaire des plongeurs' },
    { id: 'admin-sites',  label: 'Sites de plongée' },
    ...(isSuperAdmin(user) ? [{ id: 'admin-users', label: 'Utilisateurs' }] : []),
    { id: 'account',      label: 'Mon compte' },
  ];
  return (
    <nav className="subtabs" aria-label="Administration">
      {items.map(item => (
        <button key={item.id} type="button" className="subtab"
          aria-current={screen === item.id ? 'page' : undefined}
          onClick={() => onNavigate(item.id)}>
          {item.label}
        </button>
      ))}
    </nav>
  );
}
