// Navigation des écrans d'administration / compte / historique.

import React from 'react';
import { isSuperAdmin } from '../../auth/super-admin.js';

export function AdminNav({ screen, user, onNavigate }) {
  const items = [
    { id:"archives",     label:"Historique" },
    { id:"admin-divers", label:"Annuaire plongeurs" },
    { id:"admin-sites",  label:"Sites de plongée" },
    ...(isSuperAdmin(user) ? [{ id:"admin-users", label:"Utilisateurs" }] : []),
    { id:"account",      label:"Mon compte" },
  ];
  return (
    <div className="stepper" style={{ paddingTop:8, paddingBottom:8 }}>
      {items.map(item => (
        <button key={item.id}
          className={`step ${screen === item.id ? "active" : ""}`}
          onClick={() => onNavigate(item.id)}>
          <span className="grp"><span>{item.label}</span></span>
        </button>
      ))}
    </div>
  );
}
