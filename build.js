// build.js — esbuild bundler for DP Assistant
// Usage:  node build.js           → production build to dist/
//         node build.js --watch   → dev watch mode

const esbuild = require('esbuild');
const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');

const isWatch = process.argv.includes('--watch');
const isProd  = !isWatch;

const DIST = path.join(__dirname, 'dist');

// ── Asset copy ──────────────────────────────────────────────────────────────

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function buildHtml() {
  let html = fs.readFileSync('DP Assistant.html', 'utf8');

  // Remove Babel CDN
  html = html.replace(/<script[^>]*babel[^>]*>.*?<\/script>\s*/gi, '');
  // Remove React / ReactDOM CDN (unpkg)
  html = html.replace(/<script[^>]*unpkg\.com\/react[^>]*>.*?<\/script>\s*/gi, '');
  html = html.replace(/<script[^>]*unpkg\.com\/react-dom[^>]*>.*?<\/script>\s*/gi, '');
  html = html.replace(/<script[^>]*unpkg\.com\/@babel[^>]*>.*?<\/script>\s*/gi, '');
  // Remove all text/babel JSX script tags
  html = html.replace(/<script\s+type="text\/babel"[^>]*><\/script>\s*/gi, '');
  // Remove lib/use-auto-save.jsx script tag (now bundled)
  html = html.replace(/<script[^>]*use-auto-save\.jsx[^>]*>.*?<\/script>\s*/gi, '');

  // Add bundle before </body>
  html = html.replace('</body>', '  <script src="app.js" defer></script>\n</body>');

  fs.writeFileSync(path.join(DIST, 'index.html'), html);
}

function copyAssets() {
  fs.mkdirSync(DIST, { recursive: true });

  // Static assets
  const rootFiles = [
    'styles.css', 'sw.js', 'api.js', 'data.js', 'inline-boot.js',
    'site.webmanifest',
    'favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png',
    'apple-touch-icon.png', 'logo-ffessm.png',
    'android-chrome-192x192.png', 'android-chrome-512x512.png',
  ];
  for (const f of rootFiles) {
    if (fs.existsSync(f)) copyFile(f, path.join(DIST, f));
  }

  // lib/ — plain JS files only (JSX files are bundled, not copied)
  const libSrc  = path.join(__dirname, 'lib');
  const libDest = path.join(DIST, 'lib');
  fs.mkdirSync(libDest, { recursive: true });
  for (const entry of fs.readdirSync(libSrc)) {
    if (entry.endsWith('.js')) {
      copyFile(path.join(libSrc, entry), path.join(libDest, entry));
    }
  }

  buildHtml();
}

// ── Version du Service Worker ───────────────────────────────────────────────
// Hash du contenu publié : deux déploiements identiques gardent la même
// version, tout changement de fichier en produit une nouvelle.

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(full) : [full];
  });
}

function stampServiceWorker() {
  const swPath = path.join(DIST, 'sw.js');
  const hash = crypto.createHash('sha256');
  for (const file of listFiles(DIST).filter(f => f !== swPath && !f.endsWith('.map')).sort()) {
    hash.update(path.relative(DIST, file));
    hash.update(fs.readFileSync(file));
  }
  const version = `dp-${hash.digest('hex').slice(0, 12)}`;
  const sw = fs.readFileSync(swPath, 'utf8');
  if (!sw.includes('__SW_VERSION__')) throw new Error('sw.js : marqueur __SW_VERSION__ introuvable');
  fs.writeFileSync(swPath, sw.replace('__SW_VERSION__', version));
  return version;
}

// ── esbuild ─────────────────────────────────────────────────────────────────

const buildOptions = {
  entryPoints: ['app.jsx'],
  bundle:      true,
  minify:      isProd,
  // Pas de sourcemap publié en prod (808 Ko, et expose les sources).
  sourcemap:   isWatch,
  target:      'es2020',
  loader:      { '.jsx': 'jsx', '.js': 'jsx' },
  outfile:     path.join(DIST, 'app.js'),
  define:      { 'process.env.NODE_ENV': isProd ? '"production"' : '"development"' },
  jsx:         'automatic',
  jsxImportSource: 'react',
};

if (isWatch) {
  copyAssets();
  esbuild.context(buildOptions).then(ctx => {
    ctx.watch();
    console.log('[DP] Watching for changes… (Ctrl+C to stop)');
  });
} else {
  copyAssets();
  fs.rmSync(path.join(DIST, 'app.js.map'), { force: true });
  esbuild.build(buildOptions).then(() => {
    const stat = fs.statSync(path.join(DIST, 'app.js'));
    const version = stampServiceWorker();
    console.log(`[DP] Build OK — dist/app.js ${(stat.size / 1024).toFixed(1)} KB — SW ${version}`);
  }).catch(err => {
    console.error('[DP] Build failed:', err.message);
    process.exit(1);
  });
}
