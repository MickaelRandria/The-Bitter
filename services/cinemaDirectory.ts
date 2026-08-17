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
