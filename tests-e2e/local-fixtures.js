// @ts-check
// Données et backend simulé du smoke test local (tests-e2e/local-smoke.spec.js).
//
// Le backend est un petit état en mémoire : POST / PATCH / DELETE sur
// /api/dives modifient réellement la plongée, que GET /api/dives et
// GET /api/dives/:id renvoient ensuite. Le passage à status 'archived' est
// donc vérifiable comme sur le vrai serveur (confirmation d'archivage).
// Les scripts tiers (Google Identity Services, Maps, Google Fonts) reçoivent
// des réponses vides : aucun réseau externe.

const pad = (n) => String(n).padStart(2, '0');
const localInput = (t) => `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
const hhmm = (t) => `${pad(t.getHours())}:${pad(t.getMinutes())}`;
const minutesAgo = (n) => new Date(Date.now() - n * 60_000);

const USER = {
  id: 'u-1', email: 'dp.test@example.org', prenom: 'Test', nom: 'DP', role: 'admin',
  club_nom: 'Club Test', structure_type: 'club', urgence_defaut: '112',
};

const diver = (id, nom, prenom, extra) => ({
  id, nom, prenom, nitrox: [], trimix: [], aptitudes_sup: [], medical: '2026-09-01', licence: `A-29-${id}`, ...extra,
});

const DIVERS = [
  diver('d-dp', 'MARTIN', 'Paul', { niveau_encadrant: 'E3', nitrox: ['PN', 'PN-C'] }),
  diver('d-gp', 'DURAND', 'Léa', { niveau_encadrant: 'N4' }),
  diver('d-n2', 'BERNARD', 'Hugo', { niveau_plongeur: 'N2' }),
  diver('d-n3', 'LEROY', 'Inès', { niveau_plongeur: 'N3' }),
  diver('d-n1', 'PETIT', 'Zoé', { niveau_plongeur: 'N1' }),
  diver('d-e2', 'ROUX', 'Marc', { niveau_encadrant: 'E2' }),
];

const SITE_LAC = {
  id: 's-1', nom: 'Lac de Test', milieu: 'Lac', profondeur_max: 40, depart_bord: true, depart_bateau: false,
  pays: 'Suisse', pays_code: 'CH', coordonnees: { lat: 46.2, lng: 7.3 },
  acces_secours: 'Parking du lac', caisson: 'HUG Genève',
};
const SITE_CARRIERE = {
  id: 's-2', nom: 'Carrière du Test', milieu: 'Carrière', profondeur_max: 30, depart_bord: true, depart_bateau: false,
  pays: 'France', pays_code: 'FR', coordonnees: { lat: 45.7, lng: 4.8 },
  acces_secours: 'Portail nord', caisson: 'Hôpital Édouard-Herriot, Lyon',
};
const SITES = [SITE_LAC, SITE_CARRIERE];

function baseAnswers(site, date) {
  return {
    date, site_id: site.id, site_nom: site.nom, milieu: site.milieu, site_pays_code: site.pays_code,
    site_prof_max: site.profondeur_max, dp_id: 'd-dp', dp_nom: 'Paul MARTIN', dp_qual: 'E3', air: true,
    depart_bord: true, prof_max: '20 m', urgence_num: site.pays_code === 'CH' ? '144' : '18',
    site_acces_secours: site.acces_secours, site_caisson: site.caisson, site_coords: site.coordonnees,
  };
}

const pal = (id, nom, membres, extra = {}) => ({
  id, nom, mode: 'exploration', membres, profMax: 20, duree: 40, dtr: 3, melanges: ['Air'], ...extra,
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
      id: 'srv-1', client_uuid: '11111111-1111-4111-8111-111111111111', status: 'prepared', planned_at: date,
      answers: baseAnswers(SITE_LAC, date),
      palanquees: [pal('p1', 'Palanquée 1 Léa', [{ diverId: 'd-gp', aptitude: 'GP' }, { diverId: 'd-n2', aptitude: 'PE40' }])],
      render_state: { heuresDebut: { p1: '10:00' }, heuresFin: { p1: '10:40' } },
    },
    {
      id: 'srv-2', client_uuid: '22222222-2222-4222-8222-222222222222', status: 'prepared', planned_at: date,
      answers: { ...baseAnswers(SITE_CARRIERE, date), site_nom: 'Carrière, groupe technique' },
      palanquees: [
        pal('p1', 'Palanquée 1 Marc', [{ diverId: 'd-e2', aptitude: 'GP' }, { diverId: 'd-n3', aptitude: 'PE40' }], { dtr: null }),
        pal('p2', 'Palanquée 2', [{ diverId: 'd-n2', aptitude: 'PA60' }, { diverId: 'd-n1', aptitude: 'PA20' }], { profMax: 30 }),
      ],
      render_state: {},
    },
    {
      id: 'srv-3', client_uuid: '33333333-3333-4333-8333-333333333333', status: 'in_progress', planned_at: date,
      started_at: minutesAgo(50).toISOString(),
      answers: { ...baseAnswers(SITE_LAC, date), site_nom: 'Lac de Test, plongée du matin' },
      palanquees: [
        pal('p1', 'Palanquée 1 Léa', [{ diverId: 'd-gp', aptitude: 'GP' }, { diverId: 'd-n2', aptitude: 'PE40' }]),
        pal('p2', 'Palanquée 2 Marc', [{ diverId: 'd-e2', aptitude: 'GP' }, { diverId: 'd-n3', aptitude: 'PE40' }, { diverId: 'd-n1', aptitude: 'PE20' }], { profMax: 18, duree: 35, dtr: 2 }),
        pal('p3', 'Palanquée 3', [{ diverId: 'd-dp', aptitude: 'PA60' }, { diverId: 'd-n3', aptitude: 'PA40' }], { profMax: 35, duree: 30, dtr: 6 }),
      ],
      render_state: {
        heuresDebut: { p1: hhmm(minutesAgo(50)), p2: hhmm(minutesAgo(12)) },
        heuresFin: { p1: hhmm(minutesAgo(8)) },
        realises: { p1: { duree: '42', profMax: '19', dtr: '3', commentaire: 'Visibilité réduite sous 15 m.' } },
        pressions: { 'p1-d-gp': '70', 'p1-d-n2': '60' },
      },
    },
    {
      id: 'srv-4', client_uuid: '44444444-4444-4444-8444-444444444444', status: 'archived', planned_at: yesterday,
      drive_link: 'https://drive.google.com/file/d/test',
      answers: { ...baseAnswers(SITE_CARRIERE, yesterday), site_nom: 'Carrière, sortie club' },
      palanquees: [pal('p1', 'Palanquée 1', [{ diverId: 'd-gp', aptitude: 'GP' }, { diverId: 'd-n2', aptitude: 'PE40' }])],
      render_state: {},
    },
  ];
}

function summaryOf(d) {
  const pals = d.palanquees || [];
  return {
    id: d.id, client_uuid: d.client_uuid, status: d.status,
    site_nom: d.site_nom || d.answers?.site_nom || '', planned_at: d.planned_at || d.answers?.date,
    date_plongee: d.date_plongee || d.answers?.date || d.planned_at, started_at: d.started_at || null,
    dp_nom: d.answers?.dp_nom || d.dp_nom || '', dp_qual: d.answers?.dp_qual || d.dp_qual || '',
    activite: d.activite || '', drive_link: d.drive_link || '',
    nb_palanquees: pals.length, nb_plongeurs: pals.reduce((n, p) => n + (p.membres?.length || 0), 0),
  };
}

const ok = (data, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
const fail = (status, error) => ({ status, contentType: 'application/json', body: JSON.stringify({ ok: false, error }) });

function findDive(state, key) {
  return state.dives.find(d => !d.deleted && (d.id === key || d.client_uuid === key));
}

function diveRoute(method, path, search, body, state) {
  if (path === '/api/dives' && method === 'GET') return ok(search ? [] : state.dives.filter(d => !d.deleted).map(summaryOf));
  if (path === '/api/dives' && method === 'POST') {
    const existing = findDive(state, body.client_uuid);
    if (existing) return ok({ id: existing.id, duplicate: true });
    const created = { ...body, id: `srv-new-${state.dives.length + 1}` };
    state.dives.push(created);
    return ok({ id: created.id, duplicate: false }, 201);
  }
  const key = decodeURIComponent(path.slice('/api/dives/'.length));
  const dive = findDive(state, key);
  if (!dive) return fail(404, 'Plongée introuvable');
  if (method === 'GET') return ok({ ...dive, ...summaryOf(dive) });
  if (method === 'PATCH') {
    if (state.rejectArchive && body.status === 'archived') return fail(422, 'Palanquée P1 incomplète : heure de sortie manquante.');
    Object.assign(dive, body);
    return ok({ id: dive.id });
  }
  if (method === 'DELETE') { dive.deleted = true; return ok(null); }
  return ok(null);
}

function apiResponse(method, path, search, body, state) {
  if (path === '/api/auth/me') return ok(USER);
  if (path === '/api/divers') return ok(DIVERS);
  if (path === '/api/sites') return ok(SITES);
  if (path === '/api/sync/state') return ok({ divers: {}, sites: {}, dives: {} });
  if (path.startsWith('/api/dives')) return diveRoute(method, path, search, body, state);
  return ok(null);
}

function newState() {
  return { offline: false, rejectArchive: false, realFonts: false, calls: [], dives: seedDives(new Date()) };
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
    if (method === 'HEAD') return route.fulfill({ status: 200, body: '' });
    let body;
    try { body = req.postDataJSON() || {}; } catch { body = {}; }
    return route.fulfill(apiResponse(method, url.pathname, url.search, body, state));
  });
}

module.exports = { USER, DIVERS, SITES, newState, mockBackend };
