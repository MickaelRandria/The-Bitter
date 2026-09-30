import React, { useEffect, useState } from 'react';
import { TvProgress, TvWatchState } from '../types';
import { TmdbSeasonSummary } from '../services/tmdb';
import { supabase } from '../services/supabase';
import { EpisodePosition, furthestPosition } from '../utils/upNext';
import { avatarSrc } from '../utils/avatar';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  seriesTmdbId: number;
  seasons: TmdbSeasonSummary[];
  progress?: TvProgress;
}

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

interface Friend {
  id: string;
  name: string;
  avatar: string | null;
  position: EpisodePosition | null;
}

const compare = (a: EpisodePosition, b: EpisodePosition) =>
  a.season - b.season || a.episode - b.episode;

/**
 * Où en sont les proches sur cette série.
 *
 * Seulement des places (« S3 · É2 »), jamais leurs avis ni leurs notes
 * d'épisodes : ce qui est devant soi reste un spoiler. La fonction côté base ne
 * renvoie de toute façon rien d'autre, et seulement pour les séries que chacun
 * laisse visibles dans ses espaces.
 *
 * Tant que la fonction n'existe pas en base, l'appel échoue et la section ne
 * s'affiche pas : rien ne casse.
 */
const FriendsSeriesProgress: React.FC<Props> = ({ seriesTmdbId, seasons, progress }) => {
  const { t } = useLanguage();
  const [friends, setFriends] = useState<Friend[]>([]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    (async () => {
      // Sans compte, pas de proches : inutile de solliciter la base.
      const { data: auth } = await client.auth.getSession();
      if (!auth.session) return;
      const { data, error } = await client.rpc('get_friends_series_progress', {
        p_series_tmdb_id: seriesTmdbId,
      });
      if (!active || error || !Array.isArray(data)) return;
      setFriends(
        (data as FriendProgressRow[]).map((row) => {
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
        })
      );
    })().catch(() => {
      /* Base injoignable : la section reste masquée. */
    });
    return () => {
      active = false;
    };
  }, [seriesTmdbId, seasons]);

  if (friends.length === 0) return null;
  const mine = furthestPosition(progress, seasons);

  const place = (position: EpisodePosition) => {
    const count = seasons.find((s) => s.seasonNumber === position.season)?.episodeCount;
    return count != null && position.episode >= count
      ? t('friendsProgress.seasonDone', { season: position.season })
      : t('upNext.episodeLine', {
          season: position.season,
          episode: Math.max(1, position.episode),
        });
  };

  return (
    <section>
      <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600 mb-2">
        {t('friendsProgress.title')}
      </p>
      <ul className="space-y-1.5">
        {friends.map((friend) => {
          const relation = !friend.position
            ? null
            : !mine
              ? 'ahead'
              : compare(friend.position, mine) > 0
                ? 'ahead'
                : compare(friend.position, mine) < 0
                  ? 'behind'
                  : 'same';
          return (
            <li
              key={friend.id}
              className="flex items-center gap-3 rounded-2xl border border-sand bg-white px-3 py-2.5 dark:border-white/10 dark:bg-[#1a1a1a]"
            >
              <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-stone-200 dark:bg-[#252525] flex items-center justify-center text-[12px] font-black text-stone-500">
                {friend.avatar ? (
                  <img src={friend.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  friend.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-charcoal dark:text-white">
                  {friend.name}
                </p>
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  {friend.position ? place(friend.position) : t('friendsProgress.notStarted')}
                </p>
              </div>
              {relation && (
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wider ${
                    relation === 'ahead'
                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300'
                      : relation === 'behind'
                        ? 'bg-forest/10 text-forest dark:bg-bitter-lime/10 dark:text-bitter-lime'
                        : 'bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300'
                  }`}
                >
                  {t(`friendsProgress.${relation}`)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10px] text-stone-400 dark:text-stone-500">
        {t('friendsProgress.note')}
      </p>
    </section>
  );
};

export default FriendsSeriesProgress;
