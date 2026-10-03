import React, { useEffect, useState } from 'react';
import { TvProgress } from '../types';
import { TmdbSeasonSummary } from '../services/tmdb';
import { comparePositions as compare, FriendProgress, getFriendsSeriesProgress } from '../services/seriesFriends';
import { EpisodePosition, furthestPosition } from '../utils/upNext';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  seriesTmdbId: number;
  seasons: TmdbSeasonSummary[];
  progress?: TvProgress;
}

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
  const [friends, setFriends] = useState<FriendProgress[]>([]);

  useEffect(() => {
    let active = true;
    getFriendsSeriesProgress(seriesTmdbId, seasons).then((list) => {
      if (active) setFriends(list);
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
    <section data-tour="sheet-friends">
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
