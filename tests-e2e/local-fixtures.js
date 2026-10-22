// @ts-check
// Données et backend simulé du smoke test local (tests-e2e/local-smoke.spec.js).
//
// Le backend est un petit état en mémoire : POST / PATCH / DELETE sur
// /api/dives modifient réellement la plongée, que GET /api/dives et
// GET /api/dives/:id renvoient ensuite. Le passage à status 'archived' est
// donc vérifiable comme sur le vrai serveur (confirmation d'archivage).
// Les scripts tiers (Google Identity Services, Maps, Google Fonts) reçoivent
// des réponses vides : aucun réseau externe.
//
// Socle club (docs/api-club.md) : club courant, membres, invitations,
// changement de club, alertes, statistiques, import de l'annuaire, PDF
// archivés, export et suppression du compte. L'en-tête X-DP-Club de chaque
// requête est relevé dans state.clubHeaders. Comme le vrai serveur, un club
// de state.revokedClubs dans X-DP-Club répond 403 CLUB_NOT_MEMBER ;
// state.unauthorized fait répondre 401 aux routes hors /api/auth/*.

const pad = (n) => String(n).padStart(2, '0');
const localInput = (t) =>
  `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
const hhmm = (t) => `${pad(t.getHours())}:${pad(t.getMinutes())}`;
const minutesAgo = (n) => new Date(Date.now() - n * 60_000);

const CLUB_ID = '0b9d2c8e-1111-4aaa-8bbb-000000000001';
const OTHER_CLUB_ID = '0b9d2c8e-2222-4aaa-8bbb-000000000002';
const INVITATION_TOKEN = 'a'.repeat(64);
const MISMATCH_TOKEN = 'b'.repeat(64);

const USER = {
  id: 'u-1',
  email: 'dp.test@example.org',
  prenom: 'Test',
  nom: 'DP',
  role: 'user',
  club_id: CLUB_ID,
  club_role: 'responsable',
  club_count: 2,
  club_nom: 'Club Test',
  structure_type: 'club',
  urgence_defaut: '112',
};

const diver = (id, nom, prenom, extra) => ({
  id,
  nom,
  prenom,
  nitrox: [],
  trimix: [],
  aptitudes_sup: [],
  medical: '2026-09-01',
  licence: `A-29-${id}`,
  date_naissance: '1990-05-14',
  ...extra,
});

const DIVERS = [
  diver('d-dp', 'MARTIN', 'Paul', { niveau_encadrant: 'E3', nitrox: ['PN', 'PN-C'] }),
  diver('d-gp', 'DURAND', 'Léa', { niveau_encadrant: 'N4' }),
  diver('d-n2', 'BERNARD', 'Hugo', { niveau_plongeur: 'N2' }),
  diver('d-n3', 'LEROY', 'Inès', { niveau_plongeur: 'N3' }),
  // Sans date de naissance : saisie rapide proposée à l'ajout en palanquée.
  diver('d-n1', 'PETIT', 'Zoé', { niveau_plongeur: 'N1', date_naissance: null }),
  diver('d-e2', 'ROUX', 'Marc', { niveau_encadrant: 'E2' }),
];

const SITE_LAC = {
  id: 's-1',
  nom: 'Lac de Test',
  milieu: 'Lac',
  profondeur_max: 40,
  depart_bord: true,
  depart_bateau: false,
  pays: 'Suisse',
  pays_code: 'CH',
  coordonnees: { lat: 46.2, lng: 7.3 },
  acces_secours: 'Parking du lac',
  caisson: 'HUG Genève',
};
const SITE_CARRIERE = {
  id: 's-2',
  nom: 'Carrière du Test',
  milieu: 'Carrière',
  profondeur_max: 30,
  depart_bord: true,
  depart_bateau: false,
  pays: 'France',
  pays_code: 'FR',
  coordonnees: { lat: 45.7, lng: 4.8 },
  acces_secours: 'Portail nord',
  caisson: 'Hôpital Édouard-Herriot, Lyon',
};
const SITES = [SITE_LAC, SITE_CARRIERE];

function baseAnswers(site, date) {
  return {
    date,
    site_id: site.id,
    site_nom: site.nom,
    milieu: site.milieu,
    site_pays_code: site.pays_code,
    site_prof_max: site.profondeur_max,
    dp_id: 'd-dp',
    dp_nom: 'Paul MARTIN',
    dp_qual: 'E3',
    air: true,
    depart_bord: true,
    prof_max: '20 m',
    urgence_num: site.pays_code === 'CH' ? '144' : '18',
    site_acces_secours: site.acces_secours,
    site_caisson: site.caisson,
    site_coords: site.coordonnees,
  };
}

const pal = (id, nom, membres, extra = {}) => ({
  id,
  nom,
  mode: 'exploration',
  membres,
  profMax: 20,
  duree: 40,
  dtr: 3,
  melanges: ['Air'],
  ...extra,
});

// Plongées de départ :
//   prepared  — palanquée déjà sortie (heures posées) : débloque fiche → archivage ;
//   blocked   — préparée, une palanquée conforme et une bloquée (aptitudes non justifiées) ;
//   live      — en cours : P1 sortie, P2 à l'eau depuis 12 min, P3 en surface ;
//   archived  — archivée, déposée sur Drive.
function seedDives(now) {
  const date = localInput(now);
  const yesterday = localInput(new Date(now.getTime() - 24 * 3600_000));
  return [
    {
      id: 'srv-1',
      client_uuid: '11111111-1111-4111-8111-111111111111',
      status: 'prepared',
      planned_at: date,
      answers: baseAnswers(SITE_LAC, date),
      palanquees: [
        pal('p1', 'Palanquée 1 Léa', [
          { diverId: 'd-gp', aptitude: 'GP' },
          { diverId: 'd-n2', aptitude: 'PE40' },
        ]),
      ],
      render_state: { heuresDebut: { p1: '10:00' }, heuresFin: { p1: '10:40' } },
    },
    {
      id: 'srv-2',
      client_uuid: '22222222-2222-4222-8222-222222222222',
      status: 'prepared',
      planned_at: date,
      answers: { ...baseAnswers(SITE_CARRIERE, date), site_nom: 'Carrière, groupe technique' },
      palanquees: [
        pal(
          'p1',
          'Palanquée 1 Marc',
          [
            { diverId: 'd-e2', aptitude: 'GP' },
            { diverId: 'd-n3', aptitude: 'PE40' },
          ],
          { dtr: null },
        ),
        pal(
          'p2',
          'Palanquée 2',
          [
            { diverId: 'd-n2', aptitude: 'PA60' },
            { diverId: 'd-n1', aptitude: 'PA20' },
          ],
          { profMax: 30 },
        ),
      ],
      render_state: {},
    },
    {
      id: 'srv-3',
      client_uuid: '33333333-3333-4333-8333-333333333333',
      status: 'in_progress',
      planned_at: date,
      started_at: minutesAgo(50).toISOString(),
      answers: { ...baseAnswers(SITE_LAC, date), site_nom: 'Lac de Test, plongée du matin' },
      palanquees: [
        pal('p1', 'Palanquée 1 Léa', [
          { diverId: 'd-gp', aptitude: 'GP' },
          { diverId: 'd-n2', aptitude: 'PE40' },
        ]),
        pal(
          'p2',
          'Palanquée 2 Marc',
          [
            { diverId: 'd-e2', aptitude: 'GP' },
            { diverId: 'd-n3', aptitude: 'PE40' },
            { diverId: 'd-n1', aptitude: 'PE20' },
          ],
          { profMax: 18, duree: 35, dtr: 2 },
        ),
        pal(
          'p3',
          'Palanquée 3',
          [
            { diverId: 'd-dp', aptitude: 'PA60' },
            { diverId: 'd-n3', aptitude: 'PA40' },
          ],
          { profMax: 35, duree: 30, dtr: 6 },
        ),
      ],
      render_state: {
        heuresDebut: { p1: hhmm(minutesAgo(50)), p2: hhmm(minutesAgo(12)) },
        heuresFin: { p1: hhmm(minutesAgo(8)) },
        realises: { p1: { duree: '42', profMax: '19', dtr: '3', commentaire: 'Visibilité réduite sous 15 m.' } },
        pressions: { 'p1-d-gp': '70', 'p1-d-n2': '60' },
      },
    },
    {
      id: 'srv-4',
      client_uuid: '44444444-4444-4444-8444-444444444444',
      status: 'archived',
      planned_at: yesterday,
      drive_link: 'https://drive.google.com/file/d/test',
      documents_status: 'ok',
      answers: { ...baseAnswers(SITE_CARRIERE, yesterday), site_nom: 'Carrière, sortie club' },
      palanquees: [
        pal('p1', 'Palanquée 1', [
          { diverId: 'd-gp', aptitude: 'GP' },
          { diverId: 'd-n2', aptitude: 'PE40' },
        ]),
      ],
      render_state: {},
    },
  ];
}

function summaryOf(d) {
  const pals = d.palanquees || [];
  return {
    id: d.id,
    client_uuid: d.client_uuid,
    status: d.status,
    site_nom: d.site_nom || d.answers?.site_nom || '',
    planned_at: d.planned_at || d.answers?.date,
    date_plongee: d.date_plongee || d.answers?.date || d.planned_at,
    started_at: d.started_at || null,
    dp_nom: d.answers?.dp_nom || d.dp_nom || '',
    dp_qual: d.answers?.dp_qual || d.dp_qual || '',
    activite: d.activite || '',
    drive_link: d.drive_link || '',
    nb_palanquees: pals.length,
    nb_plongeurs: pals.reduce((n, p) => n + (p.membres?.length || 0), 0),
    documents_status: d.documents_status ?? null,
  };
}

const ok = (data, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify({ ok: true, data }),
});
const fail = (status, error) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify({ ok: false, error }),
});

function findDive(state, key) {
  return state.dives.find((d) => !d.deleted && (d.id === key || d.client_uuid === key));
}

function diveRoute(method, path, search, body, state) {
  if (path === '/api/dives' && method === 'GET')
    return ok(search ? [] : state.dives.filter((d) => !d.deleted).map(summaryOf));
  if (path === '/api/dives' && method === 'POST') {
    const existing = findDive(state, body.client_uuid);
    if (existing) return ok({ id: existing.id, duplicate: true });
    const created = { ...body, id: `srv-new-${state.dives.length + 1}` };
    state.dives.push(created);
    return ok({ id: created.id, duplicate: false }, 201);
  }
  const docs = /^\/api\/dives\/([^/]+)\/documents(?:\/([a-z]+))?$/.exec(path);
  if (docs) return documentsRoute(method, decodeURIComponent(docs[1]), docs[2], state);
  const key = decodeURIComponent(path.slice('/api/dives/'.length));
  const dive = findDive(state, key);
  if (!dive) return fail(404, 'Plongée introuvable');
  if (method === 'GET') return ok({ ...dive, ...summaryOf(dive) });
  if (method === 'PATCH') {
    if (state.rejectArchive && body.status === 'archived')
      return fail(422, 'Palanquée P1 incomplète : heure de sortie manquante.');
    // Archivage : le serveur génère et conserve les PDF (A322-72).
    if (body.status === 'archived' && dive.status !== 'archived') body = { ...body, documents_status: 'ok' };
    Object.assign(dive, body);
    return ok({ id: dive.id });
  }
  if (method === 'DELETE') {
    dive.deleted = true;
    return ok(null);
  }
  return ok(null);
}

// ── Socle club ──────────────────────────────────────────────────────────

const DOCUMENTS = [
  { type: 'fiche', sha256: 'f'.repeat(64), bytes: 61002, created_at: '2026-10-19T18:01:11' },
  { type: 'checklist', sha256: 'c'.repeat(64), bytes: 48211, created_at: '2026-10-19T18:01:12' },
];

function documentsRoute(method, key, type, state) {
  const dive = findDive(state, key);
  if (!dive) return fail(404, 'Plongée introuvable');
  if (method === 'POST') {
    state.regenerations.push(dive.id);
    dive.documents_status = 'ok';
    return ok({ dive_id: dive.id, status: 'ok', documents: DOCUMENTS });
  }
  if (!type)
    return ok({
      dive_id: dive.id,
      status: dive.documents_status ?? null,
      updated_at: null,
      documents: dive.documents_status === 'ok' ? DOCUMENTS : [],
    });
  state.downloads.push(`${dive.id}/${type}`);
  return {
    status: 200,
    contentType: 'application/pdf',
    headers: { 'Content-Disposition': `attachment; filename="2026-10-19-${type}-carriere.pdf"` },
    body: '%PDF-1.4\n%test\n',
  };
}

const PERMS = {
  responsable: [
    'club.read',
    'club.manage',
    'members.read',
    'divers.read',
    'divers.write',
    'divers.import',
    'sites.read',
    'sites.write',
    'dives.read',
    'dives.write',
    'documents.read',
    'documents.generate',
    'alerts.read',
    'stats.read',
  ],
  lecture: ['club.read', 'members.read', 'divers.read', 'sites.read', 'dives.read', 'documents.read', 'stats.read'],
};

function clubPayload(state) {
  const club = state.clubs[state.currentClub];
  const all = PERMS.responsable;
  return {
    club,
    role: state.role,
    permissions: Object.fromEntries(all.map((p) => [p, (PERMS[state.role] || all).includes(p)])),
    counts: { members: state.members.length, divers: DIVERS.length, sites: SITES.length, dives: 4, dives_archived: 1 },
    clubs_count: Object.keys(state.clubs).length,
  };
}

function seedClub() {
  return {
    [CLUB_ID]: {
      id: CLUB_ID,
      nom: 'Club Test',
      numero_ffessm: '06123456',
      siret: '',
      structure_type: 'club',
      president_prenom: 'Anne',
      president_nom: 'Martin',
      president_tel: '0600000000',
      urgence_defaut: '112',
      created_at: '2026-01-10T09:00:00',
      updated_at: '2026-10-20T09:00:00',
    },
    [OTHER_CLUB_ID]: {
      id: OTHER_CLUB_ID,
      nom: 'Bulles du Lac',
      numero_ffessm: '06999999',
      siret: '',
      structure_type: 'club',
      president_prenom: '',
      president_nom: '',
      president_tel: '',
      urgence_defaut: '144',
      created_at: '2026-03-01T09:00:00',
      updated_at: '2026-03-01T09:00:00',
    },
  };
}

const MEMBERS = [
  {
    user_id: 1,
    role: 'responsable',
    nom: 'DP',
    prenom: 'Test',
    email: 'dp.test@example.org',
    joined_at: '2026-01-10T09:00:00',
    last_seen_at: '2026-10-20T08:00:00',
    is_me: true,
  },
  {
    user_id: 2,
    role: 'dp',
    nom: 'Martin',
    prenom: 'Paul',
    email: 'paul.martin@example.org',
    joined_at: '2026-02-01T09:00:00',
    last_seen_at: '2026-10-18T19:00:00',
    is_me: false,
  },
  {
    user_id: 3,
    role: 'encadrant',
    nom: 'Roux',
    prenom: 'Marc',
    email: 'marc.roux@example.org',
    joined_at: '2026-04-12T09:00:00',
    last_seen_at: null,
    is_me: false,
  },
];

const ALERTS = {
  season: '2026-2027',
  days: 30,
  counts: { caci_expire: 2, licence_expire_bientot: 1, autorisation_parentale_manquante: 1 },
  items: [
    {
      diver_id: 'd-n2',
      nom: 'BERNARD',
      prenom: 'Hugo',
      type: 'caci_expire',
      severity: 'error',
      date: '2026-10-01',
      days: -19,
    },
    {
      diver_id: 'd-n1',
      nom: 'PETIT',
      prenom: 'Zoé',
      type: 'autorisation_parentale_manquante',
      severity: 'error',
      date: null,
      days: null,
      season: '2026-2027',
      age: 14,
    },
    {
      diver_id: 'd-n3',
      nom: 'LEROY',
      prenom: 'Inès',
      type: 'caci_expire',
      severity: 'error',
      date: '2026-09-02',
      days: -48,
    },
    {
      diver_id: 'd-n2',
      nom: 'BERNARD',
      prenom: 'Hugo',
      type: 'licence_expire_bientot',
      severity: 'warn',
      date: '2026-11-01',
      days: 12,
    },
  ],
};

const STATS = {
  from: '2026-09-15',
  to: '2027-09-14',
  plongees: 31,
  palanquees: 88,
  palanquees_par_type: { exploration: 40, guidee: 21, formation: 22, bapteme: 5 },
  plongees_par_type: { exploration: 25, guidee: 15, formation: 14, bapteme: 4 },
  plongeurs_distincts: 57,
  baptemes: 9,
  participations: 260,
  heures_cumulees: 198.5,
  par_plongeur: [
    { diver_id: 'd-gp', nom: 'DURAND', prenom: 'Léa', licence: 'A-29-d-gp', plongees: 12, dp: 3, heures: 9.5 },
    { diver_id: 'd-n2', nom: 'BERNARD', prenom: 'Hugo', licence: 'A-29-d-n2', plongees: 8, dp: 0, heures: 6.25 },
  ],
};

function importReport(dryRun) {
  return {
    profile: 'auto',
    source: 'csv',
    format: 'csv',
    encoding: 'UTF-8 (BOM)',
    separator: ';',
    columns: {
      recognized: { Nom: 'nom', Prénom: 'prenom', 'N° licence': 'licence', CACI: 'medical' },
      ignored: ['Email'],
    },
    dry_run: dryRun,
    total: 4,
    created: 1,
    updated: 1,
    unchanged: 1,
    errors: [{ line: 4, message: 'Date invalide pour caci : « 31/02/2026 »' }],
    warnings: [{ line: 3, message: 'Qualification trimix : PN-C ajouté (prérequis)' }],
    items: [
      {
        line: 2,
        action: 'create',
        diver_id: 'd-new',
        nom: 'Dupont',
        prenom: 'Jean',
        changes: ['nom', 'prenom', 'licence', 'medical'],
      },
      {
        line: 3,
        action: 'update',
        diver_id: 'd-n3',
        nom: 'LEROY',
        prenom: 'Inès',
        changes: ['medical', 'external_id', 'source'],
      },
      { line: 5, action: 'unchanged', diver_id: 'd-n1', nom: 'PETIT', prenom: 'Zoé', changes: [] },
    ],
  };
}

function invitationRoute(method, path, body, state) {
  if (path === '/api/club/invitations' && method === 'GET') return ok(state.invitations);
  if (path === '/api/club/invitations' && method === 'POST') {
    const inv = {
      id: `inv-${state.invitations.length + 1}`,
      email: body.email,
      role: body.role || 'dp',
      status: 'pending',
      expires_at: '2026-10-27T10:00:00',
      created_at: '2026-10-20T10:00:00',
      accepted_at: null,
      invited_by: 1,
    };
    state.invitations = [inv, ...state.invitations.filter((i) => i.email !== inv.email)];
    const token = 'c'.repeat(64);
    return ok({ ...inv, token, url: `https://dp-fede.bullesenvalais.ch/#invitation=${token}` }, 201);
  }
  if (path === '/api/club/invitations/preview' || path === '/api/club/invitations/accept') {
    if (body.token !== INVITATION_TOKEN && body.token !== MISMATCH_TOKEN) return fail(404, 'Invitation inconnue');
    const matches = body.token === INVITATION_TOKEN;
    if (path.endsWith('/preview')) {
      return ok({
        club_id: OTHER_CLUB_ID,
        club_nom: 'Bulles du Lac',
        role: 'dp',
        email: matches ? USER.email : 'autre.personne@example.org',
        status: 'pending',
        expires_at: '2026-10-27T10:00:00',
        email_matches: matches,
        already_member: false,
      });
    }
    if (!matches) return fail(403, 'Cette invitation est destinée à une autre adresse e-mail');
    state.currentClub = OTHER_CLUB_ID;
    state.accepted = true;
    return ok({ ...clubPayload(state), removed_empty_clubs: [] });
  }
  const m = /^\/api\/club\/invitations\/(.+)$/.exec(path);
  if (m && method === 'DELETE') {
    state.invitations = state.invitations.filter((i) => i.id !== m[1]);
    return ok({ id: m[1], revoked: true });
  }
  return fail(404, 'Route inconnue');
}

