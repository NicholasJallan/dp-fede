// DP Assistant — Point d'entrée du bundle (esbuild → dist/app.js).

import React from 'react';
import { createRoot } from 'react-dom/client';
import { bootstrap } from './bootstrap.js';
import { App } from './App.jsx';

bootstrap();

const root = createRoot(document.getElementById('root'));
root.render(<App />);
window.dispatchEvent(new Event('dp:appReady'));
