import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Lock, Share2, X } from 'lucide-react';
import { Movie } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';
import { useDialog } from '../../utils/useDialog';
import { shareImage } from '../../utils/shareImage';
import { CalendarWatch } from '../../utils/calendarAgenda';
import { getDisplayWeightedRating } from '../../utils/rating';
import { criteriaOf } from '../../utils/verdict';
import { fetchTextlessPoster } from '../../services/tmdb';
import {
  formatRuntime,
  MIN_FILMS,
  NAVET_MAX,
  shortQuote,
  topCriteria,
  YearCriterion,
  YearFilm,
  yearStories,
  YearStories,
} from '../../utils/yearStories';
import { PosterSegment, PosterSpec, PosterVariant, renderYearPoster } from './renderYearPoster';

/*
 * « Mon année en affiches » : trois stories au format d'une affiche de cinéma.
 *   1. Le film de l'année et les chiffres de l'année au générique.
 *   2. La révélation : le film qui a le plus dépassé ton attente.
 *   3. Le navet : ta pire note, couronne à l'envers.
 * Une affiche dont les données manquent s'affiche verrouillée, avec ce qu'il faut faire.
 */

type TFunction = (key: string, params?: Record<string, string | number>) => string;

const VARIANTS: PosterVariant[] = ['affiche', 'revelation', 'navet'];
const WORST_MAX = 6;

const CRITERION_LABEL: Record<YearCriterion, string> = {
  story: 'criteria.story',
  visuals: 'criteria.visuals',
  acting: 'criteria.acting',
  sound: 'criteria.sound',
};

/** Les films vus dans l'année, une ligne par film, avec tous ses jours de visionnage. */
export function yearFilmsOf(history: readonly CalendarWatch[], movies: readonly Movie[], year: number): YearFilm[] {
  const byId = new Map(movies.map((m) => [m.id, m]));
  const days = new Map<string, string[]>();
  for (const watch of history) {
    if (!watch.day.startsWith(`${year}-`)) continue;
    days.set(watch.movieId, [...(days.get(watch.movieId) ?? []), watch.day]);
  }
  const films: YearFilm[] = [];
  for (const [id, list] of days) {
    const movie = byId.get(id);
    if (!movie) continue;
    films.push({
      id,
      title: movie.title,
      posterUrl: movie.posterUrl,
      tmdbId: movie.mediaType === 'tv' ? undefined : movie.tmdbId,
      score: getDisplayWeightedRating(movie),
      hype: typeof movie.hype === 'number' ? movie.hype : undefined,
      runtime: movie.runtime,
      review: movie.review || movie.comment,
      criteria: criteriaOf({
        adaptive_rating: movie.adaptiveRating ?? null,
        story: movie.ratings?.story,
        visuals: movie.ratings?.visuals,
        acting: movie.ratings?.acting,
        sound: movie.ratings?.sound,
      } as never),
      days: list.sort(),
    });
  }
  return films;
}

/** Les prénoms posés par défaut à la création du compte ne s'affichent pas. */
const PLACEHOLDER_NAMES = new Set(['utilisateur', 'moi', 'user', 'me']);
export const displayName = (name?: string) => {
  const clean = name?.trim();
  return clean && !PLACEHOLDER_NAMES.has(clean.toLowerCase()) ? clean : undefined;
};

const small = (text: string): PosterSegment => ({ text, tone: 'small' });
const big = (text: string): PosterSegment => ({ text, tone: 'big' });
const lime = (text: string): PosterSegment => ({ text, tone: 'lime' });

interface SpecContext {
  t: TFunction;
  locale: string;
  year: number;
  firstName?: string;
}