function memberRoute(method, path, body, state) {
  if (path === '/api/club/members') return ok({ members: state.members, invitations: state.invitations });
  const id = Number(path.split('/').pop());
  if (method === 'PATCH') {
    state.members = state.members.map((mb) => (mb.user_id === id ? { ...mb, role: body.role } : mb));
    return ok({ user_id: id, role: body.role });
  }
  state.members = state.members.filter((mb) => mb.user_id !== id);
  return ok({ user_id: id, removed: true });
}

function clubRoute(method, path, search, body, state) {
  if (path === '/api/club' && method === 'GET') return ok(clubPayload(state));
  if (path === '/api/club' && method === 'PATCH') {
    Object.assign(state.clubs[state.currentClub], body);
    return ok(clubPayload(state));
  }
  if (path === '/api/club/memberships') {
    return ok({
      current_club_id: state.currentClub,
      clubs: Object.values(state.clubs).map((c) => ({
        club_id: c.id,
        nom: c.nom,
        numero_ffessm: c.numero_ffessm,
        role: c.id === CLUB_ID ? state.role : 'dp',
        joined_at: c.created_at,
        members_count: c.id === CLUB_ID ? state.members.length : 5,
        current: c.id === state.currentClub,
      })),
    });
  }
  if (path === '/api/club/switch') {
    state.currentClub = body.club_id;
    return ok(clubPayload(state));
  }
  if (path.startsWith('/api/club/members')) return memberRoute(method, path, body, state);
  if (path.startsWith('/api/club/invitations')) return invitationRoute(method, path, body, state);
  if (path === '/api/club/alerts') return ok(ALERTS);
  if (path === '/api/club/stats') {
    if (search.includes('format=csv')) {
      return {
        status: 200,
        contentType: 'text/csv; charset=utf-8',
        headers: { 'Content-Disposition': 'attachment; filename="statistiques-2026-09-15-2027-09-14.csv"' },
        body: '\ufeffIndicateur;Valeur\nPlongées;31\n',
      };
    }
    return ok(STATS);
  }
  return fail(404, 'Route club inconnue');
}

