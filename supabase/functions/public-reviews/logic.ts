/**
 * Les avis du public (YouTube, Bluesky) : tri, filtre et langue.
 *
 * Module pur, sans réseau ni import, livré tel quel dans l'Edge Function
 * `public-reviews` et testé par `tests/publicReviews.test.mjs`.
 *
 * On récupère jusqu'à 100 avis par source, déjà classés par la plateforme
 * (« relevance » sur YouTube, « top » sur Bluesky), puis on écarte ce qui
 * n'est pas un avis : trop court, des émojis seuls, un lien, un doublon, de
 * l'autopromo. On garde au plus 40 avis.
 */

export type Criterion = 'story' | 'visuals' | 'acting' | 'sound';
export type Order = 'relevance' | 'recent';

export interface PublicReview {
  id: string;
  source: 'youtube' | 'bluesky';
  author: string;
  handle?: string;
  avatar?: string;
  /** Lien vers l'avis sur la plateforme : toujours affiché. */
  url: string;
  text: string;
  likes: number;
  replies: number;
  /** ISO 8601. */
  at: string;
  /** Code ISO 639-1, ou `und` si on ne sait pas. */
  lang: string;
  criteria: Criterion[];
}

export const MAX_KEPT = 40;
const MIN_CHARS = 25;
const MAX_CHARS = 1500;

/** Une adresse, même raccourcie (`ft.trib.al/VKEU6pb`). */
const LINK = /https?:\/\/|www\.|\b[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}\/\S/i;
/** Ce qui ressemble à un avis : une note, une séance, un « vu ». */
const RATING = /\b\d{1,2}([.,]\d)?\s?\/\s?(10|20|5)\b|★|⭐|🌟/u;
const VIEWING =
  /\b(vu|revu|vue|sortie? de la salle|en salle|au ciné(ma)?|watched|rewatched|just saw|saw it|seen it|finally saw|assisti|visto|gesehen)\b/i;
/** « Je ne l'ai pas vu » : on en parle, ce n'est pas un avis. */
const NOT_SEEN =
  /\b(didn'?t|did not|haven'?t|have not|never) (even )?(watch|watched|see|seen)\b|\b(pas|jamais) (encore )?vu\b|\bno (lo )?he visto\b/i;
