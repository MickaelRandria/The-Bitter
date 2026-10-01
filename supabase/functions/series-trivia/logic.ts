/**
 * Les anecdotes d'une série, sans spoiler par construction.
 *
 * Trois verrous, dont deux ne dépendent pas du modèle :
 *
 * 1. LA SOURCE. Mistral ne lit que les sections de Wikipédia qui parlent de la
 *    fabrication de la série (création, écriture, casting, tournage, musique,
 *    décors). Jamais le synopsis, la liste des épisodes, la distribution ni la
 *    critique, qui racontent l'histoire. Il ne puise pas dans sa mémoire.
 * 2. LA SAISON. Chaque anecdote est rattachée à une saison : celle que le
 *    modèle indique, ou plus loin si le texte en nomme une. Une anecdote d'une
 *    saison que la personne n'a pas atteinte ne lui est pas montrée.
 * 3. LES NOMS. TMDB donne le casting saison par saison. Un personnage ou un
 *    acteur qui n'arrive que plus tard est un spoiler à lui seul : toute
 *    anecdote qui le nomme est écartée pour qui n'en est pas là.
 *
 * Ce fichier n'importe rien : il est testé tel quel (tests/seriesTrivia.test.mjs).
 */

export type TriviaItem =
  | { type: 'fact'; season: number | null; text: string; source: 'fr' | 'en' }
  | {
      type: 'quiz';
      season: number | null;
      question: string;
      options: string[];
      answer: number;
      explanation: string;
      source: 'fr' | 'en';
    };

/** Les sections qui parlent de la fabrication, en anglais et en français. */
const MAKING_OF = [
  'production',
  'development',
  'développement',
  'genèse',
  'conception',
  'writing',
  'écriture',
  'casting',
  'choix des interprètes',
  'filming',
  'tournage',
  'cinematography',
  'photographie',
  'music',
  'musique',
  'bande originale',
  'soundtrack',
  'set design',
  'décors',
  'design',
  'costume',
  'costumes',
  'main titles',
  'title sequence',
  'générique',
  'visual effects',
  'effets visuels',
  'notable production staff',
  'pre-production',
  'locations',
  'lieux de tournage',
];

const isMakingOf = (title: string) => {
  const t = title.trim().toLowerCase();
  return MAKING_OF.some((k) => t === k || t.startsWith(`${k} `) || t.endsWith(` ${k}`) || t.includes(` ${k} `));
};

/**
 * Les sections « fabrication » d'un article, tirées du texte brut renvoyé par
 * l'API d'extraits (`explaintext`, `exsectionformat=wiki`). Une sous-section est
 * gardée si elle-même ou sa section parente parle de fabrication : « Season 2 »
 * sous « Production » en fait partie, « Season 2 » sous « Reception » non.
 */
