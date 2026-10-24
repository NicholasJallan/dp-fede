// DP Assistant — Heures du suivi des palanquées (format « HH:MM » stocké
// dans render_state : heuresDebut / heuresFin).

const pad = (n) => String(n).padStart(2, '0');

export function nowHHMM(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Minutes entre deux heures « HH:MM » (passage de minuit géré).
export function diffMinutes(startHHMM, endHHMM) {
  const [sh, sm] = startHHMM.split(':').map(Number);
  const [eh, em] = endHHMM.split(':').map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  return diff;
}

export function addMinutes(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${pad(Math.floor((total % (24 * 60)) / 60))}:${pad(total % 60)}`;
}

// Secondes écoulées depuis la mise à l'eau. `departAt` (horodatage ms,
// render_state.departs) donne l'instant exact : le chrono part de zéro.
// Sans lui (plongées antérieures) ou s'il ne correspond pas à l'heure
// d'entrée, repli sur « HH:MM » (minute pleine). Passage de minuit géré.
export function elapsedSeconds(startHHMM, now = new Date(), departAt = null) {
  if (!startHHMM) return 0;
  if (Number.isFinite(departAt) && nowHHMM(new Date(departAt)) === startHHMM) {
    return Math.max(0, Math.floor((now.getTime() - departAt) / 1000));
  }
  const [h, m] = startHHMM.split(':').map(Number);
  const start = new Date(now);
  start.setHours(h, m, 0, 0);
  let diff = (now.getTime() - start.getTime()) / 1000;
  if (diff < -60) diff += 24 * 3600;
  return Math.max(0, Math.floor(diff));
}

// « 01:23:45 » (heures:minutes:secondes)
export function formatChrono(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
