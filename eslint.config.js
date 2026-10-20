// Configuration ESLint (flat config).
//
// Deux mondes coexistent tant que la migration vers des modules ES n'est pas
// terminée : les écrans JSX bundlés par esbuild (modules) et les scripts
// lib/*.js / data.js chargés en <script> (globals window.*).

const js = require('@eslint/js');
const globals = require('globals');
const reactHooks = require('eslint-plugin-react-hooks');

// Globals exposés par les scripts classiques et consommés par les modules JSX.
const appGlobals = {
  api: 'readonly',
  google: 'readonly', // Google Identity Services / Maps (scripts tiers)
};

const sharedRules = {
  'no-unused-vars': ['error', { varsIgnorePattern: '^React$', argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
  'no-empty': ['error', { allowEmptyCatch: false }],
  eqeqeq: ['error', 'smart'],
  'no-console': ['warn', { allow: ['warn', 'error'] }],
};

module.exports = [
  { ignores: ['dist/**', 'node_modules/**', 'backend/vendor/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  {
    files: ['**/*.jsx'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...appGlobals },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...sharedRules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['lib/*.js', 'data.js', 'api.js', 'inline-boot.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, module: 'readonly' },
    },
    rules: sharedRules,
  },
  {
    files: ['sw.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: globals.serviceworker },
    rules: sharedRules,
  },
  {
    files: ['build.js', 'eslint.config.js', 'playwright.config.js', 'tests/**/*.js', 'tests-e2e/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser } },
    rules: { ...sharedRules, 'no-console': 'off' },
  },
];
