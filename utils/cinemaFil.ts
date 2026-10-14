/** Modèle et règles du Fil, partagés avec le relais RSS et les tests. */
export type FilMedia = 'movie' | 'tv';
export type FilKind = 'news' | 'trailer' | 'discovery' | 'release' | 'friend';
export interface FilTitle {
  tmdbId: number;
  mediaType: FilMedia;
  title: string;
  poster: string | null;
  backdrop?: string | null;
  year?: number;
}
export interface FilItem {
  id: string;
  kind: FilKind;
  mediaType: FilMedia;
  title: string;
  description: string;
  image: string | null;
  source: string;
  sourceUrl?: string;
  publishedAt?: string;
  work?: FilTitle;
  videoKey?: string;
  reason: 'news' | 'following' | 'because' | 'trending' | 'list' | 'release' | 'friend';
  reasonTitle?: string;
  friendId?: string;
  friendRating?: number;
}
export interface FilNews extends FilItem {
  kind: 'news';
  sourceUrl: string;
  publishedAt: string;
}

export const filWorkKey = (type: FilMedia, id: number) => `${type}:${id}`;
export const normalizeFilTitle = (title: string) => title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Pas de fusion Film/Série portant le même identifiant TMDB. */
export function associateNews(news: FilNews, works: FilTitle[], following: Set<string>): FilNews {
  const headline = ` ${normalizeFilTitle(news.title)} `;
  const quoted = [...news.title.matchAll(/["«“]([^"»”]+)["»”]/g)].map(match => normalizeFilTitle(match[1]));
  const matches = [...works].sort((a, b) => b.title.length - a.title.length).filter(w => {
    const title = normalizeFilTitle(w.title);
    return (title.length >= 5 ? headline.includes(` ${title} `) : title.length >= 3 && quoted.includes(title)) && w.mediaType === news.mediaType;
  });
  const unique = new Map(matches.map(work => [filWorkKey(work.mediaType, work.tmdbId), work]));
  if (unique.size !== 1) return news;
  const work = [...unique.values()][0];
  return { ...news, work, reason: following.has(filWorkKey(work.mediaType, work.tmdbId)) ? 'following' : 'news' };
}

/** Une longue liste de films ne doit pas faire disparaître les séries. */
export function balanceFilMedia(items: FilItem[]): FilItem[] {
  const movies = items.filter(item => item.mediaType === 'movie');
  const series = items.filter(item => item.mediaType === 'tv');
  const output: FilItem[] = [];
  for (let i = 0; i < Math.max(movies.length, series.length); i++) {
    if (movies[i]) output.push(movies[i]);
    if (series[i]) output.push(series[i]);
  }
  return output;
}

/** Alterner les contenus ; la diversité ne dépend pas du nombre d'articles RSS. */
export function assembleFil(groups: FilItem[][], followed: Set<string>, now = Date.now()): FilItem[] {
  const queues = groups.map(group => balanceFilMedia([...group].sort((a, b) => {
    const affinity = (item: FilItem) => item.work && followed.has(filWorkKey(item.work.mediaType, item.work.tmdbId)) ? 1 : 0;
    return affinity(b) - affinity(a) || (Date.parse(b.publishedAt || '') || 0) - (Date.parse(a.publishedAt || '') || 0);
  })));
  const seen = new Set<string>();
  const output: FilItem[] = [];
  while (queues.some(q => q.length) && output.length < 60) {
    for (const queue of queues) {
      if (output.length >= 60) break;
      const item = queue.shift();
      if (!item || seen.has(item.id)) continue;
      if (item.kind === 'news') {
        const age = now - Date.parse(item.publishedAt || '');
        if (!Number.isFinite(age) || age < -3_600_000 || age > 30 * 86_400_000) continue;
      }
      seen.add(item.id);
      output.push(item);
    }
  }
  return output;
}

export function filterFil(items: FilItem[], category: 'foryou' | 'news' | 'trailers', media: 'all' | FilMedia): FilItem[] {
  return items.filter(item => (media === 'all' || item.mediaType === media)
    && (category === 'foryou' || (category === 'news' ? item.kind === 'news' || item.kind === 'release' : item.kind === 'trailer')));
}

export const validFilItemId = (id: string) => /^(news:[a-f0-9]{16}|(discovery|release):(movie|tv):[1-9]\d{0,9}|trailer:(movie|tv):[1-9]\d{0,9}:[A-Za-z0-9_-]{11}|review:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.test(id);
