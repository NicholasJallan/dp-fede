// build.js — esbuild bundler for DP Assistant
// Usage:  node build.js           → production build to dist/
//         node build.js --watch   → dev watch mode
//
// Entrées :
//   src/app/main.jsx        → dist/app.js     (tout le JS applicatif, modules ES)
//   src/styles/styles.css   → dist/styles.css
//   index.html              → dist/index.html (template copié tel quel)
//   public/**               → dist/**         (icônes, manifest, sw.js, inline-boot.js)

const esbuild = require('esbuild');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');
const isProd = !isWatch;

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const PUBLIC = path.join(ROOT, 'public');

// ── Fichiers statiques ──────────────────────────────────────────────────────

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function copyStatic() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  copyDir(PUBLIC, DIST);
  // index.html est un vrai template : aucune transformation. Le placeholder
  // __GOOGLE_MAPS_API_KEY__ est remplacé au serve par nginx (sub_filter).
  fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(DIST, 'index.html'));
}

// ── Version du Service Worker ───────────────────────────────────────────────
// Hash du contenu publié : deux déploiements identiques gardent la même
// version, tout changement de fichier en produit une nouvelle.

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(full) : [full];
  });
}

function stampServiceWorker() {
  const swPath = path.join(DIST, 'sw.js');
  const hash = crypto.createHash('sha256');
  for (const file of listFiles(DIST)
    .filter((f) => f !== swPath && !f.endsWith('.map'))
    .sort()) {
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

const shared = {
  bundle: true,
  minify: isProd,
  // Pas de sourcemap publié en prod (808 Ko, et expose les sources).
  sourcemap: isWatch,
  logLevel: 'warning',
};

const jsOptions = {
  ...shared,
  entryPoints: [path.join(ROOT, 'src/app/main.jsx')],
  target: 'es2020',
  loader: { '.jsx': 'jsx', '.js': 'jsx' },
  outfile: path.join(DIST, 'app.js'),
  define: { 'process.env.NODE_ENV': isProd ? '"production"' : '"development"' },
  jsx: 'automatic',
  jsxImportSource: 'react',
};

const cssOptions = {
  ...shared,
  entryPoints: [path.join(ROOT, 'src/styles/styles.css')],
  outfile: path.join(DIST, 'styles.css'),
};

async function watch() {
  copyStatic();
  const contexts = await Promise.all([esbuild.context(jsOptions), esbuild.context(cssOptions)]);
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log('[DP] Watching for changes… (Ctrl+C to stop) — public/ et index.html : relancer pour recopier');
}

async function build() {
  copyStatic();
  await Promise.all([esbuild.build(jsOptions), esbuild.build(cssOptions)]);
  const stat = fs.statSync(path.join(DIST, 'app.js'));
  const version = stampServiceWorker();
  console.log(`[DP] Build OK — dist/app.js ${(stat.size / 1024).toFixed(1)} KB — SW ${version}`);
}

(isWatch ? watch() : build()).catch((err) => {
  console.error('[DP] Build failed:', err.message);
  process.exit(1);
});
