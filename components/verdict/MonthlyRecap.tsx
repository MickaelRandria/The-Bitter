import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { MovieRating, SharedMovie } from '../../services/supabase';
import { WatchPlan, chosenSlotOf } from '../../services/plans';
import { DebateMessage, VerdictGuess } from '../../services/verdicts';
import { SpaceSuggestion, posterOf } from '../../services/spaceSuggestions';
import { formatSlot } from '../../supabase/functions/notify/messages.ts';
import { cap, fmt1, guessLeaderboard, mean, ratingValue, spreadOf } from '../../utils/verdict';
import { previousMonth, shiftMonth, watchedAt } from '../../utils/spaceStats';
import { useLanguage } from '../../contexts/LanguageContext';
import { haptics } from '../../utils/haptics';
import { Avatar, Poster, VerdictPerson } from './VerdictBits';

/**
 * Le récap du mois, en stories.
 *
 * Une carte « Nouveau » apparaît le 1er du mois en tête de l'espace ; elle ouvre
 * sept diapos plein écran sur le mois écoulé (trois quand le mois a été calme).
 * Pas de bouton de partage : c'est un souvenir du groupe, affiché dans l'espace.
 */
interface MonthlyRecapProps {
  spaceId: string;
  spaceName: string;
  monogram: string;
  tint: string;
  currentUserId: string;
  people: VerdictPerson[];
  movies: SharedMovie[];
  ratings: MovieRating[];
  plans: WatchPlan[];
  messages: DebateMessage[];
  guesses: VerdictGuess[];
  /** Films au verdict complet. */
  doneIds: Set<string>;
  /** « À voir ensemble », du plus attendu au moins attendu. */
  watchlist: SharedMovie[];
  loadSuggestions: () => Promise<SpaceSuggestion[]>;
  onPropose: (s: SpaceSuggestion) => Promise<boolean>;
  onOpenWatchlist: () => void;
}

interface Slide {
  bg: string;
  body: React.ReactNode;
  cta?: { label: string; run: () => void };
}

const seenKey = (spaceId: string, month: string) => `bitter_recap_seen_${spaceId}_${month}`;

