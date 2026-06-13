// build.js — esbuild bundler for DP Assistant
// Usage:  node build.js           → production build to dist/
//         node build.js --watch   → dev watch mode

const esbuild = require('esbuild');
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

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      copyDir(path.join(src, entry.name), path.join(dest, entry.name));
    } else {
      copyFile(path.join(src, entry.name), path.join(dest, entry.name));
    }
  }
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
    'icon-192.png', 'icon-512.png',
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

// ── esbuild ─────────────────────────────────────────────────────────────────

const buildOptions = {
  entryPoints: ['app.jsx'],
  bundle:      true,
  minify:      isProd,
  sourcemap:   true,
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
  esbuild.build(buildOptions).then(() => {
    const stat = fs.statSync(path.join(DIST, 'app.js'));
    console.log(`[DP] Build OK — dist/app.js ${(stat.size / 1024).toFixed(1)} KB`);
  }).catch(err => {
    console.error('[DP] Build failed:', err.message);
    process.exit(1);
  });
}
