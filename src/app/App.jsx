// DP Assistant — Shell principal : composition des hooks d'état et des
// composants de mise en page (topbar, stepper, écran courant, modales).

import React, { useState, useEffect, useMemo } from 'react';
import { ToastProvider, useToasts } from '../components/toast.jsx';
import { AuthProvider, useAuth } from '../auth/auth-context.jsx';
import { ClubProvider, useClub } from '../club/club-context.jsx';
import { InvitationDialog } from '../screens/club/invitation-dialog.jsx';
import { ErrorBoundary } from '../components/error-boundary.jsx';
import { SyncDrawer } from '../components/components.jsx';
import { useAutoSave } from '../offline/use-auto-save.jsx';
import { useOnline } from '../offline/use-online.jsx';
import { sync } from '../offline/sync.js';
import { outbox } from '../offline/outbox.js';
import { STORAGE_KEYS } from '../api/storage-keys.js';
import { ScreenLogin } from '../screens/screen-login.jsx';
import { SplashScreen } from '../screens/screen-splash.jsx';
import { useAuthExpired } from './hooks/use-auth-expired.js';
import { useOutboxItems } from './hooks/use-outbox-items.js';
import { useDirectory } from './hooks/use-directory.js';
import { useDiveDivers } from './hooks/use-dive-divers.js';
import { useDiveSession } from './hooks/use-dive-session.js';
import { useDiveLifecycle } from './hooks/use-dive-lifecycle.js';
import { useDiveActions } from './hooks/use-dive-actions.js';
import { useStepNavigation, stepFlags } from './hooks/use-step-navigation.js';
import { useTheme } from './hooks/use-theme.js';
import { useMediaQuery } from './hooks/use-media-query.js';
import { useStoragePersist } from './hooks/use-storage-persist.js';
import {
  computeProfilNotes,
  computeBlockingPalSummary,
  checklistProgress,
  areAllPalanqueesFinished,
  exitProgress,
  GO_DECISION_ID,
} from './derive.js';
import { AuthExpiredBanner, ReviewBanner, ClubLostBanner } from './components/AuthExpiredBanner.jsx';
import { Topbar } from './components/Topbar.jsx';
import { DiveStepper } from './components/DiveStepper.jsx';
import { AdminNav } from './components/AdminNav.jsx';
import { SideSummary, SideSummaryCompact } from './components/SideSummary.jsx';
import { FootNav } from './components/FootNav.jsx';
import { UrgenceModal } from './components/UrgenceModal.jsx';
import { ConfirmLogoutModal, ConfirmStartModal, StepConfirmModal } from './components/ConfirmModals.jsx';
import { ScreenRouter } from './components/ScreenRouter.jsx';

// Club courant changé (switch, invitation, retrait, autre appareil) : la
// plongée ouverte appartient à l'ancien club — on la ferme et on revient à
// l'accueil, qui affiche les plongées du nouveau club.
function useCloseDiveOnClubChange(session, setScreen, setDiveMode) {
  const { resetDiveState, setCurrentDiveId } = session;
  useEffect(() => {
    const onChanged = () => {
      resetDiveState();
      setCurrentDiveId(null);
      setDiveMode('prepare');
      setScreen((s) => (s === 'club' || s === 'stats' ? s : 'home'));
    };
    window.addEventListener('dp:clubChanged', onChanged);
    return () => window.removeEventListener('dp:clubChanged', onChanged);
  }, [resetDiveState, setCurrentDiveId, setScreen, setDiveMode]);
}

// Migration one-time : supprimer l'ancien brouillon localStorage v1 (désormais obsolète)
function useLegacyDraftCleanup() {
  useEffect(() => {
    try {
      localStorage.removeItem(STORAGE_KEYS?.LEGACY_V1 || 'dp-assistant-v1');
    } catch {
      /* stockage indisponible : rien à nettoyer */
    }
  }, []);
}

// Écran d'accueil animé affiché à chaque connexion d'un utilisateur.
function useSplash(user) {
  const [showSplash, setShowSplash] = useState(false);
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    setShowSplash(true);
  }, [userId]);
  return [showSplash, setShowSplash];
}

