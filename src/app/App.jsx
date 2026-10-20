// DP Assistant — Shell principal : composition des hooks d'état et des
// composants de mise en page (topbar, stepper, écran courant, modales).

import React, { useState, useEffect, useMemo } from 'react';
import { ToastProvider, useToasts } from '../components/toast.jsx';
import { AuthProvider, useAuth } from '../auth/auth-context.jsx';
import { ErrorBoundary } from '../components/error-boundary.jsx';
import { SyncDrawer } from '../components/components.jsx';
import { useAutoSave } from '../offline/use-auto-save.jsx';
import { useOnline } from '../offline/use-online.jsx';
import { sync } from '../offline/sync.js';
import { STORAGE_KEYS } from '../api/storage-keys.js';
import { ScreenLogin } from '../screens/screen-login.jsx';
import { SplashScreen } from '../screens/screen-splash.jsx';
import { useAuthExpired } from './hooks/use-auth-expired.js';
import { useOutboxItems } from './hooks/use-outbox-items.js';
import { useDirectory } from './hooks/use-directory.js';
import { useDiveSession } from './hooks/use-dive-session.js';
import { useDiveLifecycle } from './hooks/use-dive-lifecycle.js';
import { useDiveActions } from './hooks/use-dive-actions.js';
import { useStepNavigation, stepFlags } from './hooks/use-step-navigation.js';
import { computeProfilNotes, computeBlockingPalSummary, checklistProgress, areAllPalanqueesFinished } from './derive.js';
import { AuthExpiredBanner } from './components/AuthExpiredBanner.jsx';
import { Topbar } from './components/Topbar.jsx';
import { DiveStepper } from './components/DiveStepper.jsx';
import { AdminNav } from './components/AdminNav.jsx';
import { SideSummary } from './components/SideSummary.jsx';
import { FootNav } from './components/FootNav.jsx';
import { SyncFloatingPill, UrgenceButton } from './components/ExecuteOverlays.jsx';
import { UrgenceModal } from './components/UrgenceModal.jsx';
import { ConfirmLogoutModal, ConfirmStartModal, StepConfirmModal } from './components/ConfirmModals.jsx';
import { ScreenRouter } from './components/ScreenRouter.jsx';

// Migration one-time : supprimer l'ancien brouillon localStorage v1 (désormais obsolète)
function useLegacyDraftCleanup() {
  useEffect(() => {
    try { localStorage.removeItem(STORAGE_KEYS?.LEGACY_V1 || 'dp-assistant-v1'); } catch { /* stockage indisponible : rien à nettoyer */ }
  }, []);
}

// Écran d'accueil animé affiché à chaque connexion d'un utilisateur.
function useSplash(user) {
  const [showSplash, setShowSplash] = useState(false);
  useEffect(() => {
    if (!user) return;
    setShowSplash(true);
  }, [user?.id]);
  return [showSplash, setShowSplash];
}

// Tout l'état du shell : session de plongée, annuaire, navigation, modales.
function useAppController() {
  const { user, loading: authLoading, logout } = useAuth();
  const { showToast } = useToasts();
  const online = useOnline();
  const authExpired = useAuthExpired();
  const outboxItems = useOutboxItems(user);
  const [drawerOpen,    setDrawerOpen]    = useState(false);
  // 'prepare' : étapes 1-3 (profil→palanquées→check-list phase 1)
  // 'execute' : étapes 3-5 (check-list phase 2→fiche→archive)
  const [screen,        setScreen]        = useState("home");
  const [diveMode,      setDiveMode]      = useState('prepare');
  // Modal « Urgence » accessible en un geste pendant le suivi temps réel.
  const [urgenceOpen,   setUrgenceOpen]   = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const session = useDiveSession();
  useLegacyDraftCleanup();
  const [showSplash, setShowSplash] = useSplash(user);
  const directory = useDirectory(user);

  // Auto-save debounced (500 ms) vers le serveur ; flushSave(id) force un
  // envoi immédiat avant unmount / navigation entre plongées.
  const flushSave = useAutoSave({
    diveId: session.currentDiveId, user, plongeeFigee: session.plongeeFigee,
    answers: session.answers, palanquees: session.palanquees,
    checked: session.checked, comments: session.comments,
    pressions: session.pressions, realises: session.realises,
    heuresDebut: session.heuresDebut, heuresFin: session.heuresFin,
  });
  useDiveLifecycle(session);

  const actions = useDiveActions({
    session, flushSave, showToast, setScreen, setDiveMode,
    refreshDiversAndSites: directory.refreshDiversAndSites,
  });

  const derived = useMemo(() => computeProfilNotes(session.answers), [session.answers]);
  const blockingPalSummary = useMemo(
    () => computeBlockingPalSummary(session.palanquees, directory.divers, session.answers),
    [session.palanquees, directory.divers, session.answers]);
  const flags = stepFlags(screen, session.heuresDebut);
  const allPalanqueesFinished = areAllPalanqueesFinished(session.palanquees, session.heuresDebut, session.heuresFin);
  const nav = useStepNavigation({
    screen, setScreen, diveMode, session, flags,
    blockingPalSummary, allPalanqueesFinished,
    startPreparation: actions.startPreparation, finishPreparation: actions.finishPreparation,
  });

  return {
    user, authLoading, logout, online, authExpired, outboxItems,
    drawerOpen, setDrawerOpen, screen, setScreen, diveMode,
    urgenceOpen, setUrgenceOpen, confirmLogout, setConfirmLogout,
    showSplash, setShowSplash,
    session, directory, flushSave, actions, derived, blockingPalSummary,
    flags, allPalanqueesFinished, nav,
    progress: checklistProgress(session.answers, session.checked),
  };
}

