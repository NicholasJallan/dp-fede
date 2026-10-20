// @ts-check
// DP Assistant — Dictionnaire des articles du Code du sport cités dans l'interface.

// =========================================================================
// CODE DU SPORT — Dictionnaire des articles cités
// Tooltip de résumé + lien Légifrance
// =========================================================================
// Lien vers la section « plongée subaquatique » du Code du sport sur
// Légifrance (LEGISCTA000018751673) : les identifiants d'article individuels
// changent à chaque modification, la section reste stable.
const CDS_SECTION_URL = 'https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006071318/LEGISCTA000018751673/';
const cdsArticle = (title, summary) => ({ title, summary, url: CDS_SECTION_URL });

export const CDS_ARTICLES = {
  'A322-72': cdsArticle('Directeur de plongée — fiche de sécurité',
    'Le DP, présent sur le lieu de mise à l\'eau, organise la plongée, assure la sécurité et déclenche les secours. Il établit une fiche de sécurité (noms, prénoms, aptitudes et fonctions des plongeurs, paramètres prévus et réalisés), conservée un an par l\'établissement. Plongée aux mélanges : DP PN-C ou PTH-120.'),
  'A322-73': cdsArticle('Palanquée — autonomie et âge',
    'Une palanquée regroupe plusieurs plongeurs de mêmes durée, profondeur et trajet ; elle est limitée par le plongeur aux aptitudes les plus restrictives. Autonomie : PA-12 et PA-20 dès 16 ans, PA-40 dès 17 ans ; mineurs autonomes à l\'air et au nitrox uniquement.'),
  'A322-74': cdsArticle('Personne encadrant la palanquée',
    'L\'encadrant justifie d\'une qualification de l\'annexe III-15 b et, en cas de mélange, des aptitudes correspondantes (III-17, III-18).'),
  'A322-76': cdsArticle('Espaces d\'évolution',
    'Espaces 0-6, 0-12, 0-20, 0-40, 0-60, 0-70, 0-80 m et au-delà. Air limité à 60 m ; encadrement au trimix limité à 80 m ; autonomie au trimix limitée à 120 m. La teneur en O₂ du nitrox détermine l\'espace d\'évolution.'),
  'A322-77': cdsArticle('Justification des aptitudes',
    'Le plongeur justifie de ses aptitudes auprès du DP (brevet, carnet de plongée). À défaut, le DP organise leur évaluation. Assistance adaptée possible pour les personnes en situation de handicap (0-40 m).'),
  'A322-78': cdsArticle('Matériel de secours et d\'assistance',
    'Plan de secours ; moyen d\'alerte (VHF en mer au départ d\'une embarcation) ; eau douce ; BAVU + 3 masques ; masque haute concentration ; oxygénothérapie normobare ; couverture isothermique ; fiches d\'évacuation. Assistance : bouteille de secours avec détendeur, moyen de rappel (embarcation), tablette immergeable, tables de décompression au-delà de 6 m.'),
  'A322-80': cdsArticle('Équipement des plongeurs',
    'Manomètre ; système gonflable ; au-delà de 20 m en encadré et pour tout autonome : source d\'air de secours sans partage d\'embout et moyens de contrôle de la plongée ; encadrant : deux sorties et deux détendeurs ; un parachute de palier par palanquée.'),
  'A322-92': cdsArticle('Pression partielle d\'oxygène',
    'PpO₂ inspirée comprise entre 0,16 bar et 1,6 bar.'),
  'A322-93': cdsArticle('Identification des bouteilles',
    'Fiche d\'identification de chaque bouteille de mélange : pression, % O₂ analysé, profondeur maximale d\'utilisation, date d\'analyse, nom ou initiales de l\'utilisateur.'),
  'A322-94': cdsArticle('Plongée en recycleur',
    'Recycleurs certifiés ; formation qualifiante adaptée ; au-delà de 6 m, système respiratoire de secours en circuit ouvert ; pour l\'encadrant, secours indépendant du recycleur.'),
  'A322-95': cdsArticle('Plongée au nitrox',
    'Aptitudes nitrox (annexe III-17 a) pour les plongeurs et l\'encadrant ; conditions de pratique aux annexes III-17 b et c.'),
  'A322-97': cdsArticle('Plongée au trimix / héliox — matériel',
    'Ligne lestée de descente et de remontée ; copie des planifications ; support logistique ou embarcation avec une personne habilitée à la manœuvrer.'),
  'A322-98': cdsArticle('Piscine et fosse',
    'Bassin de plus de 6 m : règles du milieu naturel. Bassin de 6 m au plus : DP E1 minimum, PE-12 autorisés en autonomie, baptêmes par GP ou P4, fiche de sécurité facultative.'),
};

// Parse "Art. A322-72" ou "CdS A322-89/91" → ['A322-72'] ou ['A322-89','A322-91']
export function parseCdsRefs(text) {
  if (!text) return [];
  const refs = [];
  const re = /A322-(\d+(?:-\d+)?)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    refs.push('A322-' + m[1]);
  }
  return refs;
}
