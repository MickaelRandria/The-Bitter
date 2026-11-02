/**
 * Le nom d'un cinéma tapé à la main, rendu propre et retrouvé : l'enseigne bien
 * écrite (« pathe wepler » → « Pathé Wepler »), et les cinémas déjà connus
 * retrouvés malgré la casse, les accents ou une faute de frappe. Module pur.
 */

/** Les enseignes, telles qu'elles s'écrivent, et ce qu'on tape pour elles. */
export const BRANDS: { name: string; aliases: string[] }[] = [
  { name: 'UGC', aliases: ['ugc'] },
  { name: 'Pathé', aliases: ['pathe', 'pathé'] },
  { name: 'Gaumont', aliases: ['gaumont'] },
  { name: 'CGR', aliases: ['cgr'] },
  { name: 'MK2', aliases: ['mk2', 'mk 2'] },
  { name: 'Kinepolis', aliases: ['kinepolis', 'kinépolis'] },
  { name: 'Mégarama', aliases: ['megarama', 'mégarama'] },
  { name: 'Cinéville', aliases: ['cineville', 'cinéville'] },
  { name: 'Les Cinémas Pathé Gaumont', aliases: ['pathe gaumont'] },
];

/** Minuscules, sans accents ni ponctuation, espaces simples. */
export const normalizeName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** L'enseigne d'un nom tapé, s'il commence par elle. */
export function brandOf(value: string): { brand: string; rest: string } | null {
  const norm = normalizeName(value);
  for (const b of BRANDS) {
    for (const alias of b.aliases) {
      const a = normalizeName(alias);
      if (norm === a || norm.startsWith(`${a} `)) return { brand: b.name, rest: norm.slice(a.length).trim() };
    }
  }
  return null;
}

const titleCase = (s: string) =>
  s
    .split(' ')
    .filter(Boolean)
    .map((w, i) => (i > 0 && /^(de|du|des|la|le|et|a|au|aux|en|sur)$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

/** Le nom propre : l'enseigne bien écrite, le reste avec ses majuscules. */
export function canonicalName(value: string): string {
  const clean = value.trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  const found = brandOf(clean);
  if (!found) return clean === clean.toLowerCase() ? titleCase(clean) : clean.charAt(0).toUpperCase() + clean.slice(1);
  // Le reste tel que tapé (accents compris), sans l'enseigne.
  const words = clean.split(' ');
  const brandWords = found.brand === 'MK2' && /^mk$/i.test(words[0]) ? 2 : 1;
  const rest = words.slice(brandWords).join(' ');
  return rest ? `${found.brand} ${rest === rest.toLowerCase() ? titleCase(rest) : rest}` : found.brand;
}

/** Distance d'édition, pour pardonner une faute de frappe. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** À quel point un nom tapé ressemble à un nom connu : 0 (rien) à 1 (le même). */
export function similarity(typed: string, known: string): number {
  const a = normalizeName(typed);
  const b = normalizeName(known);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.9;
  // Chaque mot tapé retrouvé (ou presque) dans le nom connu.
  const words = a.split(' ');
  const target = b.split(' ');
  const hits = words.filter((w) => target.some((t) => t.startsWith(w) || (w.length >= 4 && distance(w, t) <= 1))).length;
  const wordScore = hits / words.length;
  const whole = 1 - distance(a, b) / Math.max(a.length, b.length);
  return Math.max(wordScore * 0.85, whole);
}

/** Les noms connus qui ressemblent à ce qui est tapé, du plus proche au moins proche. */
export function suggestCinemas(typed: string, known: string[], limit = 4): string[] {
  if (normalizeName(typed).length < 2) return [];
  const seen = new Set<string>();
  return known
    .filter((k) => {
      const key = normalizeName(k);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((k) => ({ k, score: similarity(typed, k) }))
    .filter((r) => r.score >= 0.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.k);
}
