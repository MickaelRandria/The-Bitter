/**
 * « Ce qu'en dit Internet » : les chiffres d'un film et le résumé de ses avis.
 *
 * Module pur, sans réseau ni import, livré tel quel dans l'Edge Function
 * `public-reviews` et testé par `tests/filmSummary.test.mjs`.
 *
 * Les chiffres ne viennent jamais du modèle : ils sont lus tels quels
 * (SensCritique, OMDb) ou comptés ici. Mistral n'écrit que les phrases, à
 * partir des avis qu'on lui donne, et chaque citation qu'il propose est
 * vérifiée mot pour mot contre son avis d'origine.
 */

/** Sous ce nombre d'avis lus, pas de résumé : seulement les notes. */
export const MIN_REVIEWS = 30;
/** Avis transmis au modèle : les plus lus d'abord. */
export const MAX_SC_SOURCES = 60;
export const MAX_BSKY_SOURCES = 30;
const SOURCE_CHARS = 420;

export type CriterionKey = 'scenario' | 'image' | 'interpretation' | 'sound';
export const CRITERIA: CriterionKey[] = ['scenario', 'image', 'interpretation', 'sound'];
export type Tone = 'unanime' | 'apprecie' | 'divise' | 'critique';
const TONES: Tone[] = ['unanime', 'apprecie', 'divise', 'critique'];

export interface Facts {
  sensCritique: { rating: number | null; ratings: number; reviews: number; positiveShare: number | null; sampled: number; url: string } | null;
  imdb: { rating: number | null; votes: number | null } | null;
  press: { rottenTomatoes: number | null; metacritic: number | null } | null;
  bluesky: number;
  /** Avis lus en tout : ceux qui serviront au résumé. */
  readable: number;
}

export interface Source {
  id: string;
  origin: 'senscritique' | 'bluesky';
  author: string;
  text: string;
  rating?: number;
  url: string;
}

export interface Summary {
  verdict: string;
  overview: string;
  loved: string[];
  divides: string[];
  disappoints: string[];
  criteria: Partial<Record<CriterionKey, { tone: Tone; text: string }>>;
  quotes: { text: string; author: string; origin: Source['origin']; url: string }[];
}

/** Part des critiques à 7/10 ou plus, sur celles qui ont une note. */
export function positiveShare(ratings: (number | null | undefined)[]): { share: number | null; sampled: number } {
  const valid = ratings.filter((r): r is number => typeof r === 'number' && r >= 1 && r <= 10);
  if (valid.length < 20) return { share: null, sampled: valid.length };
  return { share: valid.filter((r) => r >= 7).length / valid.length, sampled: valid.length };
}