export function makingOfSections(extract: string, limit: number): string {
  const parts = `\n${extract}`.split(/\n(={2,4}) ([^=\n]+?) \1\n/);
  const kept: string[] = [];
  let parentKept = false;
  for (let i = 1; i + 2 < parts.length + 1; i += 3) {
    const level = parts[i]?.length ?? 2;
    const title = parts[i + 1] ?? '';
    const body = (parts[i + 2] ?? '').trim();
    const own = isMakingOf(title);
    if (level === 2) parentKept = own;
    if ((own || (level > 2 && parentKept)) && body.length > 40) kept.push(`[${title.trim()}]\n${body}`);
  }
  const text = kept.join('\n\n');
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

/** Des mots qui ne désignent personne en particulier : un rôle « Chef » ne bannit pas le mot. */
const GENERIC = new Set([
  'chef', 'doctor', 'docteur', 'mister', 'madame', 'monsieur', 'uncle', 'oncle', 'aunt', 'tante',
  'mom', 'dad', 'mère', 'père', 'young', 'jeune', 'little', 'self', 'himself', 'herself', 'narrator',
  'narrateur', 'voice', 'voix', 'officer', 'agent', 'detective', 'détective', 'captain', 'capitaine',
  'sister', 'brother', 'soeur', 'frère', 'king', 'queen', 'prince', 'princess', 'lord', 'lady',
  'saint', 'the', 'and', 'with', 'from',
]);

/** Les mots qui nomment quelqu'un : majuscule, quatre lettres au moins, hors mots génériques. */
export function nameTokens(names: string[]): string[] {
  const tokens = new Set<string>();
  for (const name of names) {
    for (const raw of name.split(/[\s'"’‘“”().,/-]+/)) {
      const token = raw.trim();
      if (token.length >= 4 && /^\p{Lu}/u.test(token) && !GENERIC.has(token.toLowerCase())) tokens.add(token);
    }
  }
  return [...tokens];
}

/**
 * Pour chaque saison, les noms qui y apparaissent pour la première fois.
 * `bySeason` : pour chaque saison, ses personnages et ses acteurs.
 */
export function introducedNames(bySeason: Record<number, string[]>): Record<number, string[]> {
  const seen = new Set<string>();
  const introduced: Record<number, string[]> = {};
  for (const season of Object.keys(bySeason).map(Number).sort((a, b) => a - b)) {
    const fresh = nameTokens(bySeason[season]).filter((t) => !seen.has(t));
    fresh.forEach((t) => seen.add(t));
    introduced[season] = fresh;
  }
  return introduced;
}

/** La saison la plus avancée nommée dans un texte : « saison 3 », « season 3 », « S3 ». */
export function mentionedSeason(text: string): number | null {
  let max: number | null = null;
  for (const match of text.matchAll(/\b(?:saison|season|S)\s?(\d{1,2})\b/gi)) {
    const n = Number(match[1]);
    if (n > 0 && (max == null || n > max)) max = n;
  }
  return max;
}

const clean = (value: unknown, max: number) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/**
 * La sortie du modèle, remise en forme. Tout ce qui n'a pas la forme attendue
 * est jeté plutôt que réparé : une anecdote douteuse ne vaut pas d'être montrée.
 */
export function parseTrivia(raw: unknown): TriviaItem[] {
  const list = Array.isArray((raw as { items?: unknown })?.items) ? (raw as { items: unknown[] }).items : [];
  const items: TriviaItem[] = [];
  for (const entry of list.slice(0, 14)) {
    const e = entry as Record<string, unknown>;
    const source: 'fr' | 'en' = e.source === 'fr' ? 'fr' : 'en';
    const declared = Number.isInteger(e.season) && (e.season as number) > 0 ? (e.season as number) : null;
    if (e.type === 'quiz') {
      const question = clean(e.question, 200);
      const options = Array.isArray(e.options) ? e.options.map((o) => clean(o, 80)).filter(Boolean) : [];
      const answer = Number(e.answer);
      const explanation = clean(e.explanation, 260);
      if (!question || options.length !== 3 || !Number.isInteger(answer) || answer < 0 || answer > 2) continue;
      if (new Set(options).size !== 3) continue;
      const mentioned = mentionedSeason(`${question} ${options.join(' ')} ${explanation}`);
      items.push({
        type: 'quiz',
        season: Math.max(declared ?? 0, mentioned ?? 0) || null,
        question,
        options,
        answer,
        explanation,
        source,
      });
    } else {
      // Les petits modèles nomment parfois la clé autrement : on lit les variantes courantes.
      const text = clean(e.text ?? e.fact ?? e.anecdote ?? e.content, 260);
      if (text.length < 20) continue;
      const mentioned = mentionedSeason(text);
      items.push({ type: 'fact', season: Math.max(declared ?? 0, mentioned ?? 0) || null, text, source });
    }
  }
  return items;
}

const textOf = (item: TriviaItem) =>
  item.type === 'fact' ? item.text : `${item.question} ${item.options.join(' ')} ${item.explanation}`;

/**
 * Ce qu'on peut montrer à quelqu'un qui en est à la saison `current` : rien
 * d'une saison plus loin, et rien qui nomme une personne arrivée plus tard.
 */
export function visibleTrivia(
  items: TriviaItem[],
  introduced: Record<number, string[]>,
  current: number
): TriviaItem[] {
  const known = new Set<string>();
  const later = new Set<string>();
  for (const [season, tokens] of Object.entries(introduced)) {
    const target = Number(season) <= current ? known : later;
    tokens.forEach((t) => target.add(t));
  }
  const banned = [...later].filter((t) => !known.has(t));
  const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = banned.length ? new RegExp(`(?<![\\p{L}])(?:${banned.map(escape).join('|')})(?![\\p{L}])`, 'u') : null;
  return items.filter(
    (item) => (item.season == null || item.season <= current) && !(pattern && pattern.test(textOf(item)))
  );
}
