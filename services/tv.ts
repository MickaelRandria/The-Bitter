import { TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from '../constants';
import { getCachedData, setCachedData } from '../utils/cache';
import { SERIES_TYPES, getDiscoveryRegion, originCountriesOf } from '../utils/discoveryRegion';
import { groupWatchOffers, TmdbCountryOffers } from '../utils/watchOffers';

export interface TvEpisode {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  airDate?: string;
  runtime?: number;
  /** L'image de l'épisode (`still_path`), en 16/9. Absente sur les inédits. */
  still?: string;
  overview?: string;
  /**
   * La note TMDB, celle de tout le monde. À ne pas confondre avec la sienne.
   *
   * TMDB rend `0` pour un épisode que personne n'a noté — ce n'est pas un zéro,
   * c'est une absence. On l'écarte ici plutôt que d'afficher « 0.0 » sous
   * chaque inédit.
   */
  voteAverage?: number;
}

async function request(path: string, language: string) {
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(`${TMDB_BASE_URL}/${path}${separator}api_key=${TMDB_API_KEY}&language=${language}`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('TMDB unavailable');
  return response.json();
}

export async function getSeasonEpisodes(id: number, season: number, language = 'fr-FR'): Promise<TvEpisode[]> {
  const key = `tvEpisodes:${id}:${season}:${language}`;
  const cached = getCachedData<TvEpisode[]>(key);
  if (cached) return cached;
  const data = await request(`tv/${id}/season/${season}`, language);
  const episodes = (data.episodes ?? []).map((e: any) => ({
    id: e.id,
    seasonNumber: e.season_number,
    episodeNumber: e.episode_number,
    name: e.name,
    airDate: e.air_date || undefined,
    runtime: e.runtime || undefined,
    still: e.still_path ? `${TMDB_IMAGE_URL}${e.still_path}` : undefined,
    overview: e.overview || undefined,
    voteAverage: e.vote_average > 0 ? e.vote_average : undefined,
  }));
  setCachedData(key, episodes);
  // Le résumé de la saison arrive dans la même réponse : on le garde pour le
  // récap plutôt que de redemander la saison.
  setCachedData(`tvSeasonOverview:${id}:${season}:${language}`, data.overview || '');
  return episodes;
}

/** Un rôle de la saison : le personnage d'abord, c'est lui qu'on cherche. */
export interface CastMember {
  id: number;
  character: string;
  actor: string;
  photo?: string;
}

/**
 * Les rôles réguliers d'une saison, pour « Qui est qui ? ».
 *
 * La saison et pas toute la série : le casting complet nommerait des
 * personnages qui n'arrivent que plus tard, ce qui en dit déjà trop. Les
 * invités d'un épisode sont écartés pour la même raison : une apparition
 * surprise n'en est plus une si son nom s'affiche avant.
 */
export async function getSeasonCast(id: number, season: number, language = 'fr-FR'): Promise<CastMember[]> {
  const key = `tvSeasonCast:${id}:${season}:${language}`;
  const cached = getCachedData<CastMember[]>(key);
  if (cached) return cached;
  const data = await request(`tv/${id}/season/${season}/credits`, language);
  const cast: CastMember[] = (data.cast ?? [])
    .filter((c: any) => c.character)
    .sort((a: any, b: any) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, 16)
    .map((c: any) => ({
      id: c.id,
      character: String(c.character).split(' / ')[0],
      actor: c.name,
      photo: c.profile_path ? `${TMDB_IMAGE_URL}${c.profile_path}` : undefined,
    }));
  setCachedData(key, cast);
  return cast;
}

/**
 * Qui a réalisé et écrit un épisode : des faits sûrs, sans IA, pour la
 * première carte de « Le saviez-vous ? ». Les invités de l'épisode ne sont pas
 * repris : une apparition surprise n'en serait plus une.
 */
export async function getEpisodeCrew(
  id: number,
  season: number,
  episode: number,
  language = 'fr-FR'
): Promise<{ directors: string[]; writers: string[] }> {
  const key = `tvEpisodeCrew:${id}:${season}:${episode}`;
  const cached = getCachedData<{ directors: string[]; writers: string[] }>(key);
  if (cached) return cached;
  const data = await request(`tv/${id}/season/${season}/episode/${episode}`, language);
  const crew: { job?: string; name?: string }[] = data.crew ?? [];
  const names = (jobs: string[]) =>
    [...new Set(crew.filter((c) => c.name && jobs.includes(c.job ?? '')).map((c) => c.name as string))].slice(0, 3);
  const result = {
    directors: names(['Director']),
    writers: names(['Writer', 'Teleplay', 'Screenplay', 'Story']),
  };
  setCachedData(key, result);
  return result;
}

/** Le résumé d'une saison entière, tel que TMDB l'écrit. Vide s'il n'en a pas. */
export async function getSeasonOverview(id: number, season: number, language = 'fr-FR'): Promise<string> {
  const key = `tvSeasonOverview:${id}:${season}:${language}`;
  const cached = getCachedData<string>(key);
  if (cached != null) return cached;
  await getSeasonEpisodes(id, season, language);
  return getCachedData<string>(key) ?? '';
}

/** Les offres de visionnage en France d'un film ou d'une série (données JustWatch). */
export async function getWatchOffers(mediaType: 'movie' | 'tv', id: number): Promise<TmdbCountryOffers | null> {
  const key = `watchOffers:${mediaType}:${id}`;
  const cached = getCachedData<TmdbCountryOffers | null>(key);
  if (cached !== null) return cached;
  const data = await request(`${mediaType}/${id}/watch/providers`, 'fr-FR');
  const offers: TmdbCountryOffers | null = data.results?.FR ?? null;
  setCachedData(key, offers);
  return offers;
}

/** Un épisode vu d'avion : sa place, sa date, et la note du public. */
export interface EpisodeScore {
  season: number;
  episode: number;
  airDate?: string;
  /** Absente quand trop peu de votes pour qu'elle veuille dire quelque chose. */
  rating?: number;
  votes: number;
  name: string;
}

/**
 * En dessous, une note TMDB d'épisode dit l'avis de deux ou trois personnes :
 * la colorer comme une vraie note tromperait.
 */
const MIN_EPISODE_VOTES = 3;
/** TMDB accepte au plus vingt sous-requêtes `append_to_response` par appel. */
const APPEND_LIMIT = 20;
/** Au-delà, la carte deviendrait illisible sur un téléphone de toute façon. */
const MAX_MAPPED_SEASONS = 40;

/**
 * Toutes les notes d'épisodes d'une série, en une ou deux requêtes.
 *
 * Demander les saisons une à une coûterait vingt-sept appels pour New York Unité
 * Spéciale. `append_to_response=season/1,season/2,…` les rapporte avec la fiche,
 * par paquets de vingt. La saison 0 (bonus) est écartée.
 */
export async function getSeriesEpisodeScores(
  id: number,
  seasonNumbers: number[],
  language = 'fr-FR'
): Promise<EpisodeScore[]> {
  const wanted = seasonNumbers.filter((n) => n > 0).sort((a, b) => a - b).slice(0, MAX_MAPPED_SEASONS);
  const key = `tvEpisodeScores:${id}:${wanted.join(',')}:${language}`;
  const cached = getCachedData<EpisodeScore[]>(key);
  if (cached) return cached;

  const batches: number[][] = [];
  for (let i = 0; i < wanted.length; i += APPEND_LIMIT) batches.push(wanted.slice(i, i + APPEND_LIMIT));
  const responses = await Promise.all(
    batches.map((batch) =>
      request(`tv/${id}?append_to_response=${batch.map((n) => `season/${n}`).join(',')}`, language)
    )
  );

  const scores: EpisodeScore[] = [];
  responses.forEach((data, index) => {
    for (const seasonNumber of batches[index]) {
      for (const e of data[`season/${seasonNumber}`]?.episodes ?? []) {
        const votes = e.vote_count ?? 0;
        scores.push({
          season: seasonNumber,
          episode: e.episode_number,
          airDate: e.air_date || undefined,
          rating: votes >= MIN_EPISODE_VOTES && e.vote_average > 0 ? e.vote_average : undefined,
          votes,
          name: e.name ?? '',
        });
      }
    }
  });
  setCachedData(key, scores);
  return scores;
}

/**
 * Traduit des identifiants de genres TMDB « film » vers leur équivalent « série ».
 *
 * Les deux catalogues sont distincts : TMDB n'a ni Action, ni Aventure, ni
 * Science-Fiction, ni Thriller, ni Horreur, ni Romance côté séries. Envoyer un
 * identifiant de film à `discover/tv` ne renvoie pas moins de résultats : il n'en
 * renvoie **aucun**, sans erreur. Une recherche par envie qui ne rend rien est
 * indistinguable d'une envie trop pointue, d'où cette table.
 *
 * Les genres absents du catalogue séries sont retirés plutôt que rapprochés de
 * force : mieux vaut un filtre en moins qu'un contresens.
 */
const MOVIE_TO_TV_GENRE: Record<number, number> = {
  28: 10759, // Action → Action & Adventure
  12: 10759, // Aventure → Action & Adventure
  878: 10765, // Science-Fiction → Sci-Fi & Fantasy
  14: 10765, // Fantastique → Sci-Fi & Fantasy
  10752: 10768, // Guerre → War & Politics
  53: 9648, // Thriller → Mystère
  27: 9648, // Horreur → Mystère
};

/** Genres sans équivalent série : Romance, Musique, Téléfilm. */
const MOVIE_ONLY_GENRES = [10749, 10402, 10770];

export const toTvGenreIds = (ids: number[]): number[] => [
  ...new Set(ids.map((id) => MOVIE_TO_TV_GENRE[id] ?? id).filter((id) => !MOVIE_ONLY_GENRES.includes(id))),
];

export interface TvRelease {
  id: number;
  title: string;
  poster?: string;
  date: string;
  season?: number;
  episode?: number;
  kind: 'new' | 'season' | 'episode';
  providers: string[];
}

export async function getTvUpcoming(followedIds: number[] = [], language = 'fr-FR', followedOnly = false): Promise<TvRelease[]> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
  /* Les sorties à venir souffraient du même biais que l'Explorer : la popularité
     mondiale de TMDB y remontait des séries coréennes et turques dont rien
     n'arrive jusqu'ici. Le pays choisi entre donc dans la clé de cache — en
     changer doit rendre une autre liste, pas celle d'avant. */
  const region = getDiscoveryRegion();
  const origins = originCountriesOf(region);
  const scope = origins ? `&with_type=${encodeURIComponent(SERIES_TYPES)}&with_origin_country=${encodeURIComponent(origins)}` : '';
  const cacheKey = `tvUpcoming:${today}:${language}:${region}:${followedOnly}:${[...followedIds].sort().join(',')}`;
  const cached = getCachedData<TvRelease[]>(cacheKey);
  if (cached) return cached;
  const until = new Date(); until.setDate(until.getDate() + 90);
  const end = until.toISOString().slice(0, 10);
  const ids = new Set(followedIds);
  if (!followedOnly) {
    const pages = await Promise.all([
      request(`discover/tv?first_air_date.gte=${today}&first_air_date.lte=${end}&sort_by=popularity.desc&include_adult=false${scope}`, language),
      request(`discover/tv?air_date.gte=${today}&air_date.lte=${end}&sort_by=popularity.desc&include_adult=false${scope}`, language),
    ]);
    for (const page of pages) for (const item of (page.results ?? []).slice(0, 12)) ids.add(item.id);
  }
  const result: TvRelease[] = [];
  let successes = 0;
  // Concurrence bornée : une collection de cinquante séries ne doit pas partir
  // en cinquante requêtes simultanées.
  const queue = [...ids];
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const id = queue.shift()!;
      try {
        const data = await request(`tv/${id}?append_to_response=watch/providers`, language);
        successes++;
        const base = { id, title: data.name, poster: data.poster_path ? `${TMDB_IMAGE_URL}${data.poster_path}` : undefined,
          // Ce que ces plateformes diffusent **aujourd'hui** en France, et non ce
          // qu'elles diffuseront : la saison annoncée n'y est promise nulle part.
          // Les offres gratuites comptent aussi : TMDB y range Arte, par exemple.
          providers: groupWatchOffers(data['watch/providers']?.results?.FR).streaming.map(offer => offer.name) };
        const upcomingSeasons = (data.seasons ?? []).filter((s: any) => s.season_number > 0 && s.air_date >= today && s.air_date <= end);
        for (const season of upcomingSeasons) result.push({ ...base, date: season.air_date, season: season.season_number, kind: season.season_number === 1 ? 'new' : 'season' });
        const next = data.next_episode_to_air;
        if (next?.air_date >= today && next.air_date <= end && !upcomingSeasons.some((s: any) => s.season_number === next.season_number && s.air_date === next.air_date)) {
          result.push({ ...base, date: next.air_date, season: next.season_number, episode: next.episode_number, kind: 'episode' });
        }
      } catch {
        /* Une fiche manquante ne doit pas emporter les autres. */
      }
    }
  }));
  if (ids.size && !successes) throw new Error('TMDB unavailable');
  result.sort((a, b) => a.date.localeCompare(b.date));
  setCachedData(cacheKey, result);
  return result;
}