function accountRoute(method, state) {
  if (method === 'GET')
    return ok({ format: 'dp-assistant-export/2', user: { email: USER.email }, clubs: [], divers: [] });
  if (state.deleteConflict) {
    return fail(
      409,
      "Vous êtes le seul responsable du club « Club Test », qui compte d'autres membres : confiez le rôle de responsable à un autre membre ou supprimez le club avant de supprimer votre compte",
    );
  }
  state.deleted = true;
  return ok({
    deleted: true,
    retained: { fiches: 3, until: '2027-07-14', clubs: 1 },
    message:
      "3 fiches de sécurité archivées conservées jusqu'au 14/07/2027 (obligation légale de conservation d'un an, art. A322-72 du Code du sport), puis supprimées automatiquement. Les autres données ont été supprimées.",
  });
}

function currentUser(state) {
  if (state.deleted) return null;
  const club = state.clubs[state.currentClub];
  return {
    ...USER,
    club_id: club.id,
    club_nom: club.nom,
    club_role: state.currentClub === CLUB_ID ? state.role : 'dp',
  };
}

function apiResponse(method, path, search, body, state) {
  if (path === '/api/auth/me') return ok(currentUser(state));
  if (path === '/api/auth/google') return ok(currentUser(state));
  if (path === '/api/divers/import') {
    const dryRun = search.includes('dry_run=1');
    state.imports.push(dryRun ? 'dry_run' : 'apply');
    return ok(importReport(dryRun));
  }
  if (path === '/api/divers') return ok(DIVERS);
  if (method === 'PUT' && path.startsWith('/api/divers/')) {
    state.diverUpdates.push({ id: path.split('/').pop(), ...body });
    return ok({ id: path.split('/').pop(), ...body });
  }
  if (path === '/api/sites') return ok(SITES);
  if (path === '/api/sync/state')
    return ok({ club_id: state.currentClub, club_role: state.role, divers: {}, sites: {}, dives: {} });
  if (path.startsWith('/api/dives')) return diveRoute(method, path, search, body, state);
  if (path.startsWith('/api/club')) return clubRoute(method, path, search, body, state);
  if (path === '/api/account' || path === '/api/account/export') return accountRoute(method, state);
  return ok(null);
}

