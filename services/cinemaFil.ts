import { TMDB_API_KEY, TMDB_BASE_URL } from '../constants';
import { Movie } from '../types';
import { supabase, getFriendsActivity, FriendActivity } from './supabase';
import { getTheatreReleases, getRecommendations } from './tmdb';
import { bestVideo } from './trailers';
import { tmdbImage } from '../utils/tmdbImage';
import { getDisplayWeightedRating, hasVerdict } from '../utils/rating';
import { assembleFil, associateNews, balanceFilMedia, filWorkKey, FilItem, FilMedia, FilNews, FilTitle, validFilItemId } from '../utils/cinemaFil';

export interface FilFollow extends FilTitle {}
export interface FilCount { likes: number; comments: number; liked: boolean }
export interface FilComment { id: string; profileId: string; name: string; body: string; createdAt: string }
export interface FilResult<T> { data: T; error?: string; localOnly?: boolean }
const listeners = new Set<() => void>();
export const onCinemaFilChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const announce = () => listeners.forEach(fn => fn());
const cacheKey = (profileId: string) => `bitter_cinema_fil_v1_${profileId}`;
export function readFilLocal(profileId: string): { follows: FilFollow[]; liked: string[]; openedAt?: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(cacheKey(profileId)) || '{}');
    return { follows: Array.isArray(raw.follows) ? raw.follows.filter((f: FilFollow) => f && ['movie', 'tv'].includes(f.mediaType) && Number.isInteger(f.tmdbId) && f.tmdbId > 0 && typeof f.title === 'string') : [],
      liked: Array.isArray(raw.liked) ? raw.liked.filter((id: string) => typeof id === 'string' && validFilItemId(id)) : [], openedAt: Number(raw.openedAt) || undefined };
  } catch { return { follows: [], liked: [] }; }
}
function writeLocal(profileId: string, patch: Partial<ReturnType<typeof readFilLocal>>) {
  try { localStorage.setItem(cacheKey(profileId), JSON.stringify({ ...readFilLocal(profileId), ...patch })); } catch { /* État en mémoire quand le stockage est fermé. */ }
  announce();
}
export const markFilOpened = (profileId: string) => writeLocal(profileId, { openedAt: Date.now() });

async function authenticatedId() {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.is_anonymous ? null : data.session?.user.id ?? null;
  } catch { return null; }
}
const networkError = (error: unknown) => {
  const message = (error as { message?: string })?.message || '';
  return message.includes('rate-limited') ? 'cineFil.rateLimited' : 'cineFil.writeError';
};
const followsRequests = new Map<string, { at: number; promise: Promise<FilResult<FilFollow[]>> }>();
export function getFilFollows(profileId: string): Promise<FilResult<FilFollow[]>> {
  const previous = followsRequests.get(profileId);
  if (previous && Date.now() - previous.at < 60_000) return previous.promise;
  const promise = fetchFilFollows(profileId);
  followsRequests.set(profileId, { at: Date.now(), promise });
  return promise;
}
async function fetchFilFollows(profileId: string): Promise<FilResult<FilFollow[]>> {
  const local = readFilLocal(profileId).follows;
  if (!supabase || await authenticatedId() !== profileId) return { data: local };
  try {
    const { data, error } = await supabase.from('cinema_fil_follows').select('media_type,tmdb_id,title,poster_url').eq('profile_id', profileId).limit(200).abortSignal(AbortSignal.timeout(8000));
    if (error) return { data: local, error: 'cineFil.syncError' };
    const follows: FilFollow[] = (data || []).map(row => ({ mediaType: row.media_type as FilMedia, tmdbId: row.tmdb_id, title: row.title, poster: row.poster_url }));
    writeLocal(profileId, { follows });
    return { data: follows };
  } catch { return { data: local, error: 'cineFil.syncError' }; }
}
export async function setFilFollow(profileId: string, work: FilTitle, following: boolean): Promise<FilResult<boolean>> {
  try {
    const localOnly = !supabase || await authenticatedId() !== profileId;
    if (!localOnly) {
      const result = following
        ? await supabase.from('cinema_fil_follows').upsert({ profile_id: profileId, media_type: work.mediaType, tmdb_id: work.tmdbId, title: work.title, poster_url: work.poster }, { onConflict: 'profile_id,media_type,tmdb_id' })
        : await supabase.from('cinema_fil_follows').delete().eq('profile_id', profileId).eq('media_type', work.mediaType).eq('tmdb_id', work.tmdbId);
      if (result.error) return { data: !following, error: networkError(result.error) };
    }
    const key = filWorkKey(work.mediaType, work.tmdbId);
    const follows = readFilLocal(profileId).follows.filter(w => filWorkKey(w.mediaType, w.tmdbId) !== key);
    if (following) follows.push(work);
    writeLocal(profileId, { follows });
    followsRequests.delete(profileId);
    return { data: following, localOnly };
  } catch (e) { return { data: !following, error: networkError(e) }; }
}

