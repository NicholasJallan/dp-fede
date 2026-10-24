// Tests statiques — auto-hébergement des polices et intégrité des assets hors-ligne

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

describe('static assets — polices auto-hébergées et hors-ligne', () => {
  test('index.html ne référence aucun CDN de polices externe', () => {
    const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
    assert.ok(!html.includes('fonts.googleapis.com'), 'index.html ne doit pas contenir fonts.googleapis.com');
    assert.ok(!html.includes('fonts.gstatic.com'), 'index.html ne doit pas contenir fonts.gstatic.com');
  });

  test('src/styles/fonts.css déclare font-display: swap dans chaque @font-face', () => {
    const fontsCssPath = resolve(ROOT, 'src/styles/fonts.css');
    assert.ok(existsSync(fontsCssPath), 'src/styles/fonts.css doit exister');
    const css = readFileSync(fontsCssPath, 'utf8');

    const fontFaceBlocks = css.match(/@font-face\s*\{[^}]+\}/g) || [];
    assert.ok(fontFaceBlocks.length > 0, 'Au moins une règle @font-face doit être définie');

    for (const block of fontFaceBlocks) {
      assert.ok(
        /font-display:\s*swap\s*;/i.test(block),
        `La règle @font-face doit déclarer 'font-display: swap' :\n${block}`,
      );
    }
  });

  test('chaque police déclarée dans fonts.css existe dans public/fonts et figure dans PRECACHE_URLS de sw.js', () => {
    const fontsCssPath = resolve(ROOT, 'src/styles/fonts.css');
    assert.ok(existsSync(fontsCssPath), 'src/styles/fonts.css doit exister');
    const css = readFileSync(fontsCssPath, 'utf8');

    const swJs = readFileSync(resolve(ROOT, 'public/sw.js'), 'utf8');
    const matches = Array.from(css.matchAll(/url\(['"]?(\/fonts\/[^'")]+?\.woff2)['"]?\)/g));
    assert.ok(matches.length > 0, 'Au moins un fichier .woff2 doit être référencé dans fonts.css');

    for (const match of matches) {
      const urlPath = match[1]; // ex: '/fonts/AtkinsonHyperlegible-Regular.woff2'
      const filePath = resolve(ROOT, 'public', urlPath.replace(/^\//, ''));
      assert.ok(existsSync(filePath), `Le fichier de police ${filePath} doit exister sur le disque`);
      assert.ok(
        swJs.includes(`'${urlPath}'`) || swJs.includes(`"${urlPath}"`),
        `sw.js doit inclure '${urlPath}' dans PRECACHE_URLS`,
      );
    }
  });

  test('public/fonts contient les licences OFL requises', () => {
    const atkinsonLic = resolve(ROOT, 'public/fonts/OFL-AtkinsonHyperlegible.txt');
    const jetbrainsLic = resolve(ROOT, 'public/fonts/OFL-JetBrainsMono.txt');
    assert.ok(existsSync(atkinsonLic), 'public/fonts/OFL-AtkinsonHyperlegible.txt doit être présent');
    assert.ok(existsSync(jetbrainsLic), 'public/fonts/OFL-JetBrainsMono.txt doit être présent');
  });
});
