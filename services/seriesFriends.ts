import { TvProgress, TvWatchState } from '../types';
import { supabase } from './supabase';
import { EpisodePosition, SeasonShape, furthestPosition } from '../utils/upNext';
import { avatarSrc } from '../utils/avatar';

/** Une ligne de `get_friends_series_progress` : une place, jamais un avis. */
interface FriendProgressRow {
  profile_id: string;
  first_name: string;
  avatar_url: string | null;
  state: TvWatchState | null;
  last_season: number | null;
  last_episode: number | null;
  seasons_watched: number[] | null;
  furthest_season: number | null;
  furthest_episode: number | null;
}

export interface FriendProgress {
  id: string;
  name: string;
  avatar: string | null;
  position: EpisodePosition | null;
}

export const comparePositions = (a: EpisodePosition, b: EpisodePosition) =>
  a.season - b.season || a.episode - b.episode;

/**
 * Une requête par série toutes les cinq minutes : les cartes « À suivre » et la
 * fiche la partagent, et une place qui avance finit quand même par se voir.
 */
const lookups = new Map<number, { at: number; rows: Promise<FriendProgressRow[]> }>();
const FRESH_FOR = 5 * 60_000;

const fetchRows = (seriesTmdbId: number): Promise<FriendProgressRow[]> => {
  const client = supabase;
  if (!client) return Promise.resolve([]);
  const cached = lookups.get(seriesTmdbId);
  if (cached && Date.now() - cached.at < FRESH_FOR) return cached.rows;

  const rows = (async () => {
    // Sans compte, pas de proches : inutile de solliciter la base.
    const { data: auth } = await client.auth.getSession();
    if (!auth.session) return [];
    const { data, error } = await client.rpc('get_friends_series_progress', {
      p_series_tmdb_id: seriesTmdbId,
    });
    return error || !Array.isArray(data) ? [] : (data as FriendProgressRow[]);
  })().catch(() => {
    lookups.delete(seriesTmdbId);
    return [] as FriendProgressRow[];
  });
  lookups.set(seriesTmdbId, { at: Date.now(), rows });
  return rows;
};

/**
 * Où en sont les proches sur une série. Seulement des places, jamais leurs avis
 * ni leurs notes d'épisodes, et seulement pour les séries que chacun laisse
 * visibles dans ses espaces. Base injoignable : liste vide, rien ne casse.
 */
export async function getFriendsSeriesProgress(
  seriesTmdbId: number,
  seasons: SeasonShape[]
): Promise<FriendProgress[]> {
  const rows = await fetchRows(seriesTmdbId);
  return rows.map((row) => {
    const synthetic: TvProgress = {
      state: row.state ?? 'watching',
      updatedAt: 0,
      lastSeason: row.last_season ?? undefined,
      lastEpisode: row.last_episode ?? undefined,
      seasonsWatched: row.seasons_watched ?? undefined,
      episodes:
        row.furthest_season != null && row.furthest_episode != null
          ? {
              furthest: {
                seasonNumber: row.furthest_season,
                episodeNumber: row.furthest_episode,
                watched: true,
                updatedAt: 0,
              },
            }
          : undefined,
    };
    return {
      id: row.profile_id,
      name: row.first_name,
      avatar: avatarSrc(row.avatar_url),
      position: furthestPosition(synthetic, seasons),
    };
  });
}
