// DP Assistant — Profil de la plongée : météo (open-meteo) et marées (SHOM).

import React, { useState } from 'react';
import { formatDateTime } from '../../components/components.jsx';
import { StatusIcon } from '../../components/icons.jsx';
import { api } from '../../api/api.js';
import { timeoutSignal } from '../../api/fetch-timeout.js';

// Bord de l'eau, réseau faible : le bouton ne reste pas bloqué plus de 10 s.
const METEO_TIMEOUT_MS = 10_000;

// ── MeteoField ────────────────────────────────────────────────────────────
// Open-meteo : prévisions horaires sur 16 jours, créneau le plus proche de
// l'heure planifiée. En cas d'échec : message dans l'interface, le champ
// n'est jamais modifié.
async function fetchMeteoText(lat, lng, date) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    '&hourly=temperature_2m,windspeed_10m,windgusts_10m,weathercode,visibility&forecast_days=16&timezone=auto';
  const res = await fetch(url, { signal: timeoutSignal(METEO_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`le service météo a répondu ${res.status}`);
  const data = await res.json().catch(() => null);
  if (!data || data.error) throw new Error(data?.reason || 'réponse du service météo illisible');
  const times = data.hourly?.time || [];
  if (!times.length) throw new Error('aucune prévision disponible pour ce lieu');

  let target = date ? new Date(date) : new Date();
  if (isNaN(target.getTime())) target = new Date();
  let best = 0,
    bestDiff = Infinity;
  times.forEach((t, k) => {
    const diff = Math.abs(new Date(t).getTime() - target.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      best = k;
    }
  });
  const h = data.hourly;
  const fmt = (v, digits = 0) => (v != null ? v.toFixed(digits) : '?');
  const offsetH = Math.round(bestDiff / 3_600_000);
  const offset = offsetH > 24 ? `, prévision décalée de ${offsetH} h` : '';
  return (
    `Météo (open-meteo, ${formatDateTime(h.time[best])}${offset}) : ${meteoCode(h.weathercode?.[best])}, ` +
    `vent ${fmt(h.windspeed_10m?.[best])} km/h (rafales ${fmt(h.windgusts_10m?.[best])} km/h), ` +
    `${fmt(h.temperature_2m?.[best], 1)} °C, visibilité ${h.visibility?.[best] != null ? (h.visibility[best] / 1000).toFixed(1) : '?'} km`
  );
}

function MeteoField({ id, value, onChange, site, date }) {
  const [fetching, setFetching] = useState(false);
  const [err, setErr] = useState('');
  const lat = parseFloat(site?.coordonnees?.lat);
  const lng = parseFloat(site?.coordonnees?.lng);
  const hasCoords = isFinite(lat) && isFinite(lng);

  const fetchMeteo = async () => {
    setFetching(true);
    setErr('');
    try {
      const text = await fetchMeteoText(lat, lng, date);
      onChange((value ? `${value}\n` : '') + text);
    } catch (e) {
      console.warn('[DP] météo indisponible :', e?.message || e);
      setErr(navigator.onLine === false ? 'pas de réseau' : e?.message || 'erreur inconnue');
    } finally {
      setFetching(false);
    }
  };

  return (
    <div>
      <div className="fetch-row">
        {hasCoords ? (
          <button type="button" className="btn" onClick={fetchMeteo} disabled={fetching}>
            {fetching ? 'Récupération de la météo…' : 'Préremplir avec la météo'}
          </button>
        ) : (
          <span className="muted small">Ajoutez les coordonnées GPS du site pour préremplir la météo.</span>
        )}
        {err && (
          <span className="field-error" role="alert">
            <StatusIcon tone="warn" />
            Météo indisponible : {err}. Saisissez les conditions à la main.
          </span>
        )}
      </div>
      <textarea
        id={id}
        className="textarea"
        rows={3}
        placeholder="Vent, état de la mer, courant, visibilité estimée"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// Codes météo WMO simplifiés
function meteoCode(code) {
  if (code == null) return 'Météo inconnue';
  if (code === 0) return 'Ciel dégagé';
  if (code <= 3) return 'Partiellement nuageux';
  if (code <= 48) return 'Brumeux / brouillard';
  if (code <= 67) return 'Pluie';
  if (code <= 77) return 'Neige';
  if (code <= 82) return 'Averses';
  if (code <= 99) return 'Orage';
  return 'Variable';
}

// ── MareeField ─────────────────────────────────────────────────────────────
// Proxy PHP → maree.shom.fr : port le plus proche + coefficients et heures du jour.
function MareeField({ id, value, onChange, site, date }) {
  const [fetching, setFetching] = useState(false);
  const [err, setErr] = useState('');

  const fetchMaree = async () => {
    const coords = site?.coordonnees;
    const lat = parseFloat(coords?.lat);
    const lng = parseFloat(coords?.lng);
    if (!isFinite(lat) || !isFinite(lng)) {
      setErr('coordonnées GPS manquantes sur le site');
      return;
    }
    const diveDate = date ? date.slice(0, 10) : new Date().toISOString().slice(0, 10);
    setFetching(true);
    setErr('');
    try {
      const data = await api.proxy.maree(lat, lng, diveDate);
      // data = { harbor, date, tides }
      const text = `Marées ${data.harbor} (${data.date.split('-').reverse().join('/')}) : ${data.tides}`;
      onChange(text);
    } catch (e) {
      setErr(e?.message || 'erreur inconnue');
    } finally {
      setFetching(false);
    }
  };

  return (
    <div>
      <div className="fetch-row">
        {site?.coordonnees?.lat ? (
          <button type="button" className="btn" onClick={fetchMaree} disabled={fetching}>
            {fetching ? 'Récupération des marées…' : 'Préremplir avec le SHOM'}
          </button>
        ) : (
          <span className="muted small">Ajoutez les coordonnées GPS du site pour préremplir les marées.</span>
        )}
        {err && (
          <span className="field-error" role="alert">
            <StatusIcon tone="warn" />
            Marées indisponibles : {err}
          </span>
        )}
      </div>
      <input
        id={id}
        className="input"
        type="text"
        placeholder="PM 14h12, coefficient 87"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export { MeteoField, MareeField };
