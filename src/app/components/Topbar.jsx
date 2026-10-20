// Barre haute : marque / accueil, pastille de synchronisation, bascule
// Soleil / Nuit, navigation (en ligne ≥ 1024 px, menu repliable en dessous).

import React, { useState, useRef, useEffect, useId } from 'react';
import { BrandMark, Icon, StatusIcon } from '../../components/icons.jsx';
import { PARENT_SCREEN } from '../constants.js';

// État de synchronisation résumé pour la pastille et son libellé accessible.
export function syncSummary(online, items) {
  const count = items.length;
  const review = items.filter(it => it.status === 'review').length;
  if (review > 0) return { cls: 'is-review', tone: 'warn', label: 'À revoir', count: review,
    title: `${review} action${review > 1 ? 's' : ''} refusée${review > 1 ? 's' : ''} par le serveur` };
  if (!online) return { cls: 'is-offline', tone: 'warn', label: 'Hors ligne', count,
    title: count ? `Hors ligne, ${count} action${count > 1 ? 's' : ''} en attente` : 'Hors ligne' };
  if (count > 0) return { cls: 'is-pending', tone: 'info', label: 'Envoi', count,
    title: `${count} action${count > 1 ? 's' : ''} en cours d'envoi` };
  return { cls: 'is-ok', tone: 'ok', label: 'En ligne', count: 0, title: 'En ligne, tout est synchronisé' };
}

function SyncPill({ online, items, onOpen }) {
  const s = syncSummary(online, items);
  return (
    <button type="button" className={`sync-pill ${s.cls}`} onClick={onOpen}
      aria-label={`Synchronisation : ${s.title}`} title={s.title}>
      <StatusIcon tone={s.tone} />
      <span className="label">{s.label}</span>
      {s.count > 0 && <span className="count" aria-hidden="true">{s.count}</span>}
    </button>
  );
}

function ThemeToggle({ theme, onToggle }) {
  const isNight = theme === 'dark';
  return (
    <button type="button" className="topbar-btn theme-toggle" onClick={onToggle}
      aria-pressed={isNight} aria-label="Mode nuit" title={isNight ? 'Passer en mode Soleil' : 'Passer en mode Nuit'}>
      {isNight ? <Icon.Moon /> : <Icon.Sun />}
      <span className="label">{isNight ? 'Nuit' : 'Soleil'}</span>
    </button>
  );
}

function navItems(user) {
  const name = user.prenom || user.nom || user.email?.split('@')[0] || 'Mon compte';
  return [
    { id: 'archives',     label: 'Historique', icon: Icon.History },
    { id: 'admin-divers', label: 'Annuaire',   icon: Icon.Users },
    { id: 'club',         label: 'Club',       icon: Icon.Flag, title: 'Club, membres et invitations' },
    { id: 'account',      label: name,         icon: Icon.User, title: 'Mon compte' },
  ];
}

// Menu repliable (petits écrans) : Échap et clic extérieur ferment.
function MenuPopover({ user, items, screen, onNavigate, onLogout }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    wrapRef.current?.querySelector('.menu-item')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = (fn) => () => { setOpen(false); fn(); };

  return (
    <div className="topbar-menu" ref={wrapRef}>
      <button ref={btnRef} type="button" className="topbar-btn" aria-expanded={open} aria-controls={menuId}
        onClick={() => setOpen(o => !o)}>
        <Icon.Menu /><span className="label">Menu</span>
      </button>
      {open && (
        <div className="menu-pop" id={menuId} role="group" aria-label="Menu principal">
          <div className="menu-head">{user.email}{user.club_nom ? ` — ${user.club_nom}` : ''}</div>
          {items.map(it => (
            <button key={it.id} type="button" className="menu-item" aria-current={screen === it.id ? 'page' : undefined}
              onClick={go(() => onNavigate(it.id))}>
              <it.icon />{it.title || it.label}
            </button>
          ))}
          <button type="button" className="menu-item danger" onClick={go(onLogout)}>
            <Icon.Logout />Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}

export function Topbar({ user, online, outboxItems, screen: rawScreen, showHomeLink, theme, onToggleTheme, onHome, onOpenDrawer, onNavigate, onLogout }) {
  const items = navItems(user);
  const screen = PARENT_SCREEN[rawScreen] || rawScreen;
  return (
    <header className="topbar">
      <button type="button" className="topbar-brand" onClick={onHome} aria-label="DP Assistant" title="Retour à l'accueil">
        <BrandMark />
        <span className="brand-text"><b>DP</b> Assistant</span>
      </button>
      {showHomeLink && (
        <button type="button" className="topbar-btn topbar-home" onClick={onHome}>
          <Icon.Home /><span className="label">Accueil</span>
        </button>
      )}
      {user.club_nom && <span className="topbar-club">{user.club_nom}</span>}
      <div className="topbar-tools">
        <SyncPill online={online} items={outboxItems} onOpen={onOpenDrawer} />
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <nav className="topbar-nav" aria-label="Menu principal">
          {items.map(it => (
            <button key={it.id} type="button" className="topbar-btn" title={it.title}
              aria-current={screen === it.id ? 'page' : undefined} onClick={() => onNavigate(it.id)}>
              {it.label}
            </button>
          ))}
          <button type="button" className="topbar-btn" onClick={onLogout} aria-label="Se déconnecter" title="Se déconnecter">
            <Icon.Logout />
          </button>
        </nav>
        <MenuPopover user={user} items={items} screen={screen} onNavigate={onNavigate} onLogout={onLogout} />
      </div>
    </header>
  );
}
