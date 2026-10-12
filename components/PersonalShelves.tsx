import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronRight, Tv } from 'lucide-react';
import { UserProfile } from '../types';
import { tmdbImage } from '../utils/tmdbImage';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import { myPlatforms } from '../utils/platforms';
import { ShelfItem, getOnMyPlatforms, getStarterPicks } from '../services/shelves';
import { getTheatreReleases } from '../services/tmdb';

type ShelfKind = 'platforms' | 'cinema' | 'starter';

/** Un compte qui a noté moins que ça part de ses genres préférés. */
const STARTER_UNTIL = 3;

/**
 * L'ordre des rangées suit « Où je regarde » : le streaming voit d'abord ses
 * plateformes, le cinéma d'abord les sorties de la semaine.
 */
export const shelfOrder = (preference: UserProfile['viewingPreference']): ShelfKind[] =>
  preference === 'cinema'
    ? ['cinema', 'starter', 'platforms']
    : preference === 'both'
      ? ['cinema', 'platforms', 'starter']
      : preference === 'streaming'
        ? ['platforms', 'starter', 'cinema']
        : ['starter', 'platforms', 'cinema'];

interface Props {
  mediaType: 'movie' | 'tv';
  profile: UserProfile;
  onPreview: (id: number, mediaType: 'movie' | 'tv') => void;
  /** Ouvre « Mes habitudes » dans le profil, pour choisir ses plateformes. */
  onEditHabits?: () => void;
  /** Les sorties de la semaine vivent dans le calendrier : le bandeau y mène. */
  onOpenCalendar?: () => void;
}