/** Les notes d'une réponse OMDb, ou rien. */
export function parseOmdb(body: any): { imdb: Facts['imdb']; press: Facts['press'] } {
  if (!body || body.Response === 'False') return { imdb: null, press: null };
  const num = (v: unknown) => {
    const n = Number.parseFloat(String(v ?? '').replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const ratings: any[] = Array.isArray(body.Ratings) ? body.Ratings : [];
  const rt = ratings.find((r) => r?.Source === 'Rotten Tomatoes')?.Value;
  const mc = ratings.find((r) => r?.Source === 'Metacritic')?.Value;
  const imdbRating = num(body.imdbRating);
  const rottenTomatoes = rt ? num(String(rt).replace('%', '')) : null;
  const metacritic = mc ? num(String(mc).split('/')[0]) : num(body.Metascore);
  return {
    imdb: imdbRating != null ? { rating: imdbRating, votes: num(body.imdbVotes) } : null,
    press: rottenTomatoes != null || metacritic != null ? { rottenTomatoes, metacritic } : null,
  };
}

const clip = (text: string, max: number) => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};

/** Une critique SensCritique telle que `reviews.items` la rend. */
export function fromSensCritique(item: any, productUrl: string): Source | null {
  const body = String(item?.bodyShort ?? '').trim();
  const title = String(item?.title ?? '').trim();
  if (!item?.id || body.length < 40) return null;
  return {
    id: `S${item.id}`,
    origin: 'senscritique',
    author: 'SensCritique',
    text: clip(title && !body.startsWith(title) ? `${title}. ${body}` : body, SOURCE_CHARS),
    rating: typeof item.rating === 'number' ? item.rating : undefined,
    url: productUrl,
  };
}

const LANGUAGE = { fr: 'French', en: 'English' } as const;

/** Les consignes et les avis, prêts pour Mistral. */
export function summaryPrompt(film: { title: string; year?: string }, sources: Source[], target: 'fr' | 'en') {
  const system = [
    `You summarise what the public says about a film, for a film-lovers app. Write in ${LANGUAGE[target]}, plain and lively, no jargon.`,
    'Use ONLY the reviews given. Never invent an opinion, a number or a fact. Never reveal plot twists, the ending, deaths or surprises: no spoilers at all.',
    'Weigh what most reviews say; mention a minority view only as such.',
    'Answer with JSON only, exactly this shape:',
    '{"verdict":"one short sentence, max 80 characters","overview":"two sentences, max 300 characters",',
    '"loved":["up to 3 short points"],"divides":["up to 2 short points"],"disappoints":["up to 2 short points"],',
    '"criteria":{"scenario":{"tone":"unanime|apprecie|divise|critique","text":"one short sentence"},"image":{...},"interpretation":{...},"sound":{...}},',
    '"quotes":[{"id":"<review id>","text":"<exact words copied from that review, 4 to 20 words, no spoiler>"}]}',
    'scenario = story and writing, image = visuals and directing, interpretation = acting, sound = music and sound. Leave a criterion out if reviews barely mention it.',
    'Give 2 or 3 quotes, copied word for word, from different reviews.',
  ].join('\n');
  const user = JSON.stringify({
    film: film.year ? `${film.title} (${film.year})` : film.title,
    reviews: sources.map((s) => ({ id: s.id, ...(s.rating ? { rating: `${s.rating}/10` } : {}), text: s.text })),
  });
  return { system, user };
}

const norm = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`«»"“”]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const strings = (value: unknown, max: number, length: number) =>
  (Array.isArray(value) ? value : [])
    .map((v) => (typeof v === 'string' ? clip(v, length) : ''))
    .filter(Boolean)
    .slice(0, max);

/**
 * La réponse du modèle, vérifiée. Les citations qu'on ne retrouve pas mot pour
 * mot dans l'avis cité sont jetées : on n'affiche jamais une phrase inventée.
 */
export function parseSummary(raw: unknown, sources: Source[]): Summary | null {
  let data: any = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object') return null;
  const verdict = typeof data.verdict === 'string' ? clip(data.verdict, 110) : '';
  if (!verdict) return null;

  const criteria: Summary['criteria'] = {};
  for (const key of CRITERIA) {
    const c = data.criteria?.[key];
    const tone = typeof c?.tone === 'string' ? (c.tone.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') as Tone) : null;
    if (tone && TONES.includes(tone) && typeof c.text === 'string' && c.text.trim()) criteria[key] = { tone, text: clip(c.text, 140) };
  }

  const byId = new Map(sources.map((s) => [s.id, s]));
  const used = new Set<string>();
  const quotes: Summary['quotes'] = [];
  for (const q of Array.isArray(data.quotes) ? data.quotes : []) {
    const source = byId.get(String(q?.id ?? ''));
    const text = typeof q?.text === 'string' ? q.text.trim().replace(/^[«"“\s]+|[»"”\s]+$/g, '') : '';
    if (!source || used.has(source.id) || text.split(/\s+/).length < 4 || text.length > 160) continue;
    if (!norm(source.text).includes(norm(text))) continue;
    used.add(source.id);
    quotes.push({ text, author: source.author, origin: source.origin, url: source.url });
    if (quotes.length === 3) break;
  }

  return {
    verdict,
    overview: typeof data.overview === 'string' ? clip(data.overview, 340) : '',
    loved: strings(data.loved, 3, 130),
    divides: strings(data.divides, 2, 130),
    disappoints: strings(data.disappoints, 2, 130),
    criteria,
    quotes,
  };
}
