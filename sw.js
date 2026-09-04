// DP Assistant — Service Worker
//
// Stratégies par destination :
//   - App shell local (/, *.css, app.js, /lib/*) : cache-first, precache à l'install
//   - CDN tiers (fonts.googleapis.com, fonts.gstatic.com) : cache-first runtime
//   - Tout /api/* : network-only (l'app gère le hors-ligne via offlineStore)
//   - Reste : network-first avec fallback cache
//
// Bumper manuellement la VERSION ci-dessous à chaque déploiement frontend
// (sinon le navigateur garde l'ancien cache). Format : dp-{YYYYMMDD}-{sha7}.
const VERSION = 'dp-20260905-pal-tablet';

const SHELL_CACHE  = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

// Précache : app shell local. Toute requête à la racine du domaine doit
// pouvoir être servie depuis ce cache après install.
// Note : app.jsx, composants JSX et lib/use-auto-save.jsx sont maintenant
// compilés dans app.js — plus besoin de les précacher individuellement.
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/inline-boot.js',
  '/styles.css',
  '/api.js',
  '/data.js',
  '/app.js',
  '/lib/depth-clamp.js',
  '/lib/pal-rules.js',
  '/lib/net.js',
  '/lib/offline-store.js',
  '/lib/outbox.js',
  '/lib/sync.js',
  '/lib/offline-api.js',
  '/lib/scope.js',
  '/lib/storage-keys.js',
  '/lib/google-drive.js',
  '/lib/drive-upload.js',
  '/favicon.ico',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/logo-ffessm.png',
  '/site.webmanifest',
];

// Origines CDN qu'on accepte de cacher en runtime (réponses opaques OK).
const CDN_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  // https://unpkg.com retiré : React/ReactDOM/Babel sont maintenant bundlés dans app.js
  // https://cdnjs.cloudflare.com retiré : jsPDF/html2canvas supprimés (PDF côté serveur via mPDF)
];

// Aucun endpoint API n'est mis en cache par le SW.
//
// Le stale-while-revalidate rendait TOUTE lecture API vieille d'une requête :
// un plongeur créé disparaissait de l'annuaire au refresh suivant, un plongeur
// supprimé y ressuscitait, et `/api/sync/state` renvoyait un curseur périmé
// qui faisait sauter le pull incrémental d'un cycle entier. Le mode hors-ligne
// ne repose pas sur ce cache : `lib/offline-api.js` retombe sur l'offlineStore
// (IndexedDB) dès que le fetch échoue.
//
// NB : `cache: 'no-store'` côté app (api.js) ne protège pas de ça — il
// contourne le cache HTTP de Chrome, pas le Service Worker.

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // addAll est atomique : si une URL échoue, tout l'install échoue. On
    // tolère les échecs individuels pour ne pas bloquer l'install si une
    // ressource optionnelle (favicon manquant) plante.
    await Promise.all(PRECACHE_URLS.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (err) {
        console.warn('[SW] precache miss', url, err.message);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Purge sèche des anciens caches : les archives historiques sont jetables,
    // pas de migration. Tout cache qui ne matche pas VERSION saute.
    const names = await caches.keys();
    await Promise.all(names
      .filter(n => !n.startsWith(VERSION))
      .map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // mutations gérées par l'app (outbox)

  // Filtre défensif : seuls les schémas http(s) passent par le SW. Les
  // chrome-extension://, data:, blob: etc. font crasher new URL() ou
  // le clone côté cache.
  if (!req.url.startsWith('http')) return;

  let url;
  try { url = new URL(req.url); }
  catch { return; }

  // Same-origin
  if (url.origin === self.location.origin) {
    // network-only — on laisse passer, l'app gère l'échec (offlineStore).
    if (url.pathname.startsWith('/api/')) return;
    event.respondWith(cacheFirst(req, SHELL_CACHE));
    return;
  }

  // Cross-origin CDN whitelistés
  if (CDN_ORIGINS.includes(url.origin)) {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE));
    return;
  }

  // Reste (Maps, Open-Meteo, Drive, GIS) : on relaye explicitement vers le
  // réseau plutôt que de simplement « ne rien faire ». Certains navigateurs
  // (Chrome 120+ notamment) ont des comportements erratiques quand un SW
  // est enregistré mais ne traite pas un event — on a vu « Failed to fetch »
  // sur des fetch() cross-origin parfaitement valides. Le pass-through
  // explicite résout ce flou de manière déterministe.
  event.respondWith(fetch(req));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: VERSION });
  }
});

// Background Sync — déclenche le sync de l'outbox côté app au retour réseau.
// L'app enregistre le tag 'dp-outbox' via navigator.serviceWorker.ready.sync.register.
self.addEventListener('sync', (event) => {
  if (event.tag === 'dp-outbox') {
    event.waitUntil(notifyClients({ type: 'SYNC_TRIGGER', reason: 'background-sync' }));
  }
});

// ── Stratégies ───────────────────────────────────────────────────────────

async function cacheFirst(req, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    // Fallback offline : si on cherchait du HTML, renvoyer la page d'accueil.
    if (req.destination === 'document') {
      const fallback = await cache.match('/index.html') || await cache.match('/');
      if (fallback) return fallback;
    }
    throw err;
  }
}

async function notifyClients(payload) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach(c => c.postMessage(payload));
}
