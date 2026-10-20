// Aiguillage de l'écran courant (étapes de plongée et écrans d'administration).

import React from 'react';
import { ScreenHome } from '../../screens/screen-home.jsx';
import { ScreenProfil } from '../../screens/screen-profil.jsx';
import { ScreenPalanquees } from '../../screens/screen-palanquees.jsx';
import { ScreenChecklist } from '../../screens/screen-checklist.jsx';
import { ScreenFiche } from '../../screens/screen-fiche.jsx';
import { ScreenArchive } from '../../screens/screen-archive.jsx';
import { ScreenArchives } from '../../screens/screen-archives.jsx';
import { ScreenAccount } from '../../screens/screen-account.jsx';
import { ScreenAdminDivers } from '../../screens/screen-admin-divers.jsx';
import { ScreenAdminSites } from '../../screens/screen-admin-sites.jsx';
import { ScreenAdminUsers } from '../../screens/screen-admin-users.jsx';
import { isSuperAdmin } from '../../auth/super-admin.js';
import { ADMIN_SCREENS } from '../constants.js';

function DiveStepScreen({ screen, session, directory, derived, diveMode, actions, user }) {
  const s = session;
  const { divers, setDivers, sites, setSites } = directory;
  switch (screen) {
    case "profil":
      return (
        <ScreenProfil
          answers={s.answers} setAnswer={s.setAnswer} derived={derived}
          divers={divers} setDivers={setDivers}
          sites={sites} setSites={setSites}
        />
      );
    case "palanquees":
      return (
        <ScreenPalanquees
          divers={divers} setDivers={setDivers}
          palanquees={s.palanquees} setPalanquees={s.setPalanquees}
          answers={s.answers} setAnswer={s.setAnswer}
        />
      );
    case "checklist":
      return (
        <ScreenChecklist
          answers={s.answers} setAnswer={s.setAnswer}
          checked={s.checked} setChecked={s.updateChecked}
          comments={s.comments} setComment={s.updateComment}
          mode={diveMode}
        />
      );
    case "fiche":
      return (
        <ScreenFiche answers={s.answers} palanquees={s.palanquees} divers={divers} setAnswer={s.setAnswer}
          pressions={s.pressions} setPressions={s.setPressions}
          realises={s.realises} setRealises={s.setRealises}
          heuresDebut={s.heuresDebut} setHeuresDebut={s.setHeuresDebut}
          heuresFin={s.heuresFin} setHeuresFin={s.setHeuresFin}
          diveId={s.currentDiveId} renderState={{ checked: s.checked, comments: s.comments }} />
      );
    case "archive":
      return (
        <ScreenArchive answers={s.answers} palanquees={s.palanquees} divers={divers} user={user}
          pressions={s.pressions} realises={s.realises}
          heuresDebut={s.heuresDebut} heuresFin={s.heuresFin}
          checked={s.checked} comments={s.comments}
          plongeeFigee={s.plongeeFigee} onStartNew={actions.startPreparation}
          onArchiveDone={() => s.setArchiveDone(true)}
          diveId={s.currentDiveId} />
      );
    default:
      return null;
  }
}

function AdminScreen({ screen, directory, user }) {
  const { divers, setDivers, diversLoaded, sites, setSites, sitesLoaded } = directory;
  switch (screen) {
    case "archives":     return <ScreenArchives />;
    case "admin-divers": return <ScreenAdminDivers divers={divers} setDivers={setDivers} diversLoaded={diversLoaded} />;
    case "admin-sites":  return <ScreenAdminSites sites={sites} setSites={setSites} sitesLoaded={sitesLoaded} />;
    case "admin-users":  return isSuperAdmin(user) ? <ScreenAdminUsers /> : null;
    case "account":      return <ScreenAccount />;
    default:             return null;
  }
}

export function ScreenRouter(props) {
  const { screen, actions } = props;
  if (screen === "home") {
    return (
      <ScreenHome
        onNew={actions.startPreparation}
        onLoadDive={actions.loadDive}
        onStartExecution={actions.startExecution}
        onDeleteDive={actions.deleteDive}
        onClone={actions.cloneDive}
        onCloneH3={actions.clonePreparedH3}
      />
    );
  }
  if (ADMIN_SCREENS.includes(screen)) return <AdminScreen {...props} />;
  return <DiveStepScreen {...props} />;
}
