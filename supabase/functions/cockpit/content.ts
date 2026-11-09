/** Ce que chaque e-mail montre, lu en base. Une lecture ratée n'empêche pas l'envoi des autres. */
import { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { EmailContent, Film, NewsItem, NoteRow, scoreOf, shortNews } from './campaign.ts';

const DAY_MS = 86_400_000;
const APP_URL = 'https://thebitter.watch';

export type SharedContent = Pick<EmailContent, 'popular' | 'news' | 'backdrop'>;

async function loadNews(): Promise<NewsItem[]> {
  try {
    const response = await fetch(`${APP_URL}/changelog.json`);
    const data = await response.json();
    return (Array.isArray(data?.items) ? data.items : [])
      .filter((item: { title?: unknown; body?: unknown }) => typeof item?.title === 'string' && typeof item?.body === 'string')
      .slice(0, 3)
      .map((item: { title: string; body: string }) => ({ title: item.title, text: shortNews(item.body) }));
  } catch (error) {
    console.warn('[cockpit] nouveautés illisibles :', String(error));
    return [];
  }
}

/** Les films les plus notés du moment, et la grande image du premier. */
export async function loadShared(admin: SupabaseClient, realIds: Set<string>): Promise<SharedContent> {
  const since = new Date(Date.now() - 60 * DAY_MS).toISOString();
  const { data } = await admin
    .from('user_movies')
    .select('profile_id, tmdb_id, title, poster_url')
    .is('deleted_at', null)
    .eq('media_type', 'movie')
    .gte('rated_at', since)
    .not('poster_url', 'is', null)
    .limit(1000);

  const counts = new Map<number, Film & { tmdbId: number; count: number }>();
  for (const row of data ?? []) {
    if (!realIds.has(row.profile_id) || !row.tmdb_id) continue;
    const entry = counts.get(row.tmdb_id) ?? { tmdbId: row.tmdb_id, title: row.title, poster: row.poster_url, count: 0 };
    entry.count += 1;
    counts.set(row.tmdb_id, entry);
  }
  const ranked = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 4);

  let backdrop: string | null = null;
  const key = Deno.env.get('TMDB_API_KEY');
  if (key && ranked[0]) {
    try {
      const response = await fetch(`https://api.themoviedb.org/3/movie/${ranked[0].tmdbId}?api_key=${key}`);
      const movie = await response.json();
      if (typeof movie?.backdrop_path === 'string') backdrop = `https://image.tmdb.org/t/p/w780${movie.backdrop_path}`;
    } catch (error) {
      console.warn('[cockpit] image TMDB illisible :', String(error));
    }
  }
  return { popular: ranked.map(({ title, poster }) => ({ title, poster })), news: await loadNews(), backdrop };
}

async function loadSpaceNotes(admin: SupabaseClient, userId: string): Promise<NoteRow[]> {
  const { data: memberships } = await admin.from('space_members').select('space_id').eq('profile_id', userId).eq('is_active', true);
  const spaces = (memberships ?? []).map((row) => row.space_id);
  if (!spaces.length) return [];
  const { data, error } = await admin
    .from('movie_ratings')
    .select('profile_id, rated_at, story, visuals, acting, sound, adaptive_rating, shared_movies!inner(title, poster_url, space_id)')
    .in('shared_movies.space_id', spaces)
    .neq('profile_id', userId)
    .gte('rated_at', new Date(Date.now() - 14 * DAY_MS).toISOString())
    .order('rated_at', { ascending: false })
    .limit(12);
  if (error) {
    console.warn('[cockpit] notes des espaces illisibles :', error.message);
    return [];
  }
  const ids = [...new Set((data ?? []).map((row) => row.profile_id))];
  const { data: names } = ids.length ? await admin.from('profiles').select('id, first_name').in('id', ids) : { data: [] };
  const nameById = new Map((names ?? []).map((row) => [row.id, row.first_name ?? '']));

  const seen = new Set<string>();
  const rows: NoteRow[] = [];
  for (const row of data ?? []) {
    const movie = row.shared_movies as unknown as { title: string; poster_url: string | null };
    const note = scoreOf(row);
    if (note === null || seen.has(movie.title)) continue;
    seen.add(movie.title);
    rows.push({ title: movie.title, poster: movie.poster_url, who: String(nameById.get(row.profile_id) ?? '').trim(), note });
  }
  return rows.slice(0, 3);
}

export async function loadContent(admin: SupabaseClient, userId: string, shared: SharedContent): Promise<EmailContent> {
  const [{ data: list }, { data: rated }, spaceNotes] = await Promise.all([
    admin
      .from('user_movies')
      .select('title, poster_url')
      .eq('profile_id', userId)
      .eq('status', 'watchlist')
      .is('rated_at', null)
      .is('deleted_at', null)
      .not('poster_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(3),
    admin
      .from('user_movies')
      .select('title, poster_url, story, visuals, acting, sound, adaptive_rating')
      .eq('profile_id', userId)
      .is('deleted_at', null)
      .gte('rated_at', new Date(Date.now() - 30 * DAY_MS).toISOString()),
    loadSpaceNotes(admin, userId).catch(() => []),
  ]);

  let best: EmailContent['best'] = null;
  for (const row of rated ?? []) {
    const note = scoreOf(row);
    if (note !== null && row.poster_url && (!best || note > best.note)) best = { title: row.title, poster: row.poster_url, note };
  }
  return { ...shared, wall: (list ?? []).map((row) => ({ title: row.title, poster: row.poster_url })), best, spaceNotes };
}