const MonthlyRecap: React.FC<MonthlyRecapProps> = (props) => {
  const { t, language } = useLanguage();
  const month = previousMonth();
  const locale = language === 'en' ? 'en-GB' : 'fr-FR';
  const monthName = (m: string) => {
    const [y, mo] = m.split('-').map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString(locale, { month: 'long' });
  };
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(seenKey(props.spaceId, month)) === '1';
    } catch {
      return false;
    }
  });
  const [suggestion, setSuggestion] = useState<SpaceSuggestion | null>(null);
  const [proposed, setProposed] = useState(false);

  const personById = useMemo(() => new Map(props.people.map((p) => [p.id, p])), [props.people]);
  const nameOf = (id: string) => (id === props.currentUserId ? t('spaces.you') : personById.get(id)?.name || t('shared.member'));

  const data = useMemo(() => {
    const watched = props.movies.filter((m) => m.status === 'watched');
    const dated = watched.map((m) => ({ m, at: watchedAt(m as never, props.ratings as never) }));
    const inMonth = dated.filter((d) => d.at.slice(0, 7) === month).map((d) => d.m);
    const before = dated.filter((d) => d.at && d.at.slice(0, 7) <= month);
    const prevCount = dated.filter((d) => d.at.slice(0, 7) === shiftMonth(month, -1)).length;
    const valuesOf = (movieId: string) =>
      props.ratings.filter((r) => r.movie_id === movieId).map((r) => ({ id: r.profile_id, v: ratingValue(r) }));
    const done = inMonth.filter((m) => props.doneIds.has(m.id) && valuesOf(m.id).length >= 2);
    const bySpread = [...done].sort((a, b) => spreadOf(valuesOf(a.id).map((x) => x.v)) - spreadOf(valuesOf(b.id).map((x) => x.v)));
    const tight = bySpread[0] ?? null;
    const split = bySpread.length > 1 ? bySpread[bySpread.length - 1] : null;
    const splitSpread = split ? spreadOf(valuesOf(split.id).map((x) => x.v)) : 0;
    const minutes = inMonth.reduce((sum, m) => sum + (Number(m.runtime) || 0), 0);
    const inCinema = props.plans.filter((p) => {
      const slot = p.status === 'agreed' ? chosenSlotOf(p) : null;
      return slot && slot.cinema_name && slot.starts_at.slice(0, 7) === month;
    }).length;
    // Qui note comment : moyenne de chacun sur les films du mois.
    const perMember = props.people
      .map((p) => ({ id: p.id, avg: mean(inMonth.flatMap((m) => valuesOf(m.id).filter((x) => x.id === p.id).map((x) => x.v))) }))
      .filter((x): x is { id: string; avg: number } => x.avg != null)
      .sort((a, b) => b.avg - a.avg);
    const inMonthIds = new Set(inMonth.map((m) => m.id));
    const board = guessLeaderboard(
      props.guesses.filter((g) => inMonthIds.has(g.movie_id)),
      (movieId, profileId) => {
        const r = props.ratings.find((x) => x.movie_id === movieId && x.profile_id === profileId);
        return r ? ratingValue(r) : null;
      }
    );
    const debateLine = split
      ? props.messages.find((msg) => msg.movie_id === split.id && msg.profile_id !== props.currentUserId) ?? null
      : null;
    // Le dernier verdict avant ce mois, pour le mois calme.
    const lastDone = dated
      .filter((d) => d.at.slice(0, 7) < month && props.doneIds.has(d.m.id))
      .sort((a, b) => b.at.localeCompare(a.at))[0];
    const upcoming = props.plans
      .filter((p) => p.status === 'agreed')
      .map((p) => ({ p, slot: chosenSlotOf(p) }))
      .filter((x) => x.slot && new Date(x.slot.starts_at).getTime() > Date.now())
      .sort((a, b) => a.slot!.starts_at.localeCompare(b.slot!.starts_at));
    return { inMonth, hasHistory: before.length > 0, prevCount, done, tight, split, splitSpread, minutes, inCinema, perMember, board, debateLine, lastDone, upcoming, valuesOf };
  }, [props.movies, props.ratings, props.plans, props.guesses, props.messages, props.doneIds, props.people, month, props.currentUserId]);

  const quiet = data.inMonth.length === 0;

  // L'idée du mois calme : chargée seulement à l'ouverture.
  useEffect(() => {
    if (!open || !quiet || suggestion) return;
    props.loadSuggestions().then((list) => setSuggestion(list.find((s) => s.kind === 'release') ?? list[0] ?? null)).catch(() => {});
  }, [open, quiet]);

  const k = 'text-[10px] font-black uppercase tracking-[0.18em] text-bitter-lime';
  const h = 'text-[30px] font-black tracking-[-0.05em] leading-[1.02]';
  const mega = 'text-[96px] font-black tracking-[-0.08em] leading-[0.85] tabular-nums';
  const para = 'text-[14px] font-semibold text-white/75 leading-snug';
  const chip = (id: string, value: number) => {
    const person = personById.get(id);
    return (
      <span key={id} className="inline-flex items-center gap-2 rounded-full bg-white/10 pl-1.5 pr-3 py-1.5">
        {person && <Avatar person={person} size={26} />}
        <b className="text-[13px] font-black">{cap(nameOf(id))}</b>
        <em className="not-italic text-[13px] font-black tabular-nums text-bitter-lime">{fmt1(value)}</em>
      </span>
    );
  };
  const rank = (id: string, title: string, value: string, n?: number) => {
    const person = personById.get(id);
    return (
      <div key={`${id}-${title}`} className="flex items-center gap-3 rounded-2xl bg-white/10 p-3">
        {n != null && <span className="w-4 text-[15px] font-black">{n}</span>}
        {person && <Avatar person={person} size={34} />}
        <b className="flex-1 min-w-0 text-[14px] font-black leading-tight">{title}</b>
        <em className="not-italic text-[20px] font-black tabular-nums text-bitter-lime">{value}</em>
      </div>
    );
  };

  const head: Slide = {
    bg: 'linear-gradient(160deg,#1A1A1A,#0c0c0c)',
    body: (
      <>
        <span className={k}>{`${monthName(month)} ${month.slice(0, 4)}`}</span>
        <span className={h}>{t('recap.headTitle', { space: props.spaceName })}</span>
        <span className="flex">
          {props.people.map((p, i) => (
            <Avatar key={p.id} person={p} size={44} className={`border-[3px] border-[#141414] ${i ? '-ml-3' : ''}`} />
          ))}
        </span>
      </>
    ),
  };

  const slides: Slide[] = (() => {
    if (quiet) {
      const last = data.lastDone;
      const lastAvg = last ? mean(data.valuesOf(last.m.id).map((x) => x.v)) : null;
      return [
        head,
        {
          bg: 'linear-gradient(160deg,#2a2a2a,#111)',
          body: (
            <>
              <span className={k}>{t('recap.quietKicker')}</span>
              <span className={mega}>0</span>
              <span className={h}>{t('recap.quietTitle')}</span>
              <span className={para}>
                {last && lastAvg != null
                  ? t('recap.quietLast', { title: last.m.title, avg: fmt1(lastAvg), month: monthName(last.at.slice(0, 7)) })
                  : t('recap.quietNone')}
              </span>
            </>
          ),
        },
        {
          bg: 'linear-gradient(160deg,#B8763A,#2a1608)',
          body: (
            <>
              <span className={k}>{t('recap.ideaFor', { month: monthName(shiftMonth(month, 1)) })}</span>
              {suggestion ? (
                <span className="flex items-center gap-3.5">
                  <Poster url={posterOf(suggestion.posterPath, 'w342')} size="w342" className="w-[92px] aspect-[2/3] rounded-xl shrink-0" />
                  <span>
                    <b className="block text-[20px] font-black leading-tight">{suggestion.title}</b>
                    <small className="block mt-1 text-[12.5px] font-semibold text-white/70">{t('recap.ideaWhy')}</small>
                  </span>
                </span>
              ) : (
                <span className="h-[138px] rounded-2xl bg-white/10 animate-pulse" />
              )}
            </>
          ),
          cta:
            suggestion && !proposed
              ? {
                  label: t('recap.proposeIdea'),
                  run: async () => {
                    if (await props.onPropose(suggestion)) setProposed(true);
                  },
                }
              : undefined,
        },
      ];
    }
    const list: Slide[] = [head];
    const hours = Math.floor(data.minutes / 60);
    const delta = data.inMonth.length - data.prevCount;
    list.push({
      bg: 'linear-gradient(160deg,#2F4A3A,#0d1a12)',
      body: (
        <>
          <span className={k}>{t('recap.seenKicker')}</span>
          <span className={mega}>{data.inMonth.length}</span>
          <span className={h}>{t(data.inMonth.length > 1 ? 'recap.seenMany' : 'recap.seenOne', { month: monthName(month) })}</span>
          <span className="flex h-[120px] items-end">
            {data.inMonth.slice(0, 6).map((m, i) => (
              <span key={m.id} className={`block ${i ? '-ml-6' : ''}`} style={{ transform: `rotate(${i * 6 - 9}deg)` }}>
                <Poster url={m.poster_url} size="w185" className="w-[74px] aspect-[2/3] rounded-xl shadow-[0_12px_20px_-10px_rgba(0,0,0,0.7)]" />
              </span>
            ))}
          </span>
          <span className={para}>
            {[
              data.minutes ? t('recap.minutes', { h: String(hours), m: String(data.minutes % 60), n: String(props.people.length) }) : null,
              data.inCinema ? t('recap.inCinema', { n: String(data.inCinema) }) : null,
              delta > 0 ? t('recap.moreThan', { n: String(delta), month: monthName(shiftMonth(month, -1)) }) : null,
            ]
              .filter(Boolean)
              .join(' ')}
          </span>
        </>
      ),
    });
    if (data.tight) {
      const vals = data.valuesOf(data.tight.id);
      list.push({
        bg: 'linear-gradient(160deg,#3E5238,#121a10)',
        body: (
          <>
            <span className={k}>{t('recap.tightKicker')}</span>
            <span className={h}>{data.tight.title}</span>
            <span className={mega}>{fmt1(mean(vals.map((x) => x.v)) ?? 0)}</span>
            <span className="flex flex-wrap gap-2">{vals.map((x) => chip(x.id, x.v))}</span>
            <span className={para}>{t('recap.tightBody', { gap: fmt1(spreadOf(vals.map((x) => x.v))) })}</span>
          </>
        ),
      });
    }
    if (data.split && data.splitSpread > 2.5) {
      const vals = data.valuesOf(data.split.id);
      list.push({
        bg: 'linear-gradient(160deg,#8a4a12,#1f0f04)',
        body: (
          <>
            <span className={k}>{t('recap.splitKicker')}</span>
            <span className={h}>{data.split.title}</span>
            <span className={mega}>{fmt1(data.splitSpread)}</span>
            <span className={para}>
              {t('recap.splitBody', { who: vals.map((x) => `${nameOf(x.id)} (${fmt1(x.v)})`).join(', ') })}
            </span>
            {data.debateLine && (
              <span className="rounded-2xl bg-white/10 p-3.5 text-[14px] font-semibold leading-snug">
                <b className="block text-[10px] font-black uppercase tracking-[0.14em] text-bitter-lime mb-1">
                  {t('recap.quoteOf', { name: nameOf(data.debateLine.profile_id) })}
                </b>
                « {data.debateLine.body} »
              </span>
            )}
          </>
        ),
      });
    }
    if (data.perMember.length > 1 && data.perMember[0].avg - data.perMember[data.perMember.length - 1].avg >= 0.3) {
      const gen = data.perMember[0];
      const sev = data.perMember[data.perMember.length - 1];
      list.push({
        bg: 'linear-gradient(160deg,#3B2F5B,#100c1d)',
        body: (
          <>
            <span className={k}>{t('recap.ratesKicker')}</span>
            <span className={h}>{t('recap.ratesTitle')}</span>
            {rank(gen.id, `${t('recap.generous')} · ${nameOf(gen.id)}`, fmt1(gen.avg))}
            {rank(sev.id, `${t('recap.severe')} · ${nameOf(sev.id)}`, fmt1(sev.avg))}
            <span className={para}>{t('recap.ratesBody')}</span>
          </>
        ),
      });
    }
    if (data.board.length) {
      list.push({
        bg: 'linear-gradient(160deg,#1F3A5F,#08111e)',
        body: (
          <>
            <span className={k}>{t('recap.guessKicker')}</span>
            <span className={h}>{t('recap.guessTitle')}</span>
            {data.board.slice(0, 3).map((b, i) =>
              rank(b.guesser, cap(t('recap.guessLine', { who: nameOf(b.guesser), whom: nameOf(b.target) })), `±${fmt1(b.error)}`, i + 1)
            )}
            <span className={para}>{t('recap.guessBody', { n: String(data.board.reduce((s, b) => s + b.count, 0)) })}</span>
          </>
        ),
      });
    }
    const next = [
      ...data.upcoming.slice(0, 2).map((x) => ({
        key: x.p.id,
        poster: props.movies.find((m) => m.id === x.p.shared_movie_id)?.poster_url,
        title: props.movies.find((m) => m.id === x.p.shared_movie_id)?.title ?? '',
        sub: t('recap.planned', { slot: formatSlot(x.slot) }),
      })),
      ...props.watchlist
        .filter((m) => !data.upcoming.some((x) => x.p.shared_movie_id === m.id))
        .slice(0, 2 - Math.min(2, data.upcoming.length))
        .map((m) => ({ key: m.id, poster: m.poster_url, title: m.title, sub: t('recap.onList') })),
    ];
    if (next.length) {
      list.push({
        bg: 'linear-gradient(160deg,#B8763A,#2a1608)',
        body: (
          <>
            <span className={k}>{t('recap.nextKicker', { month: monthName(shiftMonth(month, 1)) })}</span>
            <span className={h}>{t('recap.nextTitle')}</span>
            {next.map((n) => (
              <span key={n.key} className="flex items-center gap-3 rounded-2xl bg-white/10 p-2.5">
                <Poster url={n.poster} className="w-[46px] aspect-[2/3] rounded-lg shrink-0" />
                <span className="min-w-0">
                  <b className="block text-[15px] font-black leading-tight truncate">{n.title}</b>
                  <small className="block mt-0.5 text-[12px] font-semibold text-white/70">{n.sub}</small>
                </span>
              </span>
            ))}
          </>
        ),
        cta: { label: t('recap.openWatchlist'), run: () => { setOpen(false); props.onOpenWatchlist(); } },
      });
    }
    return list;
  })();

  const last = slides.length - 1;
  const current = Math.min(index, last);

  // Défilement automatique, cinq secondes par diapo, sauf mouvement réduit ou pause.
  useEffect(() => {
    if (!open || paused || current >= last) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setTimeout(() => setIndex((i) => i + 1), 5000);
    return () => clearTimeout(timer);
  }, [open, paused, current, last]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, last));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, last]);

  if (!data.hasHistory) return null;

  const openStory = () => {
    haptics.medium();
    setIndex(0);
    setPaused(false);
    setOpen(true);
    setSeen(true);
    try {
      localStorage.setItem(seenKey(props.spaceId, month), '1');
    } catch {
      // Sans stockage, « Nouveau » reviendra : sans gravité.
    }
  };

  const summary = quiet
    ? t('recap.cardQuiet', { month: monthName(shiftMonth(month, 1)) })
    : [
        t(data.inMonth.length > 1 ? 'recap.cardSeenMany' : 'recap.cardSeenOne', { n: String(data.inMonth.length) }),
        data.tight ? t('recap.cardTight', { gap: fmt1(spreadOf(data.valuesOf(data.tight.id).map((x) => x.v))) }) : null,
        data.debateLine ? t('recap.cardDebate') : null,
      ]
        .filter(Boolean)
        .join(', ') + '.';

  const slide = slides[current];
  return (
    <>
      <button
        onClick={openStory}
        className="w-full flex items-center gap-3.5 rounded-[1.6rem] bg-charcoal dark:bg-[#161616] text-white p-3.5 text-left active:scale-[0.99] transition-transform"
      >
        <span
          className="w-[58px] h-[58px] rounded-full p-[3px] shrink-0"
          style={{ background: seen ? 'rgba(255,255,255,0.25)' : 'conic-gradient(#D9FF00, #3E5238, #D9FF00)' }}
        >
          <span className="block w-full h-full rounded-full border-[3px] border-charcoal dark:border-[#161616] overflow-hidden">
            <Poster url={data.inMonth[0]?.poster_url ?? props.movies.find((m) => m.poster_url)?.poster_url} className="w-full h-full" />
          </span>
        </span>
        <span className="flex-1 min-w-0">
          <b className="block text-[15px] font-black tracking-tight">
            {t(quiet ? 'recap.cardTitleQuiet' : 'recap.cardTitle', { month: monthName(month) })}
          </b>
          <small className="block mt-0.5 text-[11.5px] font-semibold text-white/70 leading-snug line-clamp-2">{summary}</small>
        </span>
        {!seen && (
          <span className="shrink-0 px-2 py-1 rounded-lg bg-bitter-lime text-charcoal text-[10px] font-black uppercase tracking-wide">
            {t('recap.new')}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`vd-story fixed inset-0 !m-0 z-[160] text-white flex flex-col ${paused ? 'vd-paused' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label={t('recap.storyTitle', { month: monthName(month) })}
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerCancel={() => setPaused(false)}
        >
          <span className="absolute inset-0 transition-[background] duration-500" style={{ background: slide.bg }} />
          <div className="relative flex gap-1 px-3 pt-[calc(env(safe-area-inset-top,0px)+10px)]">
            {slides.map((_, i) => (
              <span key={i} className={`vd-story-bar flex-1 h-[3px] rounded bg-white/30 overflow-hidden ${i < current ? 'vd-done' : i === current ? 'vd-on' : ''}`}>
                <i key={`${i}-${current}`} />
              </span>
            ))}
          </div>
          <div className="relative flex items-center gap-2.5 px-4 pt-3">
            <span className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-black" style={{ background: props.tint }}>
              {props.monogram}
            </span>
            <b className="flex-1 text-[13px] font-black">{t('recap.storyTitle', { month: monthName(month) })}</b>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={t('common.close')}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
            >
              <X size={18} />
            </button>
          </div>
          <button
            className="absolute left-0 top-24 bottom-28 w-[35%] z-10"
            aria-label={t('recap.prevSlide')}
            onClick={() => setIndex((i) => Math.max(i - 1, 0))}
          />
          <button
            className="absolute right-0 top-24 bottom-28 w-[65%] z-10"
            aria-label={t('recap.nextSlide')}
            onClick={() => (current >= last ? setOpen(false) : setIndex((i) => i + 1))}
          />
          <div key={current} className="vd-slide relative flex-1 flex flex-col justify-center gap-4 px-6 max-w-md w-full mx-auto">
            {slide.body}
          </div>
          {slide.cta ? (
            <button
              onClick={slide.cta.run}
              onPointerDown={(e) => e.stopPropagation()}
              className="relative z-20 mx-6 mb-[calc(env(safe-area-inset-bottom,0px)+24px)] h-[52px] rounded-2xl bg-bitter-lime text-charcoal font-black text-sm max-w-md self-center w-[calc(100%-3rem)]"
            >
              {slide.cta.label}
            </button>
          ) : (
            <div className="h-[calc(env(safe-area-inset-bottom,0px)+24px)]" />
          )}
        </div>
      )}
    </>
  );
};

export default MonthlyRecap;