// Tout l'état du shell : session de plongée, annuaire, navigation, modales.
function useAppController() {
  const { user, loading: authLoading, logout } = useAuth();
  const { showToast } = useToasts();
  const online = useOnline();
  const authExpired = useAuthExpired(user?.id);
  const outboxItems = useOutboxItems(user);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // 'prepare' : étapes 1-3 (profil→palanquées→check-list phase 1)
  // 'execute' : étapes 3-5 (check-list phase 2→fiche→archive)
  const [screen, setScreen] = useState('home');
  const [diveMode, setDiveMode] = useState('prepare');
  // Modal « Urgence » accessible en un geste pendant le suivi temps réel.
  const [urgenceOpen, setUrgenceOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const session = useDiveSession();
  useLegacyDraftCleanup();
  const [showSplash, setShowSplash] = useSplash(user);
  const directory = useDirectory(user);
  const diveDivers = useDiveDivers(directory.divers, user);
  const { theme, toggle: toggleTheme } = useTheme();
  useStoragePersist(user);

  // Auto-save debounced (500 ms) vers le serveur ; flushSave(id) force un
  // envoi immédiat avant unmount / navigation entre plongées.
  const flushSave = useAutoSave({
    diveId: session.currentDiveId,
    user,
    plongeeFigee: session.plongeeFigee,
    answers: session.answers,
    palanquees: session.palanquees,
    checked: session.checked,
    comments: session.comments,
    pressions: session.pressions,
    realises: session.realises,
    heuresDebut: session.heuresDebut,
    departs: session.departs,
    heuresFin: session.heuresFin,
  });
  useDiveLifecycle(session);
  useCloseDiveOnClubChange(session, setScreen, setDiveMode);

  const actions = useDiveActions({
    session,
    flushSave,
    showToast,
    setScreen,
    setDiveMode,
    refreshDiversAndSites: directory.refreshDiversAndSites,
  });

  const derived = useMemo(() => computeProfilNotes(session.answers), [session.answers]);
  const blockingPalSummary = useMemo(
    () => computeBlockingPalSummary(session.palanquees, diveDivers, session.answers),
    [session.palanquees, diveDivers, session.answers],
  );
  const flags = stepFlags(screen, session.heuresDebut);
  const allPalanqueesFinished = areAllPalanqueesFinished(session.palanquees, session.heuresDebut, session.heuresFin);
  const nav = useStepNavigation({
    screen,
    setScreen,
    diveMode,
    session,
    flags,
    blockingPalSummary,
    allPalanqueesFinished,
    startPreparation: actions.startPreparation,
    finishPreparation: actions.finishPreparation,
  });

  return {
    user,
    authLoading,
    logout,
    online,
    authExpired,
    outboxItems,
    drawerOpen,
    setDrawerOpen,
    screen,
    setScreen,
    diveMode,
    urgenceOpen,
    setUrgenceOpen,
    confirmLogout,
    setConfirmLogout,
    showSplash,
    setShowSplash,
    session,
    directory,
    diveDivers,
    flushSave,
    actions,
    derived,
    blockingPalSummary,
    flags,
    allPalanqueesFinished,
    nav,
    theme,
    toggleTheme,
    progress: checklistProgress(session.answers, session.checked, diveMode),
    exit: exitProgress(session.palanquees, session.heuresDebut, session.heuresFin),
  };
}

function AppHeader({ ctl }) {
  const { user, session, flags, screen, setScreen, outboxItems } = ctl;
  const goHome = () => {
    if (session.currentDiveId) ctl.flushSave(session.currentDiveId);
    setScreen('home');
  };
  const reviewCount = outboxItems.filter((it) => it.status === 'review').length;
  const club = useClub();
  return (
    <>
      <a className="skip-link" href="#main">
        Aller au contenu
      </a>
      <Topbar
        user={user}
        online={ctl.online}
        outboxItems={outboxItems}
        screen={screen}
        showHomeLink={flags.isStepScreen || flags.isAdminScreen}
        theme={ctl.theme}
        onToggleTheme={ctl.toggleTheme}
        onHome={goHome}
        onOpenDrawer={() => ctl.setDrawerOpen(true)}
        onNavigate={setScreen}
        onLogout={() => (outboxItems.length > 0 ? ctl.setConfirmLogout(true) : ctl.logout())}
      />
      {/* keepLocal : l'outbox est rejouée après reconnexion ; le bandeau propose aussi de tout effacer. */}
      {ctl.authExpired && <AuthExpiredBanner onReconnect={() => ctl.logout({ keepLocal: true })} />}
      {club.lostClub && <ClubLostBanner lost={club.lostClub} onDismiss={club.dismissLostClub} />}
      {reviewCount > 0 && <ReviewBanner count={reviewCount} onOpen={() => ctl.setDrawerOpen(true)} />}
      {flags.isStepScreen && (
        <DiveStepper
          currentStepIdx={flags.currentStepIdx}
          diveMode={ctl.diveMode}
          plongeeFigee={session.plongeeFigee}
          divePlongeesEnCours={flags.divePlongeesEnCours}
        />
      )}
      {flags.isAdminScreen && <AdminNav screen={screen} user={user} onNavigate={setScreen} />}
    </>
  );
}

function AppOverlays({ ctl }) {
  const { session, actions, outboxItems, online } = ctl;
  const club = useClub();
  return (
    <>
      {club.invitationToken && !ctl.showSplash && <InvitationDialog onAccepted={() => ctl.setScreen('home')} />}
      {ctl.confirmLogout && (
        <ConfirmLogoutModal
          count={outboxItems.length}
          onCancel={() => ctl.setConfirmLogout(false)}
          onConfirm={() => {
            ctl.setConfirmLogout(false);
            ctl.logout();
          }}
        />
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
          onRetryReview={() => outbox.retryNow().then(() => sync.trigger('user-retry'))}
        />
      )}
      {ctl.showSplash && <SplashScreen user={ctl.user} onClose={() => ctl.setShowSplash(false)} />}
      {/* Modale ±4 h avant démarrage */}
      {actions.confirmStart && (
        <ConfirmStartModal
          confirmStart={actions.confirmStart}
          onCancel={() => actions.setConfirmStart(null)}
          onConfirm={actions.confirmStartExecution}
        />
      )}
      {/* Modale de confirmation / blocage avant archivage */}
      {session.confirmModal && (
        <StepConfirmModal
          kind={session.confirmModal}
          blockingPalSummary={ctl.blockingPalSummary}
          onOverride={ctl.nav.overridePalBlocking}
          onClose={() => session.setConfirmModal(false)}
          onConfirm={ctl.nav.confirmArchive}
        />
      )}
    </>
  );
}

function AppShell({ ctl }) {
  const { screen, session, flags } = ctl;
  const wide = useMediaQuery('(min-width: 980px)');
  const useSide = flags.isStepScreen && screen !== 'fiche' && screen !== 'archive';
  const summaryProps = { answers: session.answers, palanquees: session.palanquees, sites: ctl.directory.sites };
  return (
    <div className={`app ${flags.isStepScreen ? 'has-footnav' : ''}`} data-mode={ctl.diveMode}>
      <AppHeader ctl={ctl} />
      <main id="main" tabIndex={-1} className={`main ${useSide && wide ? 'with-side' : ''}`}>
        <div>
          {useSide && !wide && <SideSummaryCompact {...summaryProps} />}
          <ErrorBoundary resetKey={screen}>
            <ScreenRouter
              screen={screen}
              session={session}
              directory={ctl.directory}
              diveDivers={ctl.diveDivers}
              derived={ctl.derived}
              diveMode={ctl.diveMode}
              actions={ctl.actions}
              user={ctl.user}
              onNavigate={ctl.setScreen}
            />
          </ErrorBoundary>
        </div>
        {useSide && wide && <SideSummary {...summaryProps} />}
      </main>
      {flags.isStepScreen && (
        <FootNav
          screen={screen}
          currentStepIdx={flags.currentStepIdx}
          diveMode={ctl.diveMode}
          plongeeFigee={session.plongeeFigee}
          divePlongeesEnCours={flags.divePlongeesEnCours}
          archiveDone={session.archiveDone}
          allPalanqueesFinished={ctl.allPalanqueesFinished}
          goDecision={!!session.checked[GO_DECISION_ID]}
          progress={ctl.progress}
          exit={ctl.exit}
          onUrgence={() => ctl.setUrgenceOpen(true)}
          onPrev={ctl.nav.goPrev}
          onNext={ctl.nav.goNext}
          // Sans argument : l'événement de clic ne doit pas servir de modèle (prefill).
          onStartNew={() => ctl.actions.startPreparation()}
        />
      )}
      <AppOverlays ctl={ctl} />
    </div>
  );
}

function AppInner() {
  const ctl = useAppController();
  if (ctl.authLoading) {
    return (
      <div className="app-loading" role="status">
        Chargement de la session…
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
          <ClubProvider>
            <AppInner />
          </ClubProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
