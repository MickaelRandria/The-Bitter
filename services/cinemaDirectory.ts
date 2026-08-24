import { CinemaShowtime } from '../types';
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

/** Le serveur rend des dates ISO ; l'application manipule des timestamps. */
interface ShowtimeItem extends Omit<CinemaShowtime, 'startsAt'> {
  startsAt: string;
}

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
