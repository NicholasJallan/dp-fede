// Configuration ESLint (flat config).
//
// Tout le code applicatif vit dans src/ sous forme de modules ES bundlés par
// esbuild (entrée src/app/main.jsx). Seuls public/inline-boot.js (script
// classique) et public/sw.js (service worker) restent hors bundle.

const js = require('@eslint/js');
const globals = require('globals');
const reactHooks = require('eslint-plugin-react-hooks');

// Globals fournis par des scripts tiers chargés dans index.html.
const thirdPartyGlobals = {
  google: 'readonly', // Google Identity Services / Maps
};

const sharedRules = {
  'no-unused-vars': ['error', { varsIgnorePattern: '^React$', argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
  'no-empty': ['error', { allowEmptyCatch: false }],
  eqeqeq: ['error', 'smart'],
  'no-console': ['warn', { allow: ['warn', 'error'] }],
};

module.exports = [
  { ignores: ['dist/**', 'node_modules/**', 'backend/vendor/**', 'test-results/**', 'playwright-report/**', 'tests-e2e-report/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...thirdPartyGlobals },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...sharedRules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['public/inline-boot.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: globals.browser },
    rules: sharedRules,
  },
  {
    files: ['public/sw.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: globals.serviceworker },
    rules: sharedRules,
  },
  {
    files: ['build.js', 'eslint.config.js', 'playwright.config.js', 'playwright.local.config.js', 'tests-e2e/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser } },
    rules: { ...sharedRules, 'no-console': 'off' },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: { ...sharedRules, 'no-console': 'off' },
  },
];
