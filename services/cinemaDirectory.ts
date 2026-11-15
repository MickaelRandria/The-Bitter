import { CinemaProgramme, CinemaShowtime, FavoriteCinema } from '../types';
import { cinemasOfRow } from '../utils/favoriteCinemas';
import { supabase } from './supabase';

export interface CinemaCity {
  id: string;
  label: string;
  city: string;
}

export interface CinemaOption {
  id: string;
  name: string;
  address: string;
}

type DirectoryResult<T> = { data: T; error?: undefined } | { data: T; error: string };

/** Le serveur rend des dates ISO ; l'application manipule des timestamps. */
interface ShowtimeItem extends Omit<CinemaShowtime, 'startsAt'> {
  startsAt: string;
}

const invokeDirectory = async <T>(body: Record<string, unknown>, fallback: string): Promise<DirectoryResult<T[]>> => {
  if (!supabase) return { data: [], error: 'La recherche de cinémas est indisponible.' };

  let timer: number | undefined;
  try {
    const result = await Promise.race([
      supabase.functions.invoke('cinema-directory', { body }),
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error('directory-timeout')), 12_000);
      }),
    ]);
    if (result.error || !result.data || !Array.isArray(result.data.items)) return { data: [], error: fallback };
    return { data: result.data.items as T[] };
  } catch (error) {
    console.warn('[Cinémas] Recherche indisponible', error);
    return { data: [], error: fallback };
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
};

export const searchCinemaCities = async (query: string): Promise<DirectoryResult<CinemaCity[]>> => {
  const clean = query.trim();
  if (clean.length < 2) return { data: [] };
  return invokeDirectory<CinemaCity>({ action: 'cities', query: clean }, 'Impossible de trouver cette ville.');
};

export const searchCinemasNearCity = async (city: CinemaCity): Promise<DirectoryResult<CinemaOption[]>> =>
  invokeDirectory<CinemaOption>(
    {
      action: 'cinemas',
      city: city.city,
    },
    'Impossible de charger les cinémas UGC de cette ville.'
  );

/**
 * Toute la programmation d'un cinéma pour un jour, plus l'état des sept jours.
 *
 * C'est ce qui permet de choisir une séance dans le vrai programme au lieu de
 * ressaisir un titre, une date et une heure qu'UGC affiche déjà. Le serveur
 * décide du jour retenu quand aucun n'est demandé : le premier qui a encore
 * quelque chose à proposer, ce qui n'est pas « aujourd'hui » à 22 h.
 */
export const fetchCinemaProgramme = async (
  cinemaId: string,
  date?: string
): Promise<{ data: CinemaProgramme | null; error?: string }> => {
  if (!supabase) return { data: null, error: 'Le programme des cinémas est indisponible.' };
  if (!cinemaId) return { data: null };

  const fallback = 'Le programme UGC est momentanément indisponible.';
  let timer: number | undefined;
  try {
    const result = await Promise.race([
      supabase.functions.invoke('cinema-directory', { body: { action: 'programme', cinemaId, date } }),
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error('programme-timeout')), 20_000);
      }),
    ]);
    const payload = result.data;
    if (result.error || !payload || !Array.isArray(payload.films) || !Array.isArray(payload.days)) {
      return { data: null, error: fallback };
    }
    return {
      data: {
        date: String(payload.date || ''),
        days: payload.days as CinemaProgramme['days'],
        films: (payload.films as { showtimes: ShowtimeItem[]; title: string }[]).map((film) => ({
          ...film,
          showtimes: film.showtimes
            .map((showtime) => ({ ...showtime, title: film.title, startsAt: new Date(showtime.startsAt).getTime() }))
            .filter((showtime) => Number.isFinite(showtime.startsAt)),
        })) as CinemaProgramme['films'],
      },
    };
  } catch (error) {
    console.warn('[Cinémas] Programme indisponible', error);
    return { data: null, error: fallback };
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
};

/**
 * Les séances d'UN film dans UN cinéma, sur les prochains jours.
 *
 * Le titre voyage jusqu'au serveur, et c'est lui qui cherche dans la grille
 * UGC : on ne descend jamais toute la programmation dans le navigateur. Les
 * variantes de titre (TMDB rend un titre français et un titre original)
 * partent ensemble — un seul aller-retour couvre les deux orthographes.
 *
 * Le résultat est déjà trié, débarrassé des séances passées, et chaque entrée
 * porte son lien de réservation UGC.
 */