const posterUrls = (film: YearFilm, textless: Map<string, string | null>) => {
  const urls: string[] = [];
  const clean = textless.get(film.id);
  if (clean) urls.push(clean);
  if (film.posterUrl) {
    urls.push(film.posterUrl.replace(/\/t\/p\/[^/]+\//, '/t/p/original/'));
    urls.push(film.posterUrl);
  }
  return urls;
};

/** Ce que raconte chaque affiche, ou null si les données ne suffisent pas. */
export function buildSpecs(
  data: YearStories,
  textless: Map<string, string | null>,
  { t, locale, year, firstName }: SpecContext
): Record<PosterVariant, PosterSpec | null> {
  const one = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const signed = (n: number) => `${n >= 0 ? '+' : '−'}${one(Math.abs(n))}`;
  const day = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
  const criterion = (key: YearCriterion) => t(CRITERION_LABEL[key]);
  const common = {
    presents: t('yearStory.presents'),
    byline: firstName ? t('yearStory.byline', { name: firstName }) : t('yearStory.bylineAnon'),
  };

  let affiche: PosterSpec | null = null;
  if (data.best && data.count >= MIN_FILMS) {
    const bill: PosterSegment[][] = [];
    bill.push([
      small(t('yearStory.with')),
      big(t('yearStory.films', { n: data.count })),
      ...(data.hours > 0 ? [small(t('yearStory.and')), big(t('yearStory.hours', { n: data.hours }))] : []),
    ]);
    if (data.casting.length) bill.push([small(t('yearStory.casting')), big(data.casting.map((f) => f.title).join(' · '))]);
    bill.push(
      data.signature
        ? [
            small(t('yearStory.signature')),
            lime(`${criterion(data.signature.key)} ${signed(data.signature.gap)}`),
            small(t('yearStory.average')),
            big(one(data.average)),
          ]
        : [small(t('yearStory.average')), lime(one(data.average))]
    );
    const last: PosterSegment[] = [];
    // « Pire soirée » pour un film noté 8 sonnerait faux : seulement à 6 ou moins.
    if (data.worst && data.worst.score <= WORST_MAX) last.push(small(t('yearStory.worst')), big(`${data.worst.title} ${one(data.worst.score)}`));
    const surprise = data.surprises.find((s) => s.film.id !== data.best!.id);
    if (surprise) last.push(small(t('yearStory.bestSurprise')), big(surprise.film.title));
    if (last.length) bill.push(last);
    affiche = {
      variant: 'affiche',
      imageUrls: posterUrls(data.best, textless),
      ...common,
      laurel: { label: t('yearStory.laurel.affiche'), title: data.best.title, score: one(data.best.score) },
      sub: t('yearStory.sub.affiche'),
      title: String(year),
      bill,
      foot: t('yearStory.footNotes'),
    };
  }

  let revelation: PosterSpec | null = null;
  const top = data.surprises[0];
  if (top) {
    const f = top.film;
    const bill: PosterSegment[][] = [
      [
        small(t('yearStory.expected')),
        big(one(f.hype!)),
        small(t('yearStory.rated')),
        big(one(f.score)),
        small(t('yearStory.seenOn')),
        big(day(f.days[0])),
      ],
    ];
    const crits = topCriteria(f.criteria);
    if (crits.length) {
      bill.push([
        small(t('yearStory.gotMe')),
        lime(`${criterion(crits[0].key)} ${one(crits[0].value)}`),
        ...(crits[1] ? [small(criterion(crits[1].key)), big(one(crits[1].value))] : []),
      ]);
    }
    const quote = shortQuote(f.review);
    if (quote) bill.push([small(t('yearStory.myReview')), big(`« ${quote} »`)]);
    const others = data.surprises.slice(1, 3);
    if (others.length)
      bill.push([small(t('yearStory.otherSurprises')), big(others.map((s) => `${s.film.title} ${signed(s.gap)}`).join(' · '))]);
    revelation = {
      variant: 'revelation',
      imageUrls: posterUrls(f, textless),
      ...common,
      laurel: { label: t('yearStory.laurel.revelation'), title: f.title, score: one(f.score) },
      sub: t('yearStory.sub.revelation'),
      title: signed(top.gap),
      bill,
      foot: t('yearStory.footHype'),
    };
  }

  let navet: PosterSpec | null = null;
  if (data.navet) {
    const f = data.navet;
    const first: PosterSegment[] = [small(t('yearStory.seenOn')), big(day(f.days[0]))];
    if (f.runtime) first.push(small(t('yearStory.during')), big(t('yearStory.endless', { d: formatRuntime(f.runtime) })));
    const quote = shortQuote(f.review);
    const bill: PosterSegment[][] = [first, [small(t('yearStory.verdict')), lime(quote ? `« ${quote} »` : t('yearStory.forget'))]];
    const crits = f.criteria ? (['story', 'visuals', 'acting', 'sound'] as YearCriterion[]) : [];
    if (crits.length) bill.push(crits.flatMap((key) => [small(criterion(key)), big(one(f.criteria![key]))]));
    bill.push([
      small(t('yearStory.recommendedTo')),
      big(t('yearStory.nobody')),
      small(t('yearStory.rewatch')),
      big(t('yearStory.never')),
    ]);
    navet = {
      variant: 'navet',
      imageUrls: posterUrls(f, textless),
      ...common,
      laurel: { label: t('yearStory.laurel.navet'), title: f.title, score: one(f.score) },
      sub: t('yearStory.sub.navet'),
      title: t('yearStory.title.navet'),
      bill,
      foot: t('yearStory.footNotes'),
    };
  }

  return { affiche, revelation, navet };
}

interface Props {
  year: number;
  history: readonly CalendarWatch[];
  movies: readonly Movie[];
  firstName?: string;
  onClose: () => void;
  onToast?: (message: string) => void;
}

export default function YearStoriesSheet({ year, history, movies, firstName, onClose, onToast }: Props) {
  const { t, language } = useLanguage();
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  const dialog = useDialog(onClose, t('yearStory.title'));
  const data = useMemo(() => yearStories(yearFilmsOf(history, movies, year)), [history, movies, year]);
  const [images, setImages] = useState<Partial<Record<PosterVariant, string>>>({});
  const [failed, setFailed] = useState<Partial<Record<PosterVariant, boolean>>>({});
  const [specs, setSpecs] = useState<Record<PosterVariant, PosterSpec | null> | null>(null);
  const [sharing, setSharing] = useState<PosterVariant | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const featured = [data.best, data.surprises[0]?.film, data.navet].filter((f): f is YearFilm => !!f);
      const textless = new Map<string, string | null>();
      await Promise.all(
        featured.map(async (f) => textless.set(f.id, f.tmdbId ? await fetchTextlessPoster(f.tmdbId) : null))
      );
      const built = buildSpecs(data, textless, { t, locale, year, firstName: displayName(firstName) });
      if (!alive) return;
      setSpecs(built);
      // Une affiche après l'autre : trois canvas 1080 × 1920 d'un coup pèsent lourd sur un vieux téléphone.
      for (const variant of VARIANTS) {
        const spec = built[variant];
        if (!spec) continue;
        try {
          const url = await renderYearPoster(spec);
          if (!alive) return;
          setImages((current) => ({ ...current, [variant]: url }));
        } catch {
          if (alive) setFailed((current) => ({ ...current, [variant]: true }));
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, year, firstName, language]);

  const share = async (variant: PosterVariant) => {
    const url = images[variant];
    if (!url || sharing) return;
    setSharing(variant);
    try {
      const outcome = await shareImage(url, `the-bitter-${year}-${variant}.png`, {
        title: t('yearStory.shareTitle'),
        text: t('yearStory.shareText'),
      });
      if (outcome !== 'cancelled') onToast?.(t(outcome === 'downloaded' ? 'yearStory.downloaded' : 'yearStory.shared'));
    } catch {
      onToast?.(t('yearStory.error'));
    } finally {
      setSharing(null);
    }
  };

  const lockedText = (variant: PosterVariant) =>
    variant === 'affiche'
      ? t('yearStory.locked.affiche', { n: MIN_FILMS })
      : variant === 'revelation'
        ? t('yearStory.locked.revelation')
        : t('yearStory.locked.navet', { max: NAVET_MAX });

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/85 backdrop-blur-xl sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        {...dialog.props}
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-[100dvh] w-full flex-col overflow-hidden border border-white/10 bg-[#0c0c0c] sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-[2.5rem]"
      >
        <div
          className="flex shrink-0 items-start justify-between gap-3 px-6 pb-4"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)' }}
        >
          <div className="min-w-0">
            <h2 className="text-xl font-black leading-none tracking-tighter text-white">{t('yearStory.title')}</h2>
            <p className="mt-1.5 text-[10px] font-black uppercase tracking-widest text-stone-500">
              {t('yearStory.subtitle', { year })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('yearStory.close')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10 text-stone-300 transition-all hover:bg-white/20 active:scale-90"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        <div
          className="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-6 sm:grid sm:grid-cols-3 sm:overflow-visible"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}
        >
          {VARIANTS.map((variant) => {
            const ready = images[variant];
            const locked = specs ? !specs[variant] : false;
            return (
              <section key={variant} className="flex w-[72vw] max-w-[300px] shrink-0 snap-center flex-col gap-3 sm:w-auto">
                <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-white/10 bg-[#151514]">
                  {ready && <img src={ready} alt={t(`yearStory.name.${variant}`)} className="h-full w-full object-cover" />}
                  {!ready && !locked && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-[11px] font-bold text-stone-500">
                      {failed[variant] ? t('yearStory.error') : (<><Loader2 size={18} className="animate-spin" />{t('yearStory.preparing')}</>)}
                    </div>
                  )}
                  {locked && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                      <Lock size={18} className="text-stone-500" />
                      <p className="text-[12px] font-semibold leading-relaxed text-stone-400">{lockedText(variant)}</p>
                    </div>
                  )}
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">{t(`yearStory.name.${variant}`)}</p>
                {!locked && (
                  <button
                    type="button"
                    disabled={!ready || sharing !== null}
                    onClick={() => void share(variant)}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-[#D9FF00] px-4 py-3 text-[11px] font-black uppercase tracking-widest text-black transition-all active:scale-95 disabled:opacity-30"
                  >
                    {sharing === variant ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
                    {t('yearStory.share')}
                  </button>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