const PersonalShelves: React.FC<Props> = ({ mediaType, profile, onPreview, onEditHabits, onOpenCalendar }) => {
  const { t } = useLanguage();
  const platforms = myPlatforms(profile.streamingPlatforms);
  const genres = profile.favoriteGenres ?? [];
  const rated = profile.movies.filter((m) => m.status === 'watched').length;
  const seen = useMemo(
    () => new Set(profile.movies.filter((m) => m.status === 'watched' && (m.mediaType ?? 'movie') === mediaType).map((m) => m.tmdbId)),
    [profile.movies, mediaType]
  );
  const [rows, setRows] = useState<Partial<Record<ShelfKind, ShelfItem[]>>>({});

  // Sans plateforme déclarée, sa rangée laisse la place à l'invitation à les choisir.
  const missingPlatforms = profile.viewingPreference !== 'cinema' && platforms.length === 0 && !!onEditHabits;
  const wanted = shelfOrder(profile.viewingPreference).filter((kind) =>
    kind === 'platforms' ? platforms.length > 0 || missingPlatforms : kind === 'cinema' ? mediaType === 'movie' : rated < STARTER_UNTIL && genres.length > 0
  );
  const platformKey = platforms.map((p) => p.id).join(',');
  const genreKey = genres.join(',');

  useEffect(() => {
    let alive = true;
    setRows({});
    const load = (kind: ShelfKind, promise: Promise<ShelfItem[]>) =>
      promise.then((items) => alive && setRows((prev) => ({ ...prev, [kind]: items }))).catch(() => alive && setRows((prev) => ({ ...prev, [kind]: [] })));
    if (wanted.includes('platforms') && platforms.length) load('platforms', getOnMyPlatforms(mediaType, platforms.map((p) => p.id)));
    if (wanted.includes('starter')) load('starter', getStarterPicks(mediaType, genres));
    if (wanted.includes('cinema'))
      load(
        'cinema',
        getTheatreReleases('FR').then((r) =>
          r.thisWeek.map((m) => ({ id: m.id, title: m.title, posterPath: m.posterPath, year: Number(m.releaseDate?.slice(0, 4)) || undefined }))
        )
      );
    return () => {
      alive = false;
    };
  }, [mediaType, platformKey, genreKey, wanted.join(',')]);

  if (!wanted.length) return null;

  const head: Record<ShelfKind, { title: string; sub?: string }> = {
    platforms: { title: t('shelves.platforms'), sub: platforms.map((p) => p.name).join(' · ') },
    cinema: { title: t('shelves.cinema') },
    starter: { title: t('shelves.starter'), sub: genres.slice(0, 3).join(' · ') },
  };

  return (
    <div className="space-y-6">
      {wanted.map((kind) => {
        // Le ciné de la semaine : un bandeau d'une ligne, le détail est dans le calendrier.
        if (kind === 'cinema' && onOpenCalendar) {
          const films = (rows.cinema ?? []).filter((i) => i.posterPath);
          if (rows.cinema && films.length === 0) return null;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => {
                haptics.medium();
                onOpenCalendar();
              }}
              className="w-full flex items-center gap-3 p-3 pr-4 rounded-[1.6rem] bg-white dark:bg-[#1a1a1a] border border-stone-100 dark:border-white/5 text-left active:scale-[0.98] transition-transform"
            >
              <span className="flex shrink-0 pl-1" aria-hidden="true">
                {rows.cinema == null
                  ? [0, 1, 2].map((i) => <span key={i} className="-ml-2 first:ml-0 w-9 aspect-[2/3] rounded-lg bg-stone-100 dark:bg-[#161616] ring-2 ring-white dark:ring-[#1a1a1a]" />)
                  : films.slice(0, 4).map((film, i) => (
                      <img
                        key={film.id}
                        src={tmdbImage(film.posterPath, 'w92')}
                        alt=""
                        className="-ml-3 first:ml-0 w-9 aspect-[2/3] rounded-lg object-cover ring-2 ring-white dark:ring-[#1a1a1a] shadow-sm"
                        style={{ zIndex: 4 - i, transform: `rotate(${(i - 1.5) * 3}deg)` }}
                      />
                    ))}
              </span>
              <span className="flex-1 min-w-0">
                <b className="block text-[13.5px] font-black tracking-[-0.02em] text-charcoal dark:text-white">{t('shelves.cinemaBanner')}</b>
                <small className="block text-[11px] font-semibold text-stone-500 dark:text-stone-400">
                  {rows.cinema == null ? t('shelves.cinemaLoading') : t('shelves.cinemaCount', { n: String(films.length) })}
                </small>
              </span>
              <span className="shrink-0 flex items-center gap-1 text-[11px] font-black text-forest dark:text-bitter-lime">
                <CalendarDays size={14} />
                <ChevronRight size={15} />
              </span>
            </button>
          );
        }
        if (kind === 'platforms' && platforms.length === 0) {
          return (
        <button
          key={kind}
          type="button"
          onClick={() => {
            haptics.medium();
            onEditHabits?.();
          }}
          className="w-full flex items-center gap-3 p-4 rounded-[1.6rem] bg-white dark:bg-[#1a1a1a] border border-stone-100 dark:border-white/5 text-left active:scale-[0.98] transition-transform"
        >
          <span className="w-10 h-10 rounded-xl bg-bitter-lime/25 dark:bg-bitter-lime/15 text-charcoal dark:text-bitter-lime flex items-center justify-center shrink-0">
            <Tv size={18} />
          </span>
          <span className="flex-1 min-w-0">
            <b className="block text-[13px] font-black text-charcoal dark:text-white">{t('shelves.choosePlatforms')}</b>
            <small className="block text-[11px] font-medium text-stone-500 dark:text-stone-400">{t('shelves.choosePlatformsBody')}</small>
          </span>
          <ChevronRight size={18} className="text-stone-300 shrink-0" />
        </button>
          );
        }
        const items = (rows[kind] ?? []).filter((i) => !seen.has(i.id)).slice(0, 14);
        if (rows[kind] && items.length === 0) return null;
        return (
          <section key={kind} className="space-y-3" aria-label={head[kind].title}>
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h3 className="text-[15px] font-black tracking-[-0.03em] text-charcoal dark:text-white">{head[kind].title}</h3>
              {head[kind].sub && <span className="text-[10.5px] font-bold text-stone-400 dark:text-stone-500 truncate">{head[kind].sub}</span>}
            </div>
            {kind === 'starter' && <p className="px-1 -mt-1.5 text-[11.5px] font-medium text-stone-500 dark:text-stone-400">{t('shelves.starterHint')}</p>}
            <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
              {rows[kind] == null
                ? [...Array(5)].map((_, i) => (
                    <div key={i} className="shrink-0 w-[104px] aspect-[2/3] rounded-[1.4rem] bg-stone-100 dark:bg-[#161616] relative overflow-hidden">
                      <div className="absolute inset-0 shimmer" />
                    </div>
                  ))
                : items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        haptics.medium();
                        onPreview(item.id, mediaType);
                      }}
                      className="shrink-0 w-[104px] text-left active:scale-95 transition-transform"
                    >
                      <img
                        src={tmdbImage(item.posterPath, 'w185')}
                        alt=""
                        loading="lazy"
                        className="w-full aspect-[2/3] object-cover rounded-[1.4rem] bg-stone-100 dark:bg-[#161616] shadow-sm"
                      />
                      <span className="mt-1.5 block text-[11px] font-black leading-tight text-charcoal dark:text-white line-clamp-2">{item.title}</span>
                    </button>
                  ))}
            </div>
          </section>
        );
      })}

    </div>
  );
};

export default PersonalShelves;
