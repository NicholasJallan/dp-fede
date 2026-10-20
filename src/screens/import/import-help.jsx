// DP Assistant — Aide « format attendu » de l'import (résumé de
// docs/import-plongeurs.md).

import React from 'react';
import { Icon } from '../../components/icons.jsx';

const EXAMPLE = `Nom;Prénom;N° licence;Date de naissance;Niveau;Niveau encadrant;Nitrox;CACI;Fin de licence;Identifiant externe
Dupont;Jean;A-123456;12/03/1985;N3;MF1;PN-C;2026-02-01;14/09/2027;1042
Petit;Léa;A-654321;05/06/2012;N1;;;15/09/2026;14/09/2027;1043`;

export function ImportHelp() {
  return (
    <details className="help-block">
      <summary>
        <Icon.ChevronDown />
        Format attendu du fichier
      </summary>
      <div className="help-body">
        <ul>
          <li>
            Fichier <b>CSV</b>, 1 Mo et 2 000 lignes au maximum ; <b>première ligne = en-têtes</b>.
          </li>
          <li>
            Encodage UTF-8 (avec ou sans BOM) ou Windows-1252 (export Excel) ; séparateur <code>;</code>, <code>,</code>{' '}
            ou tabulation, détecté automatiquement.
          </li>
          <li>
            Seule la colonne <b>Nom</b> est obligatoire. Colonnes reconnues : Prénom, N° licence, Date de naissance,
            Niveau, Niveau encadrant, Nitrox, Trimix, CACI (date du certificat médical, seule donnée de santé), Fin de
            licence, Identifiant externe, Représentant légal, Autorisation parentale (<code>2026-2027</code>). Les
            autres colonnes sont ignorées.
          </li>
          <li>
            Dates : <code>JJ/MM/AAAA</code>, <code>AAAA-MM-JJ</code>, <code>JJ.MM.AAAA</code>… Niveaux : N1 à N3, GP
            (N4), DP (N5), E1 à E4, Initiateur, MF1, MF2. Nitrox : PN, PN-C. Trimix : PTH-40, PTH-70, PTH-120.
          </li>
          <li>
            <b>Cellule vide = aucune modification</b> : l'import ne vide jamais un champ. Pour effacer une valeur,
            passez par la fiche du plongeur.
          </li>
          <li>
            Rapprochement, dans l'ordre : identifiant externe (même source), n° de licence, puis nom + prénom.
            Réimporter le même fichier ne modifie rien.
          </li>
          <li>
            Les lignes en erreur sont ignorées ; les autres sont appliquées en une seule fois, après confirmation.
          </li>
        </ul>
        <p>
          Profil « VPDive » : intitulés de colonnes <b>supposés</b> (VPDive ne publie pas son format), à vérifier sur un
          vrai export.
        </p>
        <p>Exemple :</p>
        <pre tabIndex={0} aria-label="Exemple de fichier CSV">
          {EXAMPLE}
        </pre>
      </div>
    </details>
  );
}
