// @ts-check
// DP Assistant — Validation d'une palanquée (règles FFESSM + Code du Sport)
//
// Module pur, sans dépendance React. Charger AVANT data.js dans le navigateur.
// Les fonctions utilitaires (peLevel, paLevel) sont exportées pour les tests.
//
// Source légale : Code du Sport Art. A322-72 à A322-97, MFT FFESSM.

/**
 * @typedef {{ id: string, aptitude: string }} PalMembreRule
 * @typedef {{ membres: PalMembreRule[], profMax: number, duree?: number, dtr?: number, no_deco?: boolean }} PalanqueeRule
 * @typedef {{ ok: boolean, errs: string[] }} ValidationResult
 */

(function(root) {
  'use strict';

  const ENS_LEVELS = ['E1', 'E2', 'E3', 'E4'];

  /**
   * Niveau enseignant le plus élevé parmi les membres d'une palanquée.
   * @param {Array} membres
   * @returns {string|null} 'E1'..'E4' ou null
   */
  function getMaxEnsLevel(membres) {
    let maxIdx = -1;
    for (const m of membres || []) {
      const idx = ENS_LEVELS.indexOf(m.aptitude);
      if (idx > maxIdx) maxIdx = idx;
    }
    return maxIdx >= 0 ? ENS_LEVELS[maxIdx] : null;
  }

  /** PE20/PE40/PE60 → 20/40/60, sinon null. */
  function peLevel(apt) {
    const m = /^PE(\d+)$/.exec(apt || '');
    return m ? parseInt(m[1], 10) : null;
  }

  /** PA12/PA20/PA40/PA60 → nombre, sinon null. */
  function paLevel(apt) {
    const m = /^PA(\d+)$/.exec(apt || '');
    return m ? parseInt(m[1], 10) : null;
  }

  /**
   * Affichage canonique du nom d'un plongeur.
   * @param {{prenom:string, nom:string}} d
   */
  function diverFullName(d) {
    return `${d.prenom} ${(d.nom || '').toUpperCase()}`;
  }

  /**
   * Validation complète d'une palanquée.
   * Retourne une liste d'issues : { tone: 'err'|'warn'|'ok', text: string }.
   *
   * Dépendances : utilise window.getMilieuType, window.aptitudeMaxDepth,
   * window.getPalType, window.getDpMaxDepth (chargés via data.js).
   *
   * @param {object} pal           Palanquée { membres, profMax, melanges }
   * @param {object} diversById    Map { diverId -> diver complet }
   * @param {object} answers       Réponses profil { milieu, date, dp_qual, ... }
   * @param {object|null} dp       Plongeur DP { niveau_encadrant, nitrox, trimix }
   * @returns {Array<{tone:string,text:string}>}
   */
  function validatePal(pal, diversById, answers, dp) {
    const issues  = [];
    const membres = pal.membres
      .map(m => ({ ...m, diver: m._bapteme ? m : diversById[m.diverId] }))
      .filter(m => m.diver || m._bapteme);

    // ─── Taille universelle ─────────────────────────────────────────────
    if (membres.length === 0) {
      issues.push({ tone: 'warn', text: 'Palanquée vide.' });
      return issues;
    }
    if (membres.length === 1) {
      issues.push({ tone: 'err', text: 'Palanquée de 1 personne interdite (toujours par binôme minimum).' });
    }
    if (membres.length > 6) {
      issues.push({ tone: 'err', text: 'Max 6 personnes par palanquée.' });
    }

    const apts    = membres.map(m => m.aptitude || '');
    const milieu  = root.getMilieuType(answers.milieu);
    const profMax = pal.profMax || 0;

    // ─── Aptitudes manquantes ────────────────────────────────────────────
    // Bloquant : sans aptitude, les règles suivantes (encadrement, profondeur…)
    // seraient non fiables car les catégories (PE/PA/GP/Ens) seraient incomplètes.
    const sans = membres.filter(m => !m.aptitude);
    if (sans.length > 0) {
      issues.push({ tone: 'err', text: `${sans.length} membre(s) sans aptitude sélectionnée — veuillez compléter avant de continuer.` });
      return issues;
    }

    // ─── Catégorisation ──────────────────────────────────────────────────
    const gpMembers   = membres.filter(m => m.aptitude === 'GP');
    const ensMembers  = membres.filter(m => ENS_LEVELS.includes(m.aptitude));
    const peMembers   = membres.filter(m => peLevel(m.aptitude) !== null);
    const paMembers   = membres.filter(m => paLevel(m.aptitude) !== null);
    const baptMembers = membres.filter(m => m.aptitude === 'Baptême');

    // ─── Profondeur max par aptitude ─────────────────────────────────────
    for (const m of membres) {
      if (!m.aptitude) continue;
      const limit = root.aptitudeMaxDepth(m.aptitude);
      if (profMax > limit) {
        issues.push({
          tone: 'err',
          text: `${m.aptitude} de ${m._bapteme ? m.prenom : (m.diver && diverFullName(m.diver))} limité à ${limit}m (palanquée à ${profMax}m).`,
        });
      }
    }

    // ─── Règles GP (guide de palanquée) ──────────────────────────────────
    if (gpMembers.length > 0) {
      const otherApts = apts.filter(a => a !== 'GP');
      const invalid = otherApts.filter(a => {
        const pe = peLevel(a);
        return pe === null || pe > 40;
      });
      if (invalid.length > 0) {
        issues.push({ tone: 'err', text: 'GP : seuls PE20/PE40 sont autorisés pour les encadrés. Pas de PE60, pas de PA, pas d\'enseignant.' });
      }
      const peLevels = [...new Set(peMembers.map(m => peLevel(m.aptitude)))];
      if (peLevels.length > 1) {
        issues.push({ tone: 'err', text: 'GP : tous les encadrés doivent avoir la même prérogative (PE20 ou PE40, pas un mélange).' });
      }
      const maxPE = Math.max(...peMembers.map(m => peLevel(m.aptitude) || 0), 0);
      if (maxPE && profMax > maxPE) {
        issues.push({ tone: 'err', text: `GP avec PE${maxPE} : profondeur max ${maxPE}m.` });
      }
      if (membres.length === 6) {
        const lastApt = membres[membres.length - 1].aptitude;
        if (!['GP', 'E3', 'E4'].includes(lastApt)) {
          issues.push({ tone: 'err', text: 'Serre-file (6e) doit être GP, E3 ou E4.' });
        }
        if (gpMembers.length + ensMembers.filter(m => ['E3', 'E4'].includes(m.aptitude)).length < 2) {
          issues.push({ tone: 'err', text: 'Palanquée à 6 : 2 encadrants minimum (GP + serre-file).' });
        }
      }
      if (peMembers.length > 4) {
        issues.push({ tone: 'err', text: `GP : max 4 encadrés (${peMembers.length} actuellement).` });
      }
    }

    // ─── Règles encadrants E1/E2/E3/E4 (formation) ───────────────────────
    if (ensMembers.length > 0) {
      if (membres.length > 5) {
        issues.push({ tone: 'err', text: `Palanquée formation : max 5 personnes (${membres.length} actuellement).` });
      }
      if (paMembers.length > 0) {
        issues.push({ tone: 'err', text: 'Palanquée formation : aptitudes PA non autorisées (utiliser PE).' });
      }
      const peLevels = [...new Set(peMembers.map(m => peLevel(m.aptitude)))];
      if (peLevels.length > 1) {
        issues.push({ tone: 'err', text: 'Formation : pas de panachage PE20/PE40/PE60 dans une même palanquée.' });
      }
      if (apts.includes('E1')) {
        if (milieu !== 'piscine') issues.push({ tone: 'err', text: 'E1 : formation/baptême uniquement en piscine.' });
        if (profMax > 6)          issues.push({ tone: 'err', text: 'E1 : profondeur max 6 m.' });
        if (baptMembers.length > 2) issues.push({ tone: 'err', text: 'E1 : max 2 baptisés à la fois.' });
      }
      if (apts.includes('E2')) {
        if (!['fosse', 'piscine'].includes(milieu)) issues.push({ tone: 'err', text: 'E2 : enseignement limité piscine ou fosse.' });
        if (profMax > 20) issues.push({ tone: 'err', text: 'E2 : profondeur max 20 m.' });
      }
      if (apts.includes('E3') && !apts.some(a => a === 'E4')) {
        if (profMax > 40) issues.push({ tone: 'err', text: 'E3 (formation) : profondeur max 40 m. Pour PE60, un E4 est requis.' });
        if (apts.includes('PE60')) issues.push({ tone: 'err', text: 'E3 : ne peut pas encadrer un PE60. Seul un E4 le peut.' });
      }
      if (apts.includes('E4')) {
        if (profMax > 60) issues.push({ tone: 'err', text: 'E4 (formation) : profondeur max 60 m (sauf PTH).' });
      }
    }

    // ─── Limite de profondeur du DP ──────────────────────────────────────
    const palTypeForDp = root.getPalType(pal.membres);
    const dpMaxDepth   = root.getDpMaxDepth(palTypeForDp, dp);
    if (dpMaxDepth > 0 && profMax > dpMaxDepth) {
      const ctxLabel = (palTypeForDp === 'formation' || palTypeForDp === 'bapteme')
        ? 'formation' : 'exploration';
      issues.push({ tone: 'err', text: `DP ${answers.dp_qual} : ${ctxLabel} max ${dpMaxDepth} m (palanquée à ${profMax} m).` });
    } else if (dpMaxDepth === 0) {
      issues.push({ tone: 'err', text: `DP ${answers.dp_qual} ne peut pas diriger une palanquée de type ${palTypeForDp}.` });
    }

    // ─── PE sans encadrement ─────────────────────────────────────────────
    if (peMembers.length > 0 && gpMembers.length === 0 && ensMembers.length === 0) {
      if (paMembers.length > 0) {
        issues.push({ tone: 'err', text: 'Panachage PE + PA sans encadrement : une palanquée est soit encadrée (GP ou Enseignant), soit 100 % autonome.' });
      } else {
        issues.push({ tone: 'err', text: 'Plongeurs encadrés (PE) sans encadrement : un GP ou un Enseignant (E1→E4) est obligatoire.' });
      }
    }

    // ─── Règles PA — autonomes ────────────────────────────────────────────
    if (paMembers.length > 0 && gpMembers.length === 0 && ensMembers.length === 0) {
      if (paMembers.length > 3) {
        issues.push({ tone: 'err', text: `Palanquée PA : max 3 plongeurs autonomes (${paMembers.length} actuellement).` });
      }
      const paLevels = [...new Set(paMembers.map(m => paLevel(m.aptitude)))];
      if (paLevels.length > 1) {
        issues.push({ tone: 'err', text: 'Palanquée PA : pas de panachage des prérogatives PA12/PA20/PA40.' });
      }
      if (baptMembers.length > 0) {
        issues.push({ tone: 'err', text: 'Baptême : un encadrant E1→E4 est obligatoire.' });
      }
    }

    // ─── Règles Baptême ──────────────────────────────────────────────────
    if (baptMembers.length > 0) {
      const enc = membres.filter(m => ENS_LEVELS.includes(m.aptitude));
      if (enc.length === 0) {
        issues.push({ tone: 'err', text: 'Baptême : un encadrant E1→E4 est obligatoire.' });
      } else {
        const hasE1E2 = enc.some(m => ['E1', 'E2'].includes(m.aptitude));
        const hasE3E4 = enc.some(m => ['E3', 'E4'].includes(m.aptitude));
        if (hasE1E2 && !hasE3E4 && ['mer', 'lac'].includes(milieu)) {
          issues.push({ tone: 'err', text: 'Baptême en milieu naturel (mer/lac) : encadrant E3 ou E4 requis.' });
        }
      }
      if (profMax > 6) issues.push({ tone: 'err', text: 'Baptême : profondeur max 6 m.' });
    }

    // ─── Licenciés débutants ─────────────────────────────────────────────
    const debutants = membres.filter(m =>
      !m._bapteme && m.diver
      && !m.diver.niveau_plongeur && !m.diver.niveau_encadrant);
    if (debutants.length > 0) {
      if (ensMembers.length === 0) {
        issues.push({ tone: 'err', text: 'Licencié débutant : un enseignant E1→E4 est obligatoire (plongée de formation).' });
      }
      for (const m of debutants) {
        if (m.aptitude && !['Baptême', 'PE20'].includes(m.aptitude)) {
          issues.push({ tone: 'err', text: `Débutant ${diverFullName(m.diver)} : aptitude limitée à Baptême ou PE20.` });
        }
      }
    }

    // ─── Certificats médicaux ────────────────────────────────────────────
    const eventDate = answers.date ? new Date(answers.date) : new Date();
    for (const m of membres) {
      if (m._bapteme) continue;
      if (m.diver?.medical) {
        const expiryDate = new Date(m.diver.medical);
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        if (expiryDate < eventDate) {
          issues.push({
            tone: 'err',
            text: `Certificat médical de ${diverFullName(m.diver)} expiré (émis le ${m.diver.medical}, valable jusqu'au ${expiryDate.toLocaleDateString('fr-FR')}).`,
          });
        }
      }
    }

    // ─── Mélanges respiratoires ──────────────────────────────────────────
    const mlx = pal.melanges || [];
    if (mlx.length === 0) {
      issues.push({ tone: 'warn', text: 'Aucun mélange respiratoire sélectionné pour cette palanquée.' });
    }

    // Cohérence mélange ↔ qualifications du DP
    const dpNitrox    = dp?.nitrox || [];
    const dpTrimix    = dp?.trimix || [];
    const dpNe        = dp?.niveau_encadrant || '';
    const dpHasPNC    = dpNitrox.includes('PN-C');
    const dpHasPTH120 = dpTrimix.includes('PTH-120');
    if ((mlx.includes('Nx ≤ 40%') || mlx.includes('Nx > 40%')) && !dpHasPNC) {
      issues.push({ tone: 'err', text: 'Mélange Nitrox sélectionné : le DP doit être PN-C.' });
    }
    if (mlx.includes('Tx')) {
      if (!dpHasPTH120) {
        issues.push({ tone: 'err', text: 'Mélange Trimix sélectionné : le DP doit être PTH-120.' });
      }
      if (!['E3', 'E4'].includes(dpNe)) {
        issues.push({ tone: 'err', text: 'Mélange Trimix sélectionné : le DP doit être E3 ou E4 (E1/E2 interdits).' });
      }
      const trimixForbidden = membres.filter(m => {
        if (m._bapteme) return true;
        if (!m.diver)   return false;
        const np = m.diver.niveau_plongeur;
        const ne = m.diver.niveau_encadrant;
        return !ne && np !== 'N3';
      });
      if (trimixForbidden.length > 0) {
        const names = trimixForbidden.map(m =>
          m._bapteme ? `${m.prenom || ''} ${(m.nom || '').toUpperCase()}`.trim()
                     : diverFullName(m.diver)
        ).join(', ');
        issues.push({ tone: 'err', text: `Trimix interdit pour N1, N2, débutants et baptêmes : ${names}.` });
      }
      if (apts.includes('GP')) {
        issues.push({ tone: 'err', text: 'Plongée avec GP (palanquée guidée) : Trimix interdit.' });
      }
    }

    // ─── Qualifications individuelles vs mélanges ───────────────────────
    const palType = root.getPalType(pal.membres);
    if (palType === 'exploration' || palType === 'guidee') {
      const needsPN  = mlx.includes('Nx ≤ 40%');
      const needsPNC = mlx.includes('Nx > 40%');
      const needsPTH = mlx.includes('Tx');
      for (const m of membres) {
        if (m._bapteme || !m.diver) continue;
        const nx   = m.diver.nitrox || [];
        const tx   = m.diver.trimix || [];
        const name = diverFullName(m.diver);
        const hasPN  = nx.includes('PN')  || nx.includes('PN-C');
        const hasPNC = nx.includes('PN-C');
        const hasPTH = tx.includes('PTH-70') || tx.includes('PTH-120');
        if (needsPN && !hasPN) {
          issues.push({ tone: 'err', text: `${name} : Nx ≤ 40% nécessite la qualification PN.` });
        }
        if (needsPNC && !hasPNC) {
          issues.push({ tone: 'err', text: `${name} : Nx > 40% nécessite la qualification PN-C.` });
        }
        if (needsPTH && !hasPTH) {
          issues.push({ tone: 'err', text: `${name} : Trimix nécessite au minimum PTH-70.` });
        }
      }
    }

    if (issues.filter(i => i.tone === 'err').length === 0) {
      issues.push({ tone: 'ok', text: `Composition conforme — type : ${palType}.` });
    }
    return issues;
  }

  const api = { validatePal, getMaxEnsLevel, peLevel, paLevel, diverFullName, ENS_LEVELS };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    Object.assign(root, api);
  }
})(typeof window !== 'undefined' ? window : globalThis);
