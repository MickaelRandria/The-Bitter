import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Share2, Sparkles, SlidersHorizontal } from 'lucide-react';
import { Movie, UserProfile } from '../../types';
import { TMDB_API_KEY, TMDB_BASE_URL } from '../../constants';
import { useLanguage } from '../../contexts/LanguageContext';
import { haptics } from '../../utils/haptics';
import { tmdbImage } from '../../utils/tmdbImage';
import { resizeTmdbImage } from '../../utils/tmdbImage';
import { getDisplayWeightedRating } from '../../utils/rating';
import { fmt1 } from '../../utils/verdict';
import { podiumOf, signatureOf, yearOf } from '../../utils/profileStats';
import { formatCurrency, getSubscriptionStats } from '../../utils/cinemaSubscription';
import TastePortrait, { PORTRAIT_MIN_MOVIES } from '../TastePortrait';

/**
 * L'onglet Profil des statistiques, en salle obscure : le film le mieux noté en
 * plein cadre, puis le pass ciné, la signature, le podium, les constats et
 * l'année. Les chiffres viennent d'AnalyticsView ; ce composant les met en scène.
 */

interface Archetype {
  title: string;
  description: string;
  tag?: string;
  secondaryTrait?: string;
}

interface Props {
  movies: Movie[];
  userProfile: UserProfile | null;
  archetype: Archetype;
  totalHours: number;
  /** Ma moyenne moins celle du public ; null sans note du public. */
  delta: number | null;
  /** Les 12 derniers mois, du plus ancien au mois en cours. */
  months: { count: number }[];
  tabs: React.ReactNode;
  /** Les constats, rendus par AnalyticsView. */
  constats: React.ReactNode;
  isSharing: boolean;
  onShare: () => void;
  onViewMovie?: (movie: Movie, onReturn?: () => void) => void;
  onOpenPalmares: () => void;
  onConfigureCinemaSubscription?: () => void;
  onOpenCinemaDetails?: () => void;
  onRecalibrate?: () => void;
}

const CRITERION_LABEL: Record<string, string> = {
  story: 'criteria.story',
  visuals: 'criteria.visuals',
  acting: 'criteria.acting',
  sound: 'criteria.sound',
};