const SPAM =
  /(abonne[- ]?toi|abonnez[- ]vous|subscribe|check (out )?my (channel|video|page)|ma cha[iî]ne|who('?s| is) (here|watching)|qui est (là|la) en|first comment|premier commentaire|giveaway|onlyfans|crypto|\bpromo code\b|link in bio|lien en bio)/i;

/** Ce qui permet de reconnaître deux fois le même avis, à la ponctuation près. */
export const fingerprint = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .slice(0, 80);

/** Est-ce un avis à montrer ? */
export function isReview(text: string): boolean {
  const t = text.trim();
  if (t.length < MIN_CHARS || t.length > MAX_CHARS) return false;
  if (LINK.test(t) || SPAM.test(t)) return false;
  const letters = (t.match(/\p{L}/gu) ?? []).length;
  if (letters / t.length < 0.5) return false;
  if ((t.match(/#\S+/g) ?? []).length > 4) return false;
  return true;
}

const CRITERIA: Record<Criterion, RegExp> = {
  story:
    /\b(histoire|scénario|scenario|intrigue|écriture|dialogues?|fin|twist|rythme|story|plot|script|writing|ending|pacing|narrative|guion|trama|enredo|roteiro|trama|handlung)\b/i,
  visuals:
    /\b(image|images|photo(graphie)?|visuel(le)?s?|plans?|cadrage|mise en scène|réalisation|effets|décors?|couleurs?|visuals?|cinematography|shots?|framing|direction|vfx|effects|imax|fotografía|fotografia)\b/i,
  acting:
    /\b(jeu|acteurs?|actrices?|interprétation|casting|joue|performances?|acting|actors?|actress|cast|plays|actuación|atuação|elenco)\b/i,
  sound:
    /\b((le|du|au) son|musique|bande[- ]originale|la bo|compositeur|score|soundtrack|sound|music|composer|banda sonora|trilha sonora|música|musica)\b/i,
};

/** Les critères de The Bitter dont parle l'avis. */
export const criteriaOf = (text: string): Criterion[] =>
  (Object.keys(CRITERIA) as Criterion[]).filter((key) => CRITERIA[key].test(text));

const STOPWORDS: Record<string, string[]> = {
  fr: ['le', 'les', 'des', 'est', 'et', 'une', 'pas', 'que', 'qui', 'dans', 'pour', "c'est", "j'ai", 'très', 'trop', 'mais', 'avec', 'sur', 'du', 'ce', 'je', 'vraiment', 'ça', 'au', 'plus', 'même', 'été', 'aussi'],
  en: ['the', 'and', 'is', 'this', 'that', 'it', 'was', 'of', 'to', 'you', 'but', 'with', 'so', 'just', 'not', 'for', 'are', 'have', 'they', 'my', 'what', "it's", "i'm", 'be', 'can'],
  es: ['el', 'los', 'las', 'es', 'y', 'una', 'pero', 'muy', 'por', 'con', 'película', 'esta', 'lo', 'se', 'del', 'como', 'más', 'qué', 'yo', 'para'],
  pt: ['os', 'é', 'um', 'uma', 'mas', 'muito', 'não', 'com', 'filme', 'isso', 'para', 'eu', 'está', 'do', 'da', 'que', 'mais', 'foi', 'esse', 'tem'],
  it: ['il', 'che', 'di', 'è', 'non', 'per', 'molto', 'questo', 'ma', 'sono', 'ho', 'gli', 'della', 'anche', 'come', 'più', 'questa', 'mi', 'del'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'ich', 'mit', 'aber', 'auch', 'sehr', 'zu', 'den', 'war', 'es', 'wie', 'noch', 'hat'],
};

const SCRIPTS: [RegExp, string][] = [
  [/[\u3040-\u30ff]/, 'ja'],
  [/[\uac00-\ud7af]/, 'ko'],
  [/[\u4e00-\u9fff]/, 'zh'],
  [/[\u0600-\u06ff]/, 'ar'],
  [/[\u0400-\u04ff]/, 'ru'],
  [/[\u0900-\u097f]/, 'hi'],
  [/[\u0e00-\u0e7f]/, 'th'],
  [/[\u0590-\u05ff]/, 'he'],
];

/**
 * La langue d'un texte, au jugé : YouTube ne la donne pas. Il suffit de savoir
 * si l'avis est dans la langue du lecteur, pour proposer « Traduire » ; la
 * vraie langue d'origine vient de la traduction elle-même.
 */
export function detectLang(text: string): string {
  for (const [pattern, lang] of SCRIPTS) if (pattern.test(text)) return lang;
  const words = text.toLowerCase().replace(/[’]/g, "'").split(/[^\p{L}']+/u).filter(Boolean);
  let best = 'und';
  let bestScore = 0;
  let second = 0;
  for (const [lang, list] of Object.entries(STOPWORDS)) {
    const set = new Set(list);
    const score = words.reduce((n, w) => n + (set.has(w) ? 1 : 0), 0);
    if (score > bestScore) {
      second = bestScore;
      bestScore = score;
      best = lang;
    } else if (score > second) second = score;
  }
  return bestScore >= 2 && bestScore > second ? best : 'und';
}

/** Une langue telle que Bluesky la déclare (`pt-BR`), ramenée à deux lettres. */
export const normalizeLang = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const code = raw.toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2,3}$/.test(code) ? code : null;
};

/**
 * Les likes comptent, mais une blague très partagée ne doit pas passer devant
 * un vrai avis : une note, un « vu hier » ou un critère pèsent autant que
 * quelques dizaines de likes.
 */
export const relevanceScore = (r: Pick<PublicReview, 'likes' | 'replies' | 'text' | 'criteria'>) =>
  Math.log1p(Math.max(0, r.likes)) +
  0.6 * Math.log1p(Math.max(0, r.replies)) +
  Math.min(r.text.length, 400) / 200 +
  (r.criteria.length > 0 ? 1.2 : 0) +
  (RATING.test(r.text) ? 2 : 0) +
  (VIEWING.test(r.text) ? 1.2 : 0) -
  (NOT_SEEN.test(r.text) ? 3 : 0);

/** Filtre, dédoublonne et classe. `recent` garde l'ordre chronologique. */
export function rankReviews(candidates: PublicReview[], order: Order, max = MAX_KEPT): PublicReview[] {
  const seen = new Set<string>();
  const kept: PublicReview[] = [];
  for (const review of candidates) {
    if (!isReview(review.text)) continue;
    const key = fingerprint(review.text);
    if (seen.has(key) || seen.has(review.id)) continue;
    seen.add(key);
    seen.add(review.id);
    kept.push({ ...review, text: review.text.trim(), criteria: criteriaOf(review.text) });
  }
  kept.sort(order === 'recent' ? (a, b) => b.at.localeCompare(a.at) : (a, b) => relevanceScore(b) - relevanceScore(a));
  return kept.slice(0, max);
}

/* ------------------------------------------------------------------ YouTube */

/** Un fil de commentaires tel que `commentThreads.list` le rend. */
export function fromYoutubeThread(thread: any, videoKey: string): PublicReview | null {
  const snippet = thread?.snippet?.topLevelComment?.snippet;
  const id = thread?.id;
  if (!snippet || typeof id !== 'string') return null;
  const text = String(snippet.textOriginal ?? snippet.textDisplay ?? '');
  return {
    id: `yt:${id}`,
    source: 'youtube',
    author: String(snippet.authorDisplayName ?? '').replace(/^@/, '') || '?',
    handle: typeof snippet.authorDisplayName === 'string' && snippet.authorDisplayName.startsWith('@') ? snippet.authorDisplayName : undefined,
    avatar: typeof snippet.authorProfileImageUrl === 'string' ? snippet.authorProfileImageUrl : undefined,
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoKey)}&lc=${encodeURIComponent(id)}`,
    text,
    likes: Number(snippet.likeCount) || 0,
    replies: Number(thread?.snippet?.totalReplyCount) || 0,
    at: String(snippet.publishedAt ?? ''),
    lang: detectLang(text),
    criteria: [],
  };
}

/* ------------------------------------------------------------------ Bluesky */

const normalizeTitle = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim();

const CINEMA_WORDS =
  /\b(film|films|movie|movies|cinema|cinéma|ciné|cine|imax|trailer|bande[- ]annonce|watched|vu|seen|screening|séance|sessão|película|filme|kino|réalisateur|réalisatrice|director|acteurs?|actrices?|actors?|actress|casting|letterboxd|filmsky|oscars?|box[- ]office)\b/i;

export interface FilmQuery {
  titles: string[];
  director?: string;
  year?: string;
}

/**
 * Le post parle-t-il de ce film ? La recherche Bluesky remonte aussi des posts
 * dont seul l'extrait cité ou l'image mentionne le titre : on exige le titre
 * dans le texte. Un titre est souvent aussi autre chose (« Frankenstein » le
 * roman, « une bataille après l'autre » en politique) : il faut en plus le
 * réalisateur, l'année, un mot de cinéma ou une note.
 */
export function mentionsFilm(text: string, film: FilmQuery): boolean {
  const body = ` ${normalizeTitle(text)} `;
  const titles = film.titles.map(normalizeTitle).filter((t) => t.length >= 2);
  const hit = titles.find((t) => body.includes(` ${t} `));
  if (!hit) return false;
  // « Frankenstein (1931) » : un autre film du même nom.
  const datedAs = body.match(new RegExp(` ${hit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} ((?:19|20)\\d\\d) `));
  if (datedAs && film.year && datedAs[1] !== film.year) return false;
  const director = film.director ? normalizeTitle(film.director).split(' ').pop() ?? '' : '';
  const byDirector = director.length > 2 && body.includes(` ${director} `);
  const byYear = !!film.year && body.includes(` ${film.year} `);
  // Un titre d'un seul mot ne dit presque rien : il faut le réalisateur ou l'année.
  if (!hit.includes(' ')) return byDirector || byYear;
  return byDirector || byYear || CINEMA_WORDS.test(text) || RATING.test(text);
}

/**
 * Les recherches à lancer : chaque titre entre guillemets, et pour un titre
 * d'un seul mot, le titre avec le nom du réalisateur, sans quoi les bons posts
 * se noient dans les homonymes.
 */
export function blueskyQueries(film: FilmQuery): string[] {
  const queries = film.titles.map((title) => `"${title}"`);
  const director = film.director?.trim().split(/\s+/).pop();
  const single = film.titles.find((title) => !title.trim().includes(' '));
  if (single && director && director.length > 2) queries.unshift(`"${single}" ${director}`);
  return [...new Set(queries)].slice(0, 3);
}

/** Un post tel que `app.bsky.feed.searchPosts` le rend. */
export function fromBlueskyPost(post: any): PublicReview | null {
  const uri = post?.uri;
  const handle = post?.author?.handle;
  const record = post?.record;
  if (typeof uri !== 'string' || typeof handle !== 'string' || !record) return null;
  // Comptes relayés depuis le web (flux RSS) et posts signalés : pas des avis.
  if (/\.brid\.gy$/i.test(handle)) return null;
  if (Array.isArray(post.labels) && post.labels.length > 0) return null;
  const rkey = uri.split('/').pop() ?? '';
  const text = String(record.text ?? '');
  return {
    id: `bsky:${uri}`,
    source: 'bluesky',
    author: String(post.author.displayName || handle),
    handle: `@${handle}`,
    avatar: typeof post.author.avatar === 'string' ? post.author.avatar : undefined,
    url: `https://bsky.app/profile/${handle}/post/${rkey}`,
    text,
    likes: Number(post.likeCount) || 0,
    replies: Number(post.replyCount) || 0,
    at: String(record.createdAt ?? post.indexedAt ?? ''),
    lang: normalizeLang(Array.isArray(record.langs) ? record.langs[0] : null) ?? detectLang(text),
    criteria: [],
  };
}
