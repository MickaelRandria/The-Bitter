import React, { useEffect, useMemo, useState } from 'react';
import { TmdbSeasonSummary } from '../services/tmdb';
import { EpisodePosition } from '../utils/upNext';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  seasons: TmdbSeasonSummary[];
  /** Le dernier épisode vu, ou `null` tant que rien n'est choisi. */
  value: EpisodePosition | null;
  onChange: (value: EpisodePosition | null) => void;
  /** La saison ouverte au départ, par exemple celle du marque-page. */
  initialSeason?: number;
}

/**
 * Choisir le dernier épisode vu : une saison, puis un numéro.
 *
 * Seulement des numéros : le titre d'un épisode non vu est un spoiler. Sert à
 * « Tu en es où ? » comme à l'ajout d'une série déjà commencée.
 */
const EpisodePicker: React.FC<Props> = ({ seasons, value, onChange, initialSeason }) => {
  const { t } = useLanguage();
  const regular = useMemo(
    () =>
      seasons
        .filter((s) => s.seasonNumber > 0 && s.episodeCount > 0)
        .sort((a, b) => a.seasonNumber - b.seasonNumber),
    [seasons]
  );
  const [season, setSeason] = useState<number | null>(null);

  useEffect(() => {
    if (season != null || regular.length === 0) return;
    const start = value?.season ?? initialSeason;
    setSeason(regular.some((s) => s.seasonNumber === start) ? start! : regular[0].seasonNumber);
  }, [regular, season, value?.season, initialSeason]);

  const current = regular.find((s) => s.seasonNumber === season);
  const lastSeen = value?.season === season ? value.episode : null;

  return (
    <div className="space-y-4">
      {regular.length > 1 && (
        <div role="tablist" className="-mx-6 flex gap-2 overflow-x-auto no-scrollbar px-6">
          {regular.map((s) => (
            <button
              key={s.seasonNumber}
              type="button"
              role="tab"
              aria-selected={s.seasonNumber === season}
              onClick={() => {
                haptics.soft();
                setSeason(s.seasonNumber);
                onChange(null);
              }}
              className={`shrink-0 rounded-full px-3.5 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${
                s.seasonNumber === season
                  ? 'bg-charcoal text-white dark:bg-white dark:text-charcoal'
                  : 'border border-sand bg-white text-stone-400 dark:border-white/10 dark:bg-[#1a1a1a] dark:text-stone-500'
              }`}
            >
              {t('bookmark.season', { season: s.seasonNumber })}
            </button>
          ))}
        </div>
      )}

      {current && (
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: current.episodeCount }, (_, i) => i + 1).map((episode) => {
            const seen = lastSeen != null && episode <= lastSeen;
            return (
              <button
                key={episode}
                type="button"
                onClick={() => {
                  haptics.soft();
                  onChange(episode === lastSeen ? null : { season: current.seasonNumber, episode });
                }}
                aria-pressed={episode === lastSeen}
                aria-label={t('bookmark.episodeAria', { episode })}
                className={`aspect-square rounded-xl text-[13px] font-black tabular-nums transition-all active:scale-90 ${
                  seen
                    ? episode === lastSeen
                      ? 'bg-forest text-white ring-2 ring-forest/30 dark:bg-bitter-lime dark:text-black dark:ring-bitter-lime/30'
                      : 'bg-forest/15 text-forest dark:bg-bitter-lime/15 dark:text-bitter-lime'
                    : 'border border-sand bg-white text-stone-500 dark:border-white/10 dark:bg-[#1a1a1a] dark:text-stone-400'
                }`}
              >
                {episode}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EpisodePicker;