function newState() {
  return {
    offline: false,
    rejectArchive: false,
    realFonts: false,
    calls: [],
    clubHeaders: [],
    dives: seedDives(new Date()),
    clubs: seedClub(),
    currentClub: CLUB_ID,
    role: 'responsable',
    members: MEMBERS.map((mb) => ({ ...mb })),
    invitations: [
      {
        id: 'inv-0',
        email: 'invite.attente@example.org',
        role: 'encadrant',
        status: 'pending',
        expires_at: '2026-10-25T10:00:00',
        created_at: '2026-10-18T10:00:00',
        accepted_at: null,
        invited_by: 1,
      },
    ],
    imports: [],
    diverUpdates: [],
    downloads: [],
    deleteConflict: false,
    deleted: false,
    accepted: false,
    revokedClubs: [],
    unauthorized: false,
    regenerations: [],
  };
}

// Installe les mocks réseau. `state.offline = true` fait échouer /api/**.
async function mockBackend(context, state) {
  await context.route(
    /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|accounts\.google\.com|maps\.googleapis\.com)\//,
    (route) => {
      const url = route.request().url();
      const isFont = /fonts\.(googleapis|gstatic)\.com/.test(url);
      // Captures : vraies polices si le réseau le permet (sinon repli système).
      if (isFont && state.realFonts) return route.continue().catch(() => route.abort());
      const css = url.includes('fonts.googleapis.com');
      return route.fulfill({ status: 200, contentType: css ? 'text/css' : 'application/javascript', body: '' });
    },
  );
  // Prédicat (et non un glob **/api/**) : l'URL Maps contient aussi « /api/ ».
  const isAppApi = (url) => url.hostname === '127.0.0.1' && url.pathname.startsWith('/api/');
  await context.route(isAppApi, (route) => {
    if (state.offline) return route.abort('internetdisconnected');
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    state.calls.push(`${method} ${url.pathname}`);
    const club = req.headers()['x-dp-club'];
    if (club) state.clubHeaders.push({ call: `${method} ${url.pathname}`, club });
    if (method === 'HEAD') return route.fulfill({ status: 200, body: '' });
    const json = (status, payload) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    if (club && state.revokedClubs.includes(club)) {
      return json(403, { ok: false, error: "Vous n'êtes pas membre de ce club", code: 'CLUB_NOT_MEMBER' });
    }
    if (state.unauthorized && !url.pathname.startsWith('/api/auth/')) {
      return json(401, { ok: false, error: 'Non authentifié' });
    }
    let body;
    try {
      body = req.postDataJSON() || {};
    } catch {
      body = {};
    }
    return route.fulfill(apiResponse(method, url.pathname, url.search, body, state));
  });
}

module.exports = {
  USER,
  DIVERS,
  SITES,
  CLUB_ID,
  OTHER_CLUB_ID,
  INVITATION_TOKEN,
  MISMATCH_TOKEN,
  newState,
  mockBackend,
};