export const fetchMovieShowtimes = async (
  cinemaId: string,
  titles: string[],
  days = 7
): Promise<DirectoryResult<CinemaShowtime[]>> => {
  const wanted = [...new Set(titles.map((title) => title?.trim()).filter(Boolean))].slice(0, 4);
  if (!cinemaId || wanted.length === 0) return { data: [] };

  const result = await invokeDirectory<ShowtimeItem>(
    { action: 'showtimes', cinemaId, titles: wanted, days },
    'Les horaires UGC sont momentanément indisponibles.'
  );
  if (result.error) return { data: [], error: result.error };

  return {
    data: result.data
      .map((item) => ({ ...item, startsAt: new Date(item.startsAt).getTime() }))
      .filter((item) => Number.isFinite(item.startsAt)),
  };
};

/**
 * Les cinémas favoris d'autres personnes, par identifiant de profil.
 *
 * La policy `read_own_or_co_member_profile` ne laisse lire que les profils
 * des membres d'un espace commun : c'est elle qui borne ce que l'on voit.
 * Lecture directe sur `profiles`, sans embed : une seconde relation vers
 * `profiles` rendrait les embeds existants ambigus (PGRST201).
 */
export const fetchFavoriteCinemasOf = async (profileIds: string[]): Promise<Record<string, FavoriteCinema[]>> => {
  const ids = [...new Set(profileIds.filter(Boolean))];
  if (!supabase || ids.length === 0) return {};
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, favorite_cinemas, favorite_cinema')
      .in('id', ids);
    if (error || !data) {
      console.warn('[Cinémas] Cinémas des membres illisibles', error);
      return {};
    }
    return Object.fromEntries(
      (data as { id: string; favorite_cinemas?: unknown; favorite_cinema?: unknown }[]).map((row) => [
        row.id,
        cinemasOfRow(row) ?? [],
      ])
    );
  } catch (error) {
    console.warn('[Cinémas] Cinémas des membres injoignables', error);
    return {};
  }
};

/**
 * Pour chaque film demandé, les cinémas (parmi les miens) qui le programment
 * dans les sept prochains jours. `null` quand l'information manque : on ne
 * prétend alors rien, ni « chez toi », ni « pas chez toi ».
 */
export const fetchPlayingInCinemas = async (
  cinemaIds: string[],
  films: { key: string; titles: string[] }[]
): Promise<Map<string, string[]> | null> => {
  const ids = [...new Set(cinemaIds.filter(Boolean))].sort();
  const wanted = films.filter((film) => film.key && film.titles.some(Boolean)).slice(0, 80);
  if (!supabase || ids.length === 0 || wanted.length === 0) return null;

  const cacheKey = `bitter_playing_v1_${ids.join(',')}_${wanted.map((f) => f.key).sort().join(',')}`;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (cached && Date.now() - cached.at < 3 * 3_600_000) return new Map(cached.entries);
  } catch { /* Un cache refusé ne bloque rien. */ }

  let timer: number | undefined;
  try {
    const result = await Promise.race([
      supabase.functions.invoke('cinema-directory', {
        body: {
          action: 'playing',
          cinemaIds: ids,
          films: wanted.map((film) => ({ key: film.key, titles: [...new Set(film.titles.filter(Boolean))].slice(0, 3) })),
        },
      }),
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error('playing-timeout')), 30_000);
      }),
    ]);
    const payload = result.data as { items?: { key: string; cinemaIds: string[] }[]; read?: string[] } | null;
    // Aucun cinéma lu : rien à affirmer.
    if (result.error || !payload || !Array.isArray(payload.items) || !payload.read?.length) return null;
    const entries = payload.items.map((item) => [item.key, item.cinemaIds] as [string, string[]]);
    try { localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), entries })); } catch { /* Résultat utilisable quand même. */ }
    return new Map(entries);
  } catch (error) {
    console.warn('[Cinémas] Programmes de la semaine indisponibles', error);
    return null;
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
};
