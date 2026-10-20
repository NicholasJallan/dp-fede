// @ts-check
// DP Assistant — Évaluation des conditions `when` des questions et items de check-list.

export function matchCondition(when, answers) {
  if (!when) return true;
  if (typeof when === 'function') return when(answers);
  for (const key in when) {
    const v = when[key];
    if (key === '_custom') continue;
    if (v === true && !answers[key]) return false;
    if (v === false && answers[key]) return false;
    if (typeof v === 'string' && answers[key] !== v) return false;
  }
  return true;
}