function AppHeader({ ctl }) {
  const { user, session, flags, screen, setScreen, outboxItems } = ctl;
  const goHome = () => { if (session.currentDiveId) ctl.flushSave(session.currentDiveId); setScreen("home"); };
  return (<>
    {ctl.authExpired && <AuthExpiredBanner onReconnect={() => ctl.logout({ keepLocal: true })} />}
    <Topbar
      user={user} online={ctl.online} outboxCount={outboxItems.length}
      showHomeLink={flags.isStepScreen || flags.isAdminScreen}
      onHome={goHome}
      onOpenDrawer={() => ctl.setDrawerOpen(true)}
      onNavigate={setScreen}
      onLogout={() => (outboxItems.length > 0 ? ctl.setConfirmLogout(true) : ctl.logout())}
    />
    {flags.isStepScreen && (
      <DiveStepper currentStepIdx={flags.currentStepIdx} diveMode={ctl.diveMode}
        plongeeFigee={session.plongeeFigee} divePlongeesEnCours={flags.divePlongeesEnCours} />
    )}
    {flags.isAdminScreen && <AdminNav screen={screen} user={user} onNavigate={setScreen} />}
  </>);
}

function AppOverlays({ ctl }) {
  const { session, actions, outboxItems, online, diveMode } = ctl;
  const openDrawer = () => ctl.setDrawerOpen(true);
  return (<>
    {diveMode === 'execute' && (!online || outboxItems.length > 0) && (
      <SyncFloatingPill online={online} count={outboxItems.length} onOpen={openDrawer} />
    )}
    {diveMode === 'execute' && <UrgenceButton onOpen={() => ctl.setUrgenceOpen(true)} />}
    {ctl.confirmLogout && (
      <ConfirmLogoutModal count={outboxItems.length}
        onCancel={() => ctl.setConfirmLogout(false)}
        onConfirm={() => { ctl.setConfirmLogout(false); ctl.logout(); }} />
    )}
    {ctl.urgenceOpen && (
      <UrgenceModal answers={session.answers} user={ctl.user} onClose={() => ctl.setUrgenceOpen(false)} />
    )}
    {ctl.drawerOpen && (
      <SyncDrawer
        items={outboxItems}
        online={online}
        onClose={() => ctl.setDrawerOpen(false)}
        onForceSync={() => sync.trigger('user-force')}
      />
    )}
    {ctl.showSplash && <SplashScreen user={ctl.user} onClose={() => ctl.setShowSplash(false)} />}
    {/* Modale ±4 h avant démarrage */}
    {actions.confirmStart && (
      <ConfirmStartModal confirmStart={actions.confirmStart}
        onCancel={() => actions.setConfirmStart(null)} onConfirm={actions.confirmStartExecution} />
    )}
    {/* Modale de confirmation / blocage avant archivage */}
    {session.confirmModal && (
      <StepConfirmModal kind={session.confirmModal} blockingPalSummary={ctl.blockingPalSummary}
        onOverride={ctl.nav.overridePalBlocking}
        onClose={() => session.setConfirmModal(false)}
        onConfirm={ctl.nav.confirmArchive} />
    )}
  </>);
}

function AppShell({ ctl }) {
  const { screen, session, flags } = ctl;
  const useSide = flags.isStepScreen && screen !== "fiche";
  return (
    <div className="app">
      <AppHeader ctl={ctl} />
      <div className={`main ${useSide ? "with-side" : ""}`}>
        <div>
        <ErrorBoundary resetKey={screen}>
          <ScreenRouter screen={screen} session={session} directory={ctl.directory}
            derived={ctl.derived} diveMode={ctl.diveMode} actions={ctl.actions} user={ctl.user} />
        </ErrorBoundary>
        </div>
        {useSide && <SideSummary answers={session.answers} palanquees={session.palanquees} sites={ctl.directory.sites} />}
      </div>
      {flags.isStepScreen && (
        <FootNav screen={screen} currentStepIdx={flags.currentStepIdx} diveMode={ctl.diveMode}
          plongeeFigee={session.plongeeFigee} divePlongeesEnCours={flags.divePlongeesEnCours}
          archiveDone={session.archiveDone} allPalanqueesFinished={ctl.allPalanqueesFinished}
          doneCount={ctl.progress.doneCount} total={ctl.progress.total}
          onPrev={ctl.nav.goPrev} onNext={ctl.nav.goNext} onStartNew={ctl.actions.startPreparation} />
      )}
      <AppOverlays ctl={ctl} />
    </div>
  );
}

function AppInner() {
  const ctl = useAppController();
  if (ctl.authLoading) {
    return (
      <div className="app" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
        <div className="muted">Chargement…</div>
      </div>
    );
  }
  if (!ctl.user) return <ScreenLogin />;
  return <AppShell ctl={ctl} />;
}

export function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <AppInner />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
