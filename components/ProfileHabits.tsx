import React from 'react';
import { Clapperboard, Ticket, Tv } from 'lucide-react';
import { UserProfile } from '../types';
import { GENRES } from '../constants';
import { PLATFORMS } from '../utils/platforms';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import PlatformCard from './PlatformCard';

export type Habits = Pick<UserProfile, 'viewingPreference' | 'streamingPlatforms' | 'favoriteGenres'>;

/**
 * « Mes habitudes » : ce qui règle Découvrir et Trailers. Chaque geste est
 * enregistré tout de suite, sans bouton Valider.
 */
const ProfileHabits = React.forwardRef<HTMLDivElement, { profile: UserProfile; onChange: (patch: Habits) => void }>(
  ({ profile, onChange }, ref) => {
    const { t } = useLanguage();
    const platforms = profile.streamingPlatforms ?? [];
    const genres = profile.favoriteGenres ?? [];
    const where = profile.viewingPreference;

    const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

    const card = 'bg-white dark:bg-[#1a1a1a] rounded-[1.8rem] p-4 border border-sand dark:border-white/5 shadow-sm space-y-3';
    const label = 'text-[9px] font-black uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500';
    const help = 'text-[11px] font-medium text-stone-500 dark:text-stone-400 leading-snug';

    return (
      <div ref={ref} className="space-y-3 scroll-mt-6">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500 ml-1">{t('habits.title')}</h3>

        <div className={card}>
          <span className={label}>{t('habits.where')}</span>
          <div role="group" aria-label={t('habits.where')} className="flex gap-1 p-1 rounded-2xl bg-stone-100 dark:bg-white/5">
            {(
              [
                ['cinema', <Ticket key="c" size={14} />, t('habits.cinema')],
                ['streaming', <Tv key="s" size={14} />, t('habits.streaming')],
                ['both', <Clapperboard key="b" size={14} />, t('habits.both')],
              ] as const
            ).map(([value, icon, text]) => (
              <button
                key={value}
                type="button"
                aria-pressed={where === value}
                onClick={() => {
                  haptics.soft();
                  onChange({ viewingPreference: value });
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-black transition-colors ${
                  where === value ? 'bg-charcoal text-white dark:bg-bitter-lime dark:text-charcoal' : 'text-stone-500 dark:text-stone-400'
                }`}
              >
                {icon}
                {text}
              </button>
            ))}
          </div>
          <p className={help}>{t('habits.whereHelp')}</p>
        </div>

        <div className={card}>
          <span className={label}>{t('habits.platforms')}</span>
          <div className="grid grid-cols-2 gap-2">
            {PLATFORMS.map((p) => (
              <PlatformCard
                key={p.id}
                platform={p}
                selected={platforms.includes(p.id)}
                caption={platforms.includes(p.id) ? t('habits.subscribed') : t('habits.add')}
                onToggle={() => {
                  haptics.soft();
                  onChange({ streamingPlatforms: toggle(platforms, p.id) });
                }}
              />
            ))}
          </div>
          <p className={help}>{t('habits.platformsHelp')}</p>
        </div>

        <div className={card}>
          <span className={label}>{t('habits.genres')}</span>
          <div className="flex flex-wrap gap-1.5">
            {GENRES.map((g) => {
              const on = genres.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    haptics.soft();
                    onChange({ favoriteGenres: toggle(genres, g) });
                  }}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold transition-colors ${
                    on ? 'bg-bitter-lime text-charcoal' : 'bg-stone-100 dark:bg-white/5 text-stone-500 dark:text-stone-400'
                  }`}
                >
                  {g}
                </button>
              );
            })}
          </div>
          <p className={help}>{t('habits.genresHelp')}</p>
        </div>
      </div>
    );
  }
);

export default ProfileHabits;
