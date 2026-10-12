/**
 * Le profil de critique, en phrases : ce que disent les vraies notes, à côté de
 * ce que la personne a déclaré au calibrage.
 *
 * Module pur : l'appelant fournit les paires (ma note, note du public).
 */

/** En dessous, la comparaison tient du hasard : on n'affiche pas de phrase. */
export const MIN_COMPARED = 5;
/** Un écart plus petit que ça ne fait pas une note « plus sévère ». */
const TIE = 0.3;

export interface SeverityReading {
  /** Films comparés : notés par moi, avec une note du public. */
  count: number;
  /** Part des films (0 à 1) où ma note est plus basse que celle du public. */
  harsherShare: number;
  /** Écart moyen, ma note moins celle du public : négatif = plus sévère. */
  meanGap: number;
  /** Position sur la réglette, 0 (indulgent) à 1 (sévère), 0,5 = comme le public. */
  position: number;
}

export function severityVsPublic(pairs: { mine: number; public: number }[]): SeverityReading | null {
  const valid = pairs.filter((p) => Number.isFinite(p.mine) && Number.isFinite(p.public) && p.mine > 0 && p.public > 0);
  if (valid.length < MIN_COMPARED) return null;
  const gaps = valid.map((p) => p.mine - p.public);
  const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const harsherShare = gaps.filter((g) => g < -TIE).length / gaps.length;
  // Deux points d'écart moyen suffisent à aller au bout de la réglette.
  const position = Math.min(1, Math.max(0, 0.5 - meanGap / 4));
  return { count: valid.length, harsherShare, meanGap, position };
}

/** La phrase d'exigence : la clé de traduction et son pourcentage. */
export function severityKey(reading: SeverityReading): { key: string; percent: number } {
  const percent = Math.round(reading.harsherShare * 100);
  if (reading.meanGap <= -0.5) return { key: 'critic.harsher', percent };
  if (reading.meanGap >= 0.5) return { key: 'critic.kinder', percent: Math.round((1 - reading.harsherShare) * 100) };
  return { key: 'critic.aligned', percent };
}

/** La phrase de patience, d'après le calibrage (0 contemplatif, 10 intense). */
export function patienceKey(level: number | undefined): string {
  const value = level ?? 5;
  if (value <= 3) return 'critic.patienceSlow';
  if (value >= 7) return 'critic.patienceFast';
  return 'critic.patienceMiddle';
}