const tmdb = async (path: string) => {
  const response = await fetch(`${TMDB_BASE_URL}/${path}${path.includes('?') ? '&' : '?'}api_key=${TMDB_API_KEY}&language=fr-FR`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw Error('TMDB unavailable');
  return response.json();
};
const bounded = async <T>(promise: Promise<T>, timeout = 12_000): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([promise, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(Error('Feed source timeout')), timeout); })]); }
  finally { clearTimeout(timer!); }
};
const titleFrom = (row: any, type: FilMedia): FilTitle => ({ tmdbId: row.id, mediaType: type, title: row.title || row.name,
  poster: row.poster_path ? tmdbImage(row.poster_path, 'w500') : null, backdrop: row.backdrop_path ? tmdbImage(row.backdrop_path, 'w780') : null,
  year: Number((row.release_date || row.first_air_date || '').slice(0, 4)) || undefined });

/** Une panne de source n'empêche pas les autres contenus d'arriver. */
export async function getCinemaFil(movies: Movie[], follows: FilFollow[], language: string): Promise<FilResult<FilItem[]>> {
  const following = new Set(follows.map(w => filWorkKey(w.mediaType, w.tmdbId)));
  const works: FilTitle[] = movies.filter(m => m.tmdbId && m.seasonNumber == null).map(m => ({ tmdbId: m.tmdbId!, mediaType: m.mediaType ?? 'movie', title: m.title, poster: m.posterUrl || null, year: m.year }));
  works.push(...follows);
  const seen = new Set(movies.filter(m => m.status === 'watched' && m.seasonNumber == null).map(m => filWorkKey(m.mediaType ?? 'movie', m.tmdbId!)));
  const ranked = movies.filter(m => (m.tmdbId || m.seriesTmdbId) && m.status === 'watched' && hasVerdict(m) && getDisplayWeightedRating(m) >= 7.5)
    .sort((a, b) => getDisplayWeightedRating(b) - getDisplayWeightedRating(a));
  const seedIds = new Set<string>();
  const top = ranked.flatMap(movie => {
    const id = movie.seasonNumber != null ? movie.seriesTmdbId : movie.tmdbId;
    const type = movie.mediaType ?? 'movie';
    if (!id || seedIds.has(filWorkKey(type, id))) return [];
    seedIds.add(filWorkKey(type, id)); return [{ ...movie, tmdbId: id }];
  }).slice(0, 3);
  const news = async (): Promise<FilItem[]> => {
    const response = await fetch('/api/cinema-news', { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw Error('News unavailable');
    const body = await response.json();
    if (!Array.isArray(body.items)) throw Error('Invalid news');
    return (body.items as FilNews[]).filter(item => item.kind === 'news' && validFilItemId(item.id) && /^https:\/\//.test(item.sourceUrl))
      .map(item => associateNews(item, works, following));
  };
  const releases = async (): Promise<FilItem[]> => {
    if (!TMDB_API_KEY) return [];
    const data = await getTheatreReleases('FR', { language: language === 'en' ? 'en-US' : 'fr-FR' });
    return [...data.thisWeek, ...data.upcoming].slice(0, 12).map(f => ({ id: `release:movie:${f.id}`, kind: 'release', mediaType: 'movie',
      title: f.title, description: f.overview, source: 'TMDB', sourceUrl: `https://www.themoviedb.org/movie/${f.id}`, publishedAt: `${f.releaseDate}T12:00:00Z`,
      image: f.posterPath ? tmdbImage(f.posterPath, 'w500') : null,
      work: { tmdbId: f.id, mediaType: 'movie', title: f.title, poster: f.posterPath ? tmdbImage(f.posterPath, 'w500') : null, year: Number(f.releaseDate.slice(0, 4)) }, reason: 'release' }));
  };
  const discoveries = async (): Promise<FilItem[]> => {
    if (!TMDB_API_KEY) return [];
    const [lists, trendingResult, followedRows] = await Promise.all([
      Promise.allSettled(top.map(async seed => {
      const type = seed.mediaType ?? 'movie';
      const results = type === 'movie' ? await getRecommendations(seed.tmdbId!) : (await tmdb(`tv/${seed.tmdbId}/recommendations`)).results;
      return (results || []).slice(0, 5).map((row: any) => ({ row, type, reasonTitle: seed.title }));
      })),
      tmdb('trending/all/day').catch(() => ({ results: [] })),
      Promise.allSettled(follows.slice(0, 5).map(async work => ({ row: await tmdb(`${work.mediaType}/${work.tmdbId}`), type: work.mediaType, reasonTitle: undefined }))),
    ]);
    const candidates = [
      ...followedRows.flatMap(r => r.status === 'fulfilled' ? [r.value] : []),
      ...lists.flatMap(r => r.status === 'fulfilled' ? r.value : []),
      ...(trendingResult.results || []).filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 12).map((row: any) => ({ row, type: row.media_type as FilMedia, reasonTitle: undefined })),
    ];
    const unique = new Map<string, FilItem>();
    for (const c of candidates) {
      const work = titleFrom(c.row, c.type), key = filWorkKey(work.mediaType, work.tmdbId);
      if (!work.title || !work.poster || unique.has(key) || seen.has(key)) continue;
      unique.set(key, { id: `discovery:${key}`, kind: 'discovery', mediaType: work.mediaType, title: work.title, description: c.row.overview || '',
        image: work.poster, source: 'TMDB', sourceUrl: `https://www.themoviedb.org/${work.mediaType}/${work.tmdbId}`, work,
        reason: following.has(key) ? 'following' : c.reasonTitle ? 'because' : 'trending', reasonTitle: c.reasonTitle });
    }
    return balanceFilMedia([...unique.values()]).slice(0, 18);
  };
  const friends = async (): Promise<FilItem[]> => {
    if (!await authenticatedId()) return [];
    const results = await Promise.all([getFriendsActivity(12, 'movie'), getFriendsActivity(12, 'tv')]);
    if (results.every(r => r.error)) throw Error('Friends unavailable');
    return results.flatMap(r => r.data).filter(f => (f.seriesTmdbId || f.tmdbId) && f.review).map((f: FriendActivity) => ({
      id: `review:${f.movieId}`, kind: 'friend', mediaType: f.mediaType, title: f.title, description: f.review!, image: f.posterUrl,
      source: f.firstName, publishedAt: f.watchedAt, friendId: f.profileId, friendRating: f.rating,
      work: { tmdbId: f.seriesTmdbId || f.tmdbId!, mediaType: f.mediaType, title: f.title, poster: f.posterUrl, year: f.year }, reason: 'friend' }));
  };
  const results = await Promise.allSettled([news(), releases(), discoveries(), friends()].map(promise => bounded(promise)));
  const groups = results.map(r => r.status === 'fulfilled' ? r.value : []);
  const enriched = [...works, ...groups[2].flatMap(item => item.work ? [item.work] : [])];
  groups[0] = groups[0].map(item => associateNews(item as FilNews, enriched, following));
  const byWork = new Map<string, FilItem>();
  for (const item of [...groups[1], ...groups[2]]) if (item.work && !byWork.has(filWorkKey(item.work.mediaType, item.work.tmdbId))) byWork.set(filWorkKey(item.work.mediaType, item.work.tmdbId), item);
  const candidates = balanceFilMedia([...byWork.values()]).slice(0, 12);
  const videos = await Promise.all(candidates.map(async item => {
    const video = await bounded(bestVideo(item.work!.mediaType, item.work!.tmdbId, { officialOnly: true }), 6000).catch(() => null);
    if (!video || !['Trailer', 'Teaser'].includes(video.kind) || !/^[A-Za-z0-9_-]{11}$/.test(video.key)) return null;
    return { ...item, id: `trailer:${filWorkKey(item.work!.mediaType, item.work!.tmdbId)}:${video.key}`, kind: 'trailer', videoKey: video.key,
      publishedAt: video.publishedAt, source: 'YouTube', sourceUrl: `https://www.youtube.com/watch?v=${video.key}` } as FilItem;
  }));
  const items = assembleFil([groups[0], videos.filter(Boolean) as FilItem[], groups[2], groups[3], groups[1]], following);
  return { data: items, error: results[0].status === 'rejected' ? 'cineFil.newsError' : undefined };
}

export async function getFilCounts(ids: string[]): Promise<Record<string, FilCount>> {
  if (!supabase || !await authenticatedId()) return {};
  const { data, error } = await supabase.rpc('cinema_fil_counts', { p_keys: ids.filter(validFilItemId).slice(0, 80) }).abortSignal(AbortSignal.timeout(8000));
  return error ? {} : Object.fromEntries((data || []).map((row: any) => [row.item_id, { likes: Number(row.likes), comments: Number(row.comments), liked: row.liked }]));
}
export async function setFilLike(profileId: string, id: string, liked: boolean): Promise<FilResult<boolean>> {
  if (!validFilItemId(id)) return { data: !liked, error: 'cineFil.writeError' };
  try {
    const localOnly = !supabase || await authenticatedId() !== profileId;
    if (!localOnly) {
      const result = liked ? await supabase.from('cinema_fil_reactions').insert({ profile_id: profileId, item_id: id })
        : await supabase.from('cinema_fil_reactions').delete().eq('profile_id', profileId).eq('item_id', id);
      if (result.error && result.error.code !== '23505') return { data: !liked, error: networkError(result.error) };
    }
    const ids = new Set(readFilLocal(profileId).liked); liked ? ids.add(id) : ids.delete(id);
    writeLocal(profileId, { liked: [...ids] });
    return { data: liked, localOnly };
  } catch (e) { return { data: !liked, error: networkError(e) }; }
}
export async function getFilComments(id: string, before?: string): Promise<FilResult<FilComment[]>> {
  if (!supabase || !await authenticatedId()) return { data: [], error: 'cineFil.signInComments' };
  let query = supabase.from('cinema_fil_comments').select('id,profile_id,body,created_at,profile:profiles(first_name)').eq('item_id', id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(30);
  if (before) query = query.lt('created_at', before);
  const { data, error } = await query.abortSignal(AbortSignal.timeout(8000));
  return error ? { data: [], error: 'cineFil.commentsError' } : { data: (data || []).map((r: any) => ({ id: r.id, profileId: r.profile_id, name: r.profile?.first_name || '', body: r.body, createdAt: r.created_at })) };
}
export async function addFilComment(profileId: string, id: string, body: string): Promise<FilResult<boolean>> {
  if (!supabase || await authenticatedId() !== profileId) return { data: false, error: 'cineFil.signInComments' };
  if (!body.trim() || body.trim().length > 500 || !validFilItemId(id)) return { data: false, error: 'cineFil.writeError' };
  const { error } = await supabase.from('cinema_fil_comments').insert({ profile_id: profileId, item_id: id, body: body.trim() });
  return { data: !error, error: error ? networkError(error) : undefined };
}
export async function deleteFilComment(profileId: string, id: string): Promise<FilResult<boolean>> {
  if (!supabase || await authenticatedId() !== profileId) return { data: false, error: 'cineFil.signInComments' };
  const { error } = await supabase.from('cinema_fil_comments').delete().eq('id', id).eq('profile_id', profileId);
  return { data: !error, error: error ? networkError(error) : undefined };
}