/** L'image large d'un film, gardée une semaine : le hero ne la redemande pas à chaque visite. */
function useBackdrop(movie: Movie | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!movie?.tmdbId) return;
    const type = movie.mediaType ?? 'movie';
    const key = `bitter_backdrop_${type}_${movie.tmdbId}`;
    try {
      const cached = JSON.parse(localStorage.getItem(key) || 'null');
      if (cached && Date.now() - cached.at < 7 * 864e5) {
        setUrl(cached.path ? tmdbImage(cached.path, 'w780') : null);
        return;
      }
    } catch {
      // Cache illisible : on redemande.
    }
    let alive = true;
    fetch(`${TMDB_BASE_URL}/${type}/${movie.tmdbId}?api_key=${TMDB_API_KEY}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const path: string | null = data?.backdrop_path ?? null;
        try {
          localStorage.setItem(key, JSON.stringify({ at: Date.now(), path }));
        } catch {
          // Stockage plein : l'image se recharge la prochaine fois.
        }
        if (alive) setUrl(path ? tmdbImage(path, 'w780') : null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [movie?.tmdbId, movie?.mediaType]);
  return url;
}

/** Couleur du billet avant rentabilité : celle de l'enseigne. */
const PASS_BRAND: Record<string, { bg: string; fg: string; mark: string }> = {
  ugc: { bg: '#12307E', fg: '#ffffff', mark: 'UGC' },
  pathe: { bg: '#F2B705', fg: '#1A1A1A', mark: 'PATHÉ' },
  custom: { bg: '#2A2826', fg: '#ffffff', mark: 'PASS' },
};

const CinemaPass: React.FC<{
  movies: Movie[];
  userProfile: UserProfile | null;
  onConfigure?: () => void;
  onOpenDetails?: () => void;
}> = ({ movies, userProfile, onConfigure, onOpenDetails }) => {
  const { t, language } = useLanguage();
  const sub = userProfile?.cinemaSubscription;
  const ticket = 'relative flex w-full text-left rounded-[22px] overflow-hidden drop-shadow-[0_14px_18px_rgba(0,0,0,0.35)] active:scale-[0.99] transition-transform';
  const notch = 'before:absolute before:-left-[10px] before:-top-[9px] before:w-[18px] before:h-[18px] before:rounded-full before:bg-[#0c0c0c] after:absolute after:-left-[10px] after:-bottom-[9px] after:w-[18px] after:h-[18px] after:rounded-full after:bg-[#0c0c0c]';

  if (!sub || !sub.active) {
    if (!onConfigure) return null;
    return (
      <button type="button" onClick={() => { haptics.soft(); onConfigure(); }} className={ticket}>
        <span className="relative flex-1 min-w-0 px-4 py-3.5 bg-[#24221F] text-white">
          <span className="block text-[9px] font-black uppercase tracking-[0.17em] text-white/70">{t('cinemaSub.card.title')}</span>
          <span className="block mt-1.5 text-[14px] font-black text-balance">{t('cinemaSub.card.emptyTitle')}</span>
          <span className="block mt-0.5 text-[11px] font-bold text-white/75">{t('cinemaSub.card.emptySub')}</span>
          <span className="inline-flex mt-2.5 px-3 py-2 rounded-full bg-bitter-lime text-charcoal text-[11px] font-black">{t('cinemaSub.card.configure')}</span>
        </span>
        <span className={`relative w-[82px] shrink-0 flex flex-col items-center justify-center gap-1 bg-[#24221F] text-white border-l-2 border-dashed border-white/25 ${notch}`}>
          <b className="text-[26px] font-black tracking-[-0.06em] leading-none">?</b>
          <small className="text-[8.5px] font-black uppercase tracking-[0.14em] opacity-70">{t('pt.sessions')}</small>
        </span>
      </button>
    );
  }

  const stats = getSubscriptionStats(movies, sub, 'currentMonth', new Date());
  const brand = PASS_BRAND[sub.provider] ?? PASS_BRAND.custom;
  const won = stats.isProfitable;
  const bg = won ? '#3E5238' : brand.bg;
  const fg = won ? '#ffffff' : brand.fg;
  // Une case par séance, et le seuil de rentabilité marqué d'un trait.
  const breakEven = sub.referenceTicketPrice > 0 ? Math.max(1, Math.ceil(sub.monthlyPrice / sub.referenceTicketPrice)) : 0;
  const cells = Math.min(12, Math.max(stats.sessions, breakEven));
  const month = new Date().toLocaleDateString(language === 'en' ? 'en-GB' : 'fr-FR', { month: 'long' });

  return (
    <button
      type="button"
      onClick={() => { haptics.soft(); onOpenDetails?.(); }}
      className={ticket}
      style={{ color: fg }}
      aria-label={`${t('cinemaSub.card.title')} · ${month}`}
    >
      <span className="relative isolate flex-1 min-w-0 px-4 pt-3.5 pb-3 overflow-hidden" style={{ backgroundColor: bg }}>
        <span className="absolute inset-0 -z-10 bg-[radial-gradient(130%_150%_at_0%_0%,rgba(255,255,255,0.2),transparent_55%)]" />
        <span aria-hidden="true" className="absolute -right-1.5 -bottom-4 -z-10 text-[56px] font-black tracking-[-0.07em] leading-none opacity-[0.08] whitespace-nowrap">{brand.mark}</span>
        <span className="block text-[9px] font-black uppercase tracking-[0.17em] opacity-80 truncate">
          {sub.name} · {formatCurrency(sub.monthlyPrice, language)}{t('pt.perMonth')}
        </span>
        {won ? (
          <>
            <span className="block mt-1.5 text-[27px] font-black tracking-[-0.06em] leading-none tabular-nums text-bitter-lime">
              +{formatCurrency(stats.netSavings, language)}
            </span>
            <span className="block mt-1 text-[11px] font-extrabold opacity-85">{t('cinemaSub.card.savedThisMonth')}</span>
          </>
        ) : (
          <>
            <span className="block mt-1.5 text-[clamp(19px,6vw,23px)] font-black tracking-[-0.055em] leading-none whitespace-nowrap">
              {t(stats.sessionsToBreakEven > 1 ? 'pt.sessionsLeftMany' : 'cinemaSub.card.sessionsLeft', { count: String(stats.sessionsToBreakEven) })}
            </span>
            <span className="block mt-1 text-[11px] font-extrabold opacity-85">{t('cinemaSub.card.toBreakEven')}</span>
          </>
        )}
        {/* Les cases sur une ligne qui se resserre, la légende dessous : rien ne déborde du billet. */}
        {cells > 0 && (
          <span className="flex items-center gap-[3px] mt-3 min-w-0" aria-hidden="true">
            {Array.from({ length: cells }, (_, i) => (
              <i
                key={i}
                className="relative flex-1 min-w-[5px] max-w-[15px] h-[10px] rounded-[2.5px]"
                style={{ backgroundColor: i < stats.sessions ? fg : won || fg === '#ffffff' ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)' }}
              >
                {i === breakEven - 1 && <span className="absolute -right-[3px] -top-[5px] w-[2px] h-[20px] rounded-full bg-bitter-lime" />}
              </i>
            ))}
          </span>
        )}
        {cells > 0 && (
          <span className="block mt-1.5 text-[10px] font-extrabold opacity-75 truncate">
            {won
              ? t('pt.breakEvenAt', { n: String(breakEven) })
              : t('cinemaSub.card.valueOnCost', { value: formatCurrency(stats.value, language), cost: formatCurrency(stats.cost, language) })}
          </span>
        )}
      </span>
      <span
        className={`relative w-[82px] shrink-0 flex flex-col items-center justify-center gap-1 border-l-2 border-dashed ${notch}`}
        style={{ backgroundColor: bg, borderColor: fg === '#ffffff' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)' }}
      >
        <b className="text-[26px] font-black tracking-[-0.06em] leading-none tabular-nums">{stats.sessions}</b>
        <small className="text-[8.5px] font-black uppercase tracking-[0.14em] opacity-70">{t('pt.sessions')}</small>
      </span>
    </button>
  );
};

const SectionHead: React.FC<{ title: string; aside?: React.ReactNode }> = ({ title, aside }) => (
  <div className="flex items-baseline justify-between gap-3 px-1">
    <h3 className="text-[17px] font-black tracking-[-0.035em] text-white">{title}</h3>
    {aside}
  </div>
);

const ProfileTab: React.FC<Props> = ({
  movies,
  userProfile,
  archetype,
  totalHours,
  delta,
  months,
  tabs,
  constats,
  isSharing,
  onShare,
  onViewMovie,
  onOpenPalmares,
  onConfigureCinemaSubscription,
  onOpenCinemaDetails,
  onRecalibrate,
}) => {
  const { t, language } = useLanguage();
  const locale = language === 'en' ? 'en-GB' : 'fr-FR';
  const watched = useMemo(() => movies.filter((m) => m.status === 'watched'), [movies]);
  const score = (m: Movie) => getDisplayWeightedRating(m);
  const podium = useMemo(() => podiumOf(watched, score, (m) => m.dateWatched ?? m.dateAdded ?? 0), [watched]);
  const top = podium[0];
  const backdrop = useBackdrop(top);
  const signature = useMemo(() => signatureOf(watched), [watched]);
  const year = yearOf(months.map((m) => m.count));
  const now = new Date();
  const monthName = (i: number, style: 'long' | 'narrow') =>
    new Date(now.getFullYear(), now.getMonth() - (11 - i), 1).toLocaleDateString(locale, { month: style });

  // Le portrait : affiché s'il a déjà été tiré, ou dès qu'on le demande.
  const canPortrait = watched.length >= PORTRAIT_MIN_MOVIES;
  // Toujours affiché dès 10 films : sans portrait, il propose d'en tirer un.
  const [portrait, setPortrait] = useState<'shown' | 'asked'>('shown');
  const portraitRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (portrait === 'asked') portraitRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [portrait]);

  const maxMonth = Math.max(1, ...months.map((m) => m.count));
  const kpi = 'px-3 pt-[11px] pb-2.5';
  const kpiLabel = 'block mt-1 text-[9px] font-extrabold uppercase tracking-[0.1em] text-white/35';
  const card = 'rounded-[22px] bg-[#1C1B19] border border-white/[0.08] px-[15px] py-3.5';

  return (
    <div className="animate-[fadeIn_0.4s_ease-out]">
      {/* 1 · Le film le mieux noté en plein cadre. */}
      <section className="relative isolate -mx-6 -mt-6 h-[470px] overflow-hidden flex flex-col justify-end px-6 pb-[18px]">
        {(backdrop || top?.posterUrl) && (
          <img
            src={backdrop ?? resizeTmdbImage(top?.posterUrl, 'w500') ?? ''}
            alt=""
            className={`absolute inset-[-4%] -z-20 w-[108%] h-[108%] max-w-none object-cover object-[50%_28%] motion-safe:animate-[pt-drift_22s_ease-in-out_infinite_alternate] ${backdrop ? '' : 'blur-md'}`}
          />
        )}
        <span className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(0,0,0,0.62)_0%,rgba(0,0,0,0.05)_26%,rgba(12,12,12,0.55)_52%,rgba(12,12,12,0.94)_76%,#0c0c0c_100%)]" />
        <div className="absolute top-4 left-6 right-6">{tabs}</div>

        <span className="text-[9.5px] font-black uppercase tracking-[0.2em] text-white/55 motion-safe:animate-[pt-rise_0.7s_cubic-bezier(.16,1,.3,1)_both]">
          {t('pt.eyebrow', { n: String(watched.length) })}
        </span>
        <h2 className="mt-1.5 text-[clamp(38px,12vw,52px)] font-black tracking-[-0.07em] leading-[0.88] text-white text-balance motion-safe:animate-[pt-rise_0.7s_0.08s_cubic-bezier(.16,1,.3,1)_both]">
          {archetype.title}
        </h2>
        {(archetype.tag || archetype.secondaryTrait) && (
          <span className="mt-2.5 flex flex-wrap items-center gap-2 text-[10.5px] font-extrabold text-white/55">
            {archetype.tag && <span className="rounded-full bg-bitter-lime px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-charcoal">{archetype.tag}</span>}
            {archetype.secondaryTrait && (
              <span>
                {t('analytics.sign')} <b className="font-black text-white">{archetype.secondaryTrait}</b>
              </span>
            )}
          </span>
        )}
        <p className="mt-2 max-w-[32ch] text-[13px] font-semibold leading-[1.42] text-white/80 motion-safe:animate-[pt-rise_0.7s_0.16s_cubic-bezier(.16,1,.3,1)_both]">
          {archetype.description}
        </p>
        <div className="mt-4 grid grid-cols-3 rounded-[18px] overflow-hidden bg-white/[0.06] border border-white/[0.08] backdrop-blur-xl motion-safe:animate-[pt-rise_0.7s_0.24s_cubic-bezier(.16,1,.3,1)_both]">
          <div className={kpi}>
            <b className="block text-[22px] font-black tracking-[-0.05em] leading-none tabular-nums text-white">{watched.length}</b>
            <small className={kpiLabel}>{t('pt.kpiFilms')}</small>
          </div>
          <div className={`${kpi} border-l border-white/[0.08]`}>
            <b className="block text-[22px] font-black tracking-[-0.05em] leading-none tabular-nums text-white">
              {totalHours}
              <sup className="ml-px text-[11px] tracking-normal align-[7px] text-white/55">h</sup>
            </b>
            <small className={kpiLabel}>{t('pt.kpiHours')}</small>
          </div>
          <div className={`${kpi} border-l border-white/[0.08]`}>
            <b className={`block text-[22px] font-black tracking-[-0.05em] leading-none tabular-nums ${delta == null ? 'text-white/40' : delta < 0 ? 'text-[#F08A24]' : 'text-bitter-lime'}`}>
              {delta == null ? '–' : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${fmt1(Math.abs(delta))}`}
            </b>
            <small className={kpiLabel}>{t('pt.kpiPublic')}</small>
          </div>
        </div>
        <div className={`mt-2.5 grid gap-2 motion-safe:animate-[pt-rise_0.7s_0.32s_cubic-bezier(.16,1,.3,1)_both] ${canPortrait ? 'grid-cols-[1.15fr_1fr]' : 'grid-cols-1'}`}>
          <button
            type="button"
            onClick={() => { haptics.soft(); onShare(); }}
            disabled={isSharing}
            className="h-11 rounded-[15px] bg-bitter-lime text-charcoal text-[12px] font-black flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-60"
          >
            <Share2 size={15} strokeWidth={2.6} />
            {isSharing ? t('analytics.sharing') : t('pt.shareCard')}
          </button>
          {canPortrait && (
            <button
              type="button"
              onClick={() => { haptics.soft(); setPortrait('asked'); }}
              className="h-11 rounded-[15px] bg-white/10 border border-white/[0.08] text-white text-[12px] font-black flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
            >
              <Sparkles size={15} strokeWidth={2.4} />
              {t('pt.portrait')}
            </button>
          )}
        </div>
      </section>

      <div className="flex flex-col gap-[26px] pt-2">
        {canPortrait && (
          <div ref={portraitRef}>
            <TastePortrait key={portrait} movies={watched} autoDraw={portrait === 'asked'} onOpenFilm={(movie) => onViewMovie?.(movie)} />
          </div>
        )}

        {/* 2 · Le pass ciné. */}
        {(onConfigureCinemaSubscription || onOpenCinemaDetails) && (
          <section className="flex flex-col gap-[11px]">
            <SectionHead
              title={t('pt.pass')}
              aside={userProfile?.cinemaSubscription?.active ? <small className="text-[10.5px] font-extrabold text-white/35">{now.toLocaleDateString(locale, { month: 'long' })}</small> : undefined}
            />
            <CinemaPass movies={watched} userProfile={userProfile} onConfigure={onConfigureCinemaSubscription} onOpenDetails={onOpenCinemaDetails} />
          </section>
        )}

        {/* 3 · Ta signature : les quatre critères, et la moyenne des quatre en repère. */}
        {signature && (
          <section className="flex flex-col gap-[11px]">
            <SectionHead title={t('pt.signature')} aside={<small className="text-[10.5px] font-extrabold text-white/35">{t('pt.signatureCount', { n: String(signature.count) })}</small>} />
            <div className={card}>
              {signature.order.map((key) => {
                const value = signature.values[key];
                const low = key === signature.harshest.key && signature.harshest.gap <= -0.3;
                return (
                  <div key={key} className="grid grid-cols-[72px_minmax(0,1fr)_32px] items-center gap-2.5 py-1.5 text-[12px] font-extrabold text-white">
                    <span>{t(CRITERION_LABEL[key])}</span>
                    <span className="relative h-2 rounded-full bg-white/[0.08]">
                      <i className={`absolute inset-y-0 left-0 rounded-full ${low ? 'bg-[#F08A24]' : 'bg-[#F4F1EA]'}`} style={{ width: `${value * 10}%` }} />
                      <u className="absolute -top-1 w-[2.5px] h-4 rounded-sm bg-white/35" style={{ left: `${signature.overall * 10}%` }} />
                    </span>
                    <b className={`text-right font-black tabular-nums ${low ? 'text-[#F08A24]' : ''}`}>{fmt1(value)}</b>
                  </div>
                );
              })}
              <div className="flex gap-3.5 mt-1.5 text-[10px] font-extrabold text-white/35">
                <span className="inline-flex items-center gap-1.5"><i className="w-3 h-[5px] rounded-full bg-[#F4F1EA]" />{t('pt.legendCriterion')}</span>
                <span className="inline-flex items-center gap-1.5"><i className="w-[2.5px] h-3 rounded-sm bg-white/35" />{t('pt.legendOverall', { v: fmt1(signature.overall) })}</span>
              </div>
              {signature.harshest.gap <= -0.3 && (
                <p className="mt-2.5 pt-3 border-t border-white/[0.08] text-[13px] font-black tracking-[-0.02em] leading-snug text-white">
                  {t('pt.harshest', { criterion: t(CRITERION_LABEL[signature.harshest.key]) })}
                  <small className="block mt-0.5 text-[11px] font-semibold tracking-normal text-white/55">
                    {t('pt.harshestGap', { gap: fmt1(Math.abs(signature.harshest.gap)) })}
                  </small>
                </p>
              )}
            </div>
          </section>
        )}

        {/* 4 · Le podium : le premier au centre. */}
        {podium.length === 3 && (
          <section className="flex flex-col gap-[11px]">
            <SectionHead
              title={t('pt.podium')}
              aside={
                <button type="button" onClick={() => { haptics.soft(); onOpenPalmares(); }} className="text-[10.5px] font-black text-bitter-lime whitespace-nowrap">
                  {t('pt.allPalmares')}
                </button>
              }
            />
            <div className="grid grid-cols-[1fr_1.18fr_1fr] gap-2.5 items-end">
              {[podium[1], podium[0], podium[2]].map((movie) => {
                const rank = podium.indexOf(movie) + 1;
                const first = rank === 1;
                return (
                  <button
                    key={movie.id}
                    type="button"
                    onClick={() => { haptics.soft(); onViewMovie?.(movie); }}
                    className="text-left flex flex-col gap-[7px] active:scale-[0.97] transition-transform"
                  >
                    <span
                      className={`relative block aspect-[2/3] rounded-2xl overflow-hidden bg-white/5 ${
                        first ? 'ring-2 ring-bitter-lime shadow-[0_20px_30px_-14px_rgba(217,255,0,0.25)]' : 'shadow-[0_16px_24px_-14px_rgba(0,0,0,0.7)]'
                      }`}
                    >
                      {movie.posterUrl && <img src={resizeTmdbImage(movie.posterUrl, 'w342')} alt="" loading="lazy" className="w-full h-full object-cover" />}
                      <span className={`absolute right-1.5 top-1.5 px-[7px] py-[3px] rounded-[9px] text-[11px] font-black tabular-nums ${first ? 'bg-bitter-lime text-charcoal' : 'bg-black/60 text-white backdrop-blur'}`}>
                        {fmt1(score(movie))}
                      </span>
                      <span className={`absolute left-[7px] bottom-1 font-black tracking-[-0.08em] leading-none [text-shadow:0_2px_12px_rgba(0,0,0,0.6)] ${first ? 'text-[50px] text-bitter-lime' : 'text-[40px] text-white'}`}>
                        {rank}
                      </span>
                    </span>
                    <span className="text-[11px] font-black leading-tight text-white line-clamp-2">{movie.title}</span>
                    <span className="-mt-1 text-[10px] font-bold text-white/35 line-clamp-1">
                      {[movie.year, movie.director].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* 5 · Les constats. */}
        {constats}

        {/* 6 · L'année : le mois record, en clair. */}
        {year.record != null && (
          <section className="flex flex-col gap-[11px]">
            <SectionHead title={t('pt.year')} aside={<small className="text-[10.5px] font-extrabold text-white/35">{t('pt.yearAside')}</small>} />
            <div className={card}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-[15px] font-black tracking-[-0.03em] leading-tight text-white">
                  {t('pt.recordMonth', { month: monthName(year.record, 'long').replace(/^./, (c) => c.toUpperCase()) })}
                  <small className="block mt-1 text-[11px] font-semibold tracking-normal text-white/55">
                    {t(year.recordCount > 1 ? 'pt.recordCount' : 'pt.recordCountOne', { n: String(year.recordCount) })}
                    {year.perWeek >= 1 ? t('pt.perWeek', { n: Number.isInteger(year.perWeek) ? String(year.perWeek) : fmt1(year.perWeek) }) : ''}.
                  </small>
                </p>
                <span className="text-right text-[22px] font-black tracking-[-0.05em] leading-none tabular-nums text-white">
                  {year.total}
                  <small className="block mt-1 text-[9px] font-extrabold uppercase tracking-[0.1em] text-white/35">{t('pt.films')}</small>
                </span>
              </div>
              <div className="flex items-end gap-[5px] h-24 mt-[26px]" aria-hidden="true">
                {months.map((m, i) => {
                  const isRecord = i === year.record;
                  return (
                    <i
                      key={i}
                      className={`relative flex-1 rounded-t-[5px] rounded-b-[2px] ${isRecord ? 'bg-bitter-lime' : i === 11 ? 'bg-white/30' : 'bg-white/[0.14]'}`}
                      style={{ height: `${Math.max(m.count ? 6 : 2, (m.count / maxMonth) * 100)}%` }}
                    >
                      {isRecord && <span className="absolute -top-[17px] left-1/2 -translate-x-1/2 text-[10.5px] font-black not-italic text-bitter-lime">{m.count}</span>}
                    </i>
                  );
                })}
              </div>
              <div className="flex gap-[5px] mt-1.5">
                {months.map((_, i) => (
                  <span key={i} className={`flex-1 text-center text-[8.5px] font-extrabold uppercase ${i === year.record ? 'text-bitter-lime' : 'text-white/35'}`}>
                    {monthName(i, 'narrow')}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {onRecalibrate && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => { haptics.soft(); onRecalibrate(); }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-full border border-white/[0.08] text-[11px] font-black text-white/55"
            >
              <SlidersHorizontal size={13} />
              {t('analytics.recalibrate')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfileTab;
