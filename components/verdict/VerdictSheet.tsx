import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Flag, Send, Sparkles, Trash2, X, Zap, Check } from 'lucide-react';
import { SharedMovie, MovieRating } from '../../services/supabase';
import {
  DEBATE_MAX,
  RATING_REMINDER_DAYS,
  REACTIONS,
  ReactionEmoji,
  VerdictExtras,
  deleteDebate,
  placeGuess,
  postDebate,
  remindRating,
  setReaction,
  setSkipped,
} from '../../services/verdicts';
import { SpaceSuggestion, posterOf } from '../../services/spaceSuggestions';
import { ReportTarget } from '../../services/moderation';
import { PublicRating, ratingSourceLabel } from '../../utils/publicRating';
import {
  CRITERIA,
  VerdictState,
  agreementOf,
  betResult,
  cap,
  criteriaGap,
  criteriaOf,
  fmt1,
  mean,
  ratingValue,
  spreadOf,
} from '../../utils/verdict';
import { haptics } from '../../utils/haptics';
import { useLanguage } from '../../contexts/LanguageContext';
import { Avatar, Poster, ProgressRing, VerdictPerson } from './VerdictBits';

interface VerdictSheetProps {
  movie: SharedMovie;
  /** Image de bandeau : le fond TMDB, sinon l'affiche. */
  image?: string;
  currentUserId: string;
  spaceName: string;
  /** Membres actifs, moi d'abord. */
  people: VerdictPerson[];
  /** Notes des membres actifs sur ce film. */
  ratings: MovieRating[];
  expected: string[];
  skipIds: string[];
  state: VerdictState;
  extras: VerdictExtras;
  publicRating: PublicRating | null;
  blocked: Set<string>;
  /** Membres qui reçoivent les notifications : les autres sont relancés par message. */
  pushIds: Set<string>;
  canDelete: boolean;
  loadSuggestions: () => Promise<SpaceSuggestion[]>;
  onPropose: (s: SpaceSuggestion) => Promise<boolean>;
  onRate: () => void;
  onDelete: () => void;
  onReport: (target: ReportTarget) => void;
  /** Relire les compléments (pas vu, paris, réactions…) après une écriture. */
  onChanged: () => void;
  onToast?: (message: string) => void;
  onClose: () => void;
}

const SEEN_KEY = (userId: string) => `bitter_verdict_seen_${userId}`;
const readSeen = (userId: string): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY(userId)) || '[]'));
  } catch {
    return new Set();
  }
};
const markSeen = (userId: string, movieId: string) => {
  try {
    const seen = readSeen(userId);
    seen.add(movieId);
    localStorage.setItem(SEEN_KEY(userId), JSON.stringify([...seen].slice(-400)));
  } catch {
    // Sans stockage, la révélation se rejoue : ce n'est pas grave.
  }
};

const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** La note du groupe compte de 0 jusqu'à sa valeur, une fois. */
const CountUp: React.FC<{ value: number; run: boolean }> = ({ value, run }) => {
  const [shown, setShown] = useState(run ? 0 : value);
  useEffect(() => {
    if (!run || reducedMotion()) {
      setShown(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 700);
      setShown(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, run]);
  return <>{fmt1(shown)}</>;
};

const VerdictSheet: React.FC<VerdictSheetProps> = (props) => {
  const { movie, currentUserId, people, ratings, expected, skipIds, state, extras } = props;
  const { t } = useLanguage();
  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const nameOf = (id: string) => (id === currentUserId ? t('spaces.you') : personById.get(id)?.name || t('shared.member'));
  const ratingOf = (id: string) => ratings.find((r) => r.profile_id === id);
  const myRating = ratingOf(currentUserId);
  const raterIds = expected.filter((id) => ratingOf(id));
  const missing = expected.filter((id) => !ratingOf(id));
  const values = raterIds.map((id) => ratingValue(ratingOf(id)!));
  const avg = mean(values) ?? 0;
  const spread = spreadOf(values);
  const agreement = agreementOf(spread);
  const iAmExpected = expected.includes(currentUserId);
  const myGuess = (target: string) =>
    extras.guesses.find((g) => g.movie_id === movie.id && g.guesser_id === currentUserId && g.target_id === target)?.guess;

  /**
   * Révélation : une seule fois par film et par personne. Les cartes se
   * retournent l'une après l'autre, puis la note du groupe compte et les avatars
   * glissent du centre vers leur note.
   */
  const [phase, setPhase] = useState<'run' | 'done'>(() =>
    state === 'done' && !readSeen(currentUserId).has(movie.id) ? 'run' : 'done'
  );
  const [flipped, setFlipped] = useState(phase === 'run' ? 0 : 99);
  const prevState = useRef(state);
  useEffect(() => {
    // Le dernier avis arrive pendant que la fiche est ouverte : on révèle sur place.
    if (prevState.current !== 'done' && state === 'done' && !readSeen(currentUserId).has(movie.id)) {
      setPhase('run');
      setFlipped(0);
    }
    prevState.current = state;
  }, [state, currentUserId, movie.id]);
  useEffect(() => {
    if (phase !== 'run') return;
    const reduce = reducedMotion();
    const timers: number[] = [];
    const cards = people.length;
    for (let i = 1; i <= cards; i++) timers.push(window.setTimeout(() => setFlipped(i), reduce ? 0 : 400 + i * 260));
    timers.push(
      window.setTimeout(
        () => {
          setPhase('done');
          markSeen(currentUserId, movie.id);
          haptics.success();
        },
        reduce ? 50 : 400 + cards * 260 + 500
      )
    );
    return () => timers.forEach(clearTimeout);
  }, [phase, people.length, currentUserId, movie.id]);
  const revealing = state === 'done' && phase === 'run';

  // ─── Feuilles : pari, signalement ───────────────────────────────────────────
  const [guessFor, setGuessFor] = useState<string | null>(null);
  const [guessValue, setGuessValue] = useState(7);
  const [busy, setBusy] = useState<string | null>(null);

  const openGuess = (target: string) => {
    haptics.soft();
    setGuessValue(myGuess(target) ?? 7);
    setGuessFor(target);
  };
  const submitGuess = async () => {
    if (!guessFor) return;
    setBusy('guess');
    const res = await placeGuess(movie.id, currentUserId, guessFor, guessValue);
    setBusy(null);
    if (!res.ok) {
      haptics.error();
      props.onToast?.(t('verdict.guessFailed'));
      return;
    }
    haptics.success();
    setGuessFor(null);
    props.onToast?.(t('verdict.guessPlaced', { name: nameOf(guessFor) }));
    props.onChanged();
  };

  const toggleSkip = async (skip: boolean) => {
    setBusy('skip');
    const res = await setSkipped(movie.id, currentUserId, skip);
    setBusy(null);
    if (!res.ok) {
      haptics.error();
      props.onToast?.(t('verdict.skipFailed'));
      return;
    }
    haptics.medium();
    props.onToast?.(skip ? t('verdict.skipped') : t('verdict.unskipped'));
    props.onChanged();
  };

  /** Relancer : par notification si la personne les a, sinon par un message à envoyer. */
  const remind = async (target: string) => {
    setBusy(`remind-${target}`);
    const channel = props.pushIds.has(target) ? 'push' : 'message';
    const { results, error } = await remindRating(movie.id, [target], channel);
    setBusy(null);
    const status = results[0]?.status;
    if (error || !status) {
      haptics.error();
      props.onToast?.(t('verdict.remindFailed'));
      return;
    }
    if (status === 'too_soon') {
      props.onToast?.(t('verdict.remindTooSoon', { name: nameOf(target), days: String(RATING_REMINDER_DAYS) }));
      props.onChanged();
      return;
    }
    if (status !== 'sent') {
      props.onChanged();
      return;
    }
    haptics.success();
    if (channel === 'message') {
      const text = `${t('verdict.remindMessage', { title: movie.title, space: props.spaceName })} https://thebitter.watch/`;
      try {
        if (typeof navigator.share === 'function') await navigator.share({ text });
        else {
          await navigator.clipboard.writeText(text);
          props.onToast?.(t('verdict.remindCopied'));
        }
      } catch {
        // Partage annulé : la relance est comptée, le message reste à envoyer à la main.
      }
    } else {
      props.onToast?.(t('verdict.remindSent', { name: nameOf(target) }));
    }
    props.onChanged();
  };

  const reminderDaysLeft = (target: string): number | null => {
    const last = extras.reminders.get(`${movie.id}:${target}`);
    if (!last) return null;
    const left = RATING_REMINDER_DAYS - Math.floor((Date.now() - last.getTime()) / 86_400_000);
    return left > 0 ? left : null;
  };

  // ─── Cartes ─────────────────────────────────────────────────────────────────
  const cardsHtml = (revealAll: boolean) => (
    <div className="vd-cards" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(people.length, 2), 4)}, minmax(0, 1fr))` }}>
      {people.map((p, index) => {
        const r = ratingOf(p.id);
        if (skipIds.includes(p.id)) {
          return (
            <div key={p.id} className="vd-tcard">
              <div className="vd-face bg-sand dark:bg-[#1a1a1a] text-stone-500 dark:text-stone-400">
                <Avatar person={p} size={26} />
                <small className="text-[9.5px] font-extrabold leading-tight">
                  {p.isMe ? cap(t('spaces.you')) : p.name}
                  <br />
                  {t('verdict.cardSkipped')}
                </small>
              </div>
            </div>
          );
        }
        if (!r) {
          return (
            <div key={p.id} className="vd-tcard">
              <div className="vd-face border-2 border-dashed border-stone-300 dark:border-white/15 text-stone-500 dark:text-stone-400">
                <Avatar person={p} size={26} dashed />
                <small className="text-[9.5px] font-extrabold leading-tight">
                  {p.isMe ? cap(t('spaces.you')) : p.name}
                  <br />
                  {expected.includes(p.id) ? t('verdict.cardMissing') : t('verdict.cardNotExpected')}
                </small>
              </div>
            </div>
          );
        }
        const flip = p.isMe || (revealAll && (!revealing || index < flipped));
        const guess = myGuess(p.id);
        return (
          <div key={p.id} className={`vd-tcard ${flip ? 'vd-flip' : ''}`}>
            <div className="vd-face bg-charcoal dark:bg-white text-white dark:text-charcoal">
              <Sparkles size={20} />
              <span className="text-[10.5px] font-extrabold">{p.name}</span>
              <small className="text-[9px] font-extrabold uppercase tracking-[0.1em] opacity-70">
                {guess != null ? t('verdict.yourGuess', { value: fmt1(guess) }) : t('verdict.sealed')}
              </small>
            </div>
            <div className="vd-face vd-back bg-white dark:bg-[#1a1a1a] border-2 border-sand dark:border-white/10 text-charcoal dark:text-white">
              <Avatar person={p} size={26} />
              <b className="text-[26px] font-black tracking-[-0.05em] tabular-nums leading-none">{fmt1(ratingValue(r))}</b>
              <small className="text-[10.5px] font-extrabold">{p.isMe ? cap(t('spaces.you')) : p.name}</small>
            </div>
          </div>
        );
      })}
    </div>
  );

  const betsBlock = (who: string[]) => {
    const targets = who.filter((id) => id !== currentUserId);
    if (!targets.length) return null;
    return (
      <div className="space-y-2.5">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">{t('verdict.guessTitle')}</p>
        <div className="flex flex-wrap gap-2">
          {targets.map((id) => {
            const g = myGuess(id);
            const p = personById.get(id);
            return (
              <button
                key={id}
                onClick={() => openGuess(id)}
                className={`h-11 pl-1.5 pr-3.5 rounded-full flex items-center gap-2 text-xs font-black active:scale-95 transition-transform ${
                  g != null
                    ? 'bg-forest/10 dark:bg-bitter-lime/10 text-forest dark:text-bitter-lime'
                    : 'border-[1.5px] border-charcoal dark:border-white text-charcoal dark:text-white'
                }`}
              >
                {p && <Avatar person={p} size={30} />}
                {g != null ? t('verdict.yourGuess', { value: fmt1(g) }) : t('verdict.guessOn', { name: nameOf(id) })}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">{t('verdict.guessHint')}</p>
      </div>
    );
  };

  const card = 'rounded-[1.4rem] bg-white dark:bg-[#161616] border border-sand dark:border-white/10 p-4 space-y-3.5';
  const label = 'text-[10px] font-black uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400';
  const ghostBtn =
    'w-full h-12 rounded-2xl bg-sand dark:bg-[#1a1a1a] text-charcoal dark:text-white font-black text-xs active:scale-95 transition-transform';

  // ─── États ─────────────────────────────────────────────────────────────────
  const turnBody = () => (
    <>
      <div className={card}>
        {cardsHtml(false)}
        <div className="flex gap-2.5 items-start rounded-2xl bg-forest/10 dark:bg-bitter-lime/10 p-3 text-[12.5px] font-semibold leading-snug text-charcoal dark:text-white">
          <Sparkles size={16} className="shrink-0 mt-0.5 text-forest dark:text-bitter-lime" />
          <span>
            {raterIds.length ? (
              <>
                <b className="font-black">
                  {t(raterIds.length > 1 ? 'verdict.ratedMany' : 'verdict.ratedOne', { names: listNames(raterIds.map(nameOf), t) })}
                </b>{' '}
                {t('verdict.sealedExplain')}
              </>
            ) : (
              t('verdict.firstToRate')
            )}
          </span>
        </div>
      </div>
      {raterIds.length > 0 && <div className={card}>{betsBlock(raterIds)}</div>}
      <button
        onClick={props.onRate}
        className="w-full h-[52px] rounded-2xl bg-bitter-lime text-charcoal font-black text-sm active:scale-95 transition-transform"
      >
        {t('verdict.rateThis')}
      </button>
      {people.length > 2 && (
        <>
          <button onClick={() => toggleSkip(true)} disabled={busy === 'skip'} className={ghostBtn}>
            {t('verdict.notSeen')}
          </button>
          <p className="text-center text-[11px] font-semibold text-stone-500 dark:text-stone-400">{t('verdict.notSeenHint')}</p>
        </>
      )}
    </>
  );

  const waitBody = () => (
    <>
      <div className={card}>
        {cardsHtml(true)}
        <div className="flex items-center gap-3">
          <ProgressRing done={raterIds.length} total={expected.length} />
          <p className="text-[12.5px] font-semibold leading-snug text-stone-500 dark:text-stone-400">
            <b className="text-charcoal dark:text-white font-black">
              {t(raterIds.length > 1 ? 'verdict.notesOfMany' : 'verdict.notesOf', { done: String(raterIds.length), total: String(expected.length) })}
            </b>{' '}
            {myRating
              ? t(missing.length > 1 ? 'verdict.yourSealedMany' : 'verdict.yourSealedOne', { names: listNames(missing.map(nameOf), t) })
              : t('verdict.waitingFor', { names: listNames(missing.map(nameOf), t) })}
          </p>
        </div>
      </div>
      {missing.some((id) => id !== currentUserId) && <div className={card}>{betsBlock(missing)}</div>}
      {myRating && missing.length > 0 && (
        <div className="space-y-2">
          <p className={`${label} px-1`}>{t('verdict.waitingTitle')}</p>
          {missing
            .filter((id) => id !== currentUserId)
            .map((id) => {
              const p = personById.get(id);
              const left = reminderDaysLeft(id);
              return (
                <div key={id} className="flex items-center gap-3 rounded-2xl border border-sand dark:border-white/10 bg-white dark:bg-[#161616] px-3 py-2.5">
                  {p && <Avatar person={p} size={34} />}
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-black text-charcoal dark:text-white truncate">{cap(nameOf(id))}</span>
                    <span className="block text-[11px] font-semibold text-stone-500 dark:text-stone-400">
                      {left != null ? t('verdict.remindedRecently') : t('verdict.notRatedYet')}
                    </span>
                  </span>
                  <button
                    onClick={() => remind(id)}
                    disabled={left != null || busy === `remind-${id}`}
                    className="h-10 px-3.5 rounded-xl bg-charcoal dark:bg-white text-white dark:text-charcoal text-[11px] font-black disabled:bg-sand disabled:text-stone-500 dark:disabled:bg-[#222] dark:disabled:text-stone-500 active:scale-95 transition-transform"
                  >
                    {left != null ? t('verdict.remindIn', { days: String(left) }) : t('verdict.remind')}
                  </button>
                </div>
              );
            })}
        </div>
      )}
      <p className="text-[11.5px] font-semibold text-stone-500 dark:text-stone-400 px-1">{t('verdict.noAverageYet')}</p>
      <button onClick={props.onRate} className={myRating ? ghostBtn : 'w-full h-12 rounded-2xl bg-bitter-lime text-charcoal font-black text-xs active:scale-95 transition-transform'}>
        {myRating ? t('shared.editVerdict') : t('verdict.seenItToo')}
      </button>
    </>
  );

  const skipBody = () => (
    <>
      <div className={card}>
        {cardsHtml(true)}
        <p className="text-[12.5px] font-semibold text-stone-500 dark:text-stone-400">{t('verdict.youSkipped')}</p>
      </div>
      <button onClick={() => toggleSkip(false)} disabled={busy === 'skip'} className={ghostBtn}>
        {t('verdict.actuallySeen')}
      </button>
    </>
  );

  return (
    <div
      className="fixed inset-0 z-[140] bg-cream dark:bg-[#0c0c0c] overflow-y-auto overscroll-contain animate-[fadeIn_0.2s_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-label={movie.title}
    >
      <div className="max-w-2xl mx-auto pb-[calc(env(safe-area-inset-bottom,0px)+2rem)]">
        <header className="relative h-[210px] text-white overflow-hidden">
          {props.image && <img src={props.image} alt="" className="absolute inset-0 w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black/90" />
          <button
            onClick={props.onClose}
            aria-label={t('common.back')}
            className="absolute left-4 top-[calc(env(safe-area-inset-top,0px)+1rem)] w-11 h-11 rounded-2xl bg-cream dark:bg-[#0c0c0c] text-charcoal dark:text-white flex items-center justify-center active:scale-90 transition-transform"
          >
            <ArrowLeft size={20} strokeWidth={3} />
          </button>
          <div className="absolute left-5 right-5 bottom-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-bitter-lime">{t(`verdict.state.${state}`)}</p>
            <h2 className="mt-1 text-[28px] font-black tracking-[-0.05em] leading-none line-clamp-2">{movie.title}</h2>
            <p className="mt-1.5 text-[11px] font-bold text-stone-200 truncate">
              {[movie.year, movie.runtime ? `${movie.runtime} min` : null, (movie.genres ?? []).slice(0, 2).join(', ') || null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </header>

        <div className="px-4 pt-4 space-y-3.5">
          {state === 'turn' && turnBody()}
          {state === 'wait' && waitBody()}
          {state === 'skip' && skipBody()}
          {state === 'done' && (
            <VerdictBody
              {...props}
              t={t}
              nameOf={nameOf}
              personById={personById}
              raterIds={raterIds}
              avg={avg}
              spread={spread}
              agreement={agreement}
              revealing={revealing}
              cards={cardsHtml(true)}
              myRating={myRating}
              myGuess={myGuess}
              card={card}
              label={label}
              ghostBtn={ghostBtn}
              iAmExpected={iAmExpected}
            />
          )}

          {props.canDelete && (
            <button
              onClick={props.onDelete}
              className="w-full h-11 rounded-2xl text-stone-500 font-black text-[11px] flex items-center justify-center gap-2 active:scale-95 transition-transform hover:text-orange-600"
            >
              <Trash2 size={13} />
              {t('shared.removeSuggestion')}
            </button>
          )}
        </div>
      </div>

      {guessFor && (
        <div className="fixed inset-0 z-[150] bg-black/45 flex items-end justify-center" onClick={() => setGuessFor(null)}>
          <div
            role="dialog"
            aria-label={t('verdict.guessSheet', { name: nameOf(guessFor), title: movie.title })}
            className="w-full max-w-md rounded-t-[2rem] bg-cream dark:bg-[#141414] p-6 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] space-y-4 animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <b className="text-lg font-black tracking-tight text-charcoal dark:text-white leading-tight">
                {t('verdict.guessSheet', { name: nameOf(guessFor), title: movie.title })}
              </b>
              <button onClick={() => setGuessFor(null)} aria-label={t('common.close')} className="w-9 h-9 shrink-0 rounded-full bg-sand dark:bg-[#222] flex items-center justify-center text-charcoal dark:text-white">
                <X size={15} />
              </button>
            </div>
            <div className="text-center text-[56px] font-black tracking-[-0.06em] tabular-nums text-charcoal dark:text-white leading-none">
              {fmt1(guessValue)}
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={guessValue}
              onChange={(e) => setGuessValue(Number(e.target.value))}
              aria-label={t('verdict.guessSlider')}
              className="w-full"
            />
            <p className="text-[12px] font-semibold text-stone-500 dark:text-stone-400">{t('verdict.guessSecret')}</p>
            <button
              onClick={submitGuess}
              disabled={busy === 'guess'}
              className="w-full h-12 rounded-2xl bg-bitter-lime text-charcoal font-black text-sm active:scale-95 transition-transform"
            >
              {t('verdict.guessSubmit')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/** « Léa », « Léa et Tom », « Léa, Tom et Sam ». */
const listNames = (names: string[], t: (k: string) => string) =>
  names.length <= 1 ? names[0] ?? '' : `${names.slice(0, -1).join(', ')} ${t('spaceSync.and')} ${names[names.length - 1]}`;

interface VerdictBodyProps extends VerdictSheetProps {
  t: (key: string, params?: Record<string, string | number>) => string;
  nameOf: (id: string) => string;
  personById: Map<string, VerdictPerson>;
  raterIds: string[];
  avg: number;
  spread: number;
  agreement: ReturnType<typeof agreementOf>;
  revealing: boolean;
  cards: React.ReactNode;
  myRating?: MovieRating;
  myGuess: (target: string) => number | undefined;
  card: string;
  label: string;
  ghostBtn: string;
  iAmExpected: boolean;
}

/** Le verdict tombé : note du groupe, réglette, critères, paris, avis, débat, suite. */
const VerdictBody: React.FC<VerdictBodyProps> = (p) => {
  const { t, movie, currentUserId, ratings, extras, raterIds, avg, spread, agreement, revealing, nameOf, personById, card, label } = p;
  const ratingOf = (id: string) => ratings.find((r) => r.profile_id === id)!;
  const lo = Math.min(...raterIds.map((id) => ratingValue(ratingOf(id))));
  const hi = Math.max(...raterIds.map((id) => ratingValue(ratingOf(id))));

  // Réglette : deux avatars à moins de 0,9 point (leur largeur) s'empilent en hauteur.
  const dots = raterIds.map((id, i) => {
    const v = ratingValue(ratingOf(id));
    const same = raterIds.slice(0, i).filter((o) => Math.abs(ratingValue(ratingOf(o)) - v) < 0.9).length;
    return { id, v, offset: same };
  });
  const lift = Math.max(0, ...dots.map((d) => d.offset)) * 22;

  // Critères : seulement les notes vraiment détaillées.
  const detailed = raterIds
    .map((id) => ({ id, c: criteriaOf(ratingOf(id)) }))
    .filter((x): x is { id: string; c: NonNullable<ReturnType<typeof criteriaOf>> } => !!x.c);
  const gap = criteriaGap(detailed.map((d) => d.c));

  const bets = raterIds
    .filter((id) => id !== currentUserId && p.myGuess(id) != null)
    .map((id) => {
      const g = p.myGuess(id)!;
      const real = ratingValue(ratingOf(id));
      return { id, g, real, res: betResult(g, real) };
    });

  const messages = extras.messages.filter((m) => m.movie_id === movie.id);
  const showDebate = agreement === 'split' || messages.length > 0;
  const iRated = !!p.myRating;

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const send = async () => {
    if (!draft.trim()) return;
    setSending(true);
    const res = await postDebate(movie.id, currentUserId, draft);
    setSending(false);
    if (!res.ok) {
      haptics.error();
      p.onToast?.(t('verdict.debateFailed'));
      return;
    }
    haptics.soft();
    setDraft('');
    p.onChanged();
  };

  const toggleReaction = async (ratingId: string, emoji: ReactionEmoji, on: boolean) => {
    haptics.soft();
    const res = await setReaction(ratingId, currentUserId, emoji, on);
    if (!res.ok) p.onToast?.(t('verdict.reactionFailed'));
    p.onChanged();
  };

  // Suggestions : chargées une fois la fiche ouverte.
  const [suggestions, setSuggestions] = useState<SpaceSuggestion[] | null>(null);
  const [proposed, setProposed] = useState<Set<number>>(new Set());
  useEffect(() => {
    let alive = true;
    p.loadSuggestions().then((list) => alive && setSuggestions(list)).catch(() => alive && setSuggestions([]));
    return () => {
      alive = false;
    };
  }, []);

  const publicDiff = p.publicRating ? avg - p.publicRating.value : null;
  const tagClass =
    agreement === 'agree'
      ? 'bg-forest text-white dark:bg-bitter-lime dark:text-charcoal'
      : agreement === 'close'
        ? 'bg-forest/10 text-forest dark:bg-bitter-lime/10 dark:text-bitter-lime'
        : 'bg-orange-100 text-orange-800 dark:bg-orange-400/15 dark:text-orange-300';
  const skippedNames = p.skipIds.map(nameOf);

  const whyOf = (s: SpaceSuggestion) => {
    if (s.kind === 'release') {
      const d = s.releaseDate ? new Date(`${s.releaseDate}T12:00:00`) : null;
      return d && !Number.isNaN(d.getTime())
        ? t('verdict.sugReleaseWhy', {
            date: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }).replace(/^1 /, '1er '),
          })
        : t('verdict.sugReleaseWhyNoDate');
    }
    if (s.kind === 'each') return (s.genres ?? []).map((g) => `${cap(g.name)} : ${g.genre.toLowerCase()}`).join(' · ');
    return t('verdict.sugCommonWhy', { title: s.from ?? '' });
  };

  return (
    <>
      <div className={card}>
        {p.cards}
        <div className="text-center pt-1">
          <div className="text-[64px] font-black tracking-[-0.07em] leading-[0.9] tabular-nums text-charcoal dark:text-white">
            {revealing ? '–' : <CountUp value={avg} run={!revealing} />}
          </div>
          <p className="mt-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
            {t('verdict.groupScore', { count: String(raterIds.length) })}
          </p>
          {!revealing && (
            <span className={`vd-pop inline-flex mt-2.5 px-3 py-1.5 rounded-full text-[11px] font-black ${tagClass}`}>
              {t(`verdict.agree.${agreement}`)}
              {agreement !== 'agree' && ` · ${t('verdict.ptsGap', { gap: fmt1(spread) })}`}
            </span>
          )}
        </div>
        <div className="relative mx-1" style={{ height: 60 + lift }} role="img" aria-label={raterIds.map((id) => `${nameOf(id)} ${fmt1(ratingValue(ratingOf(id)))}`).join(', ')}>
          <span className="absolute left-0 right-0 h-1 rounded bg-sand dark:bg-white/10" style={{ top: 38 + lift }} />
          <span
            className="vd-scale-spread absolute h-2 rounded bg-forest/40 dark:bg-bitter-lime/40"
            style={{ top: 36 + lift, left: `${revealing ? 50 : lo * 10}%`, width: `${revealing ? 0 : (hi - lo) * 10}%` }}
          />
          {dots.map((d) => {
            const person = personById.get(d.id);
            return (
              <span
                key={d.id}
                className="vd-scale-dot absolute flex flex-col items-center gap-0.5 -translate-x-1/2"
                style={{ left: `${revealing ? 50 : d.v * 10}%`, top: 4 + lift - d.offset * 22 }}
              >
                {person && <Avatar person={person} size={26} className="border-2 border-white dark:border-[#161616]" />}
                <i className="block w-0.5 h-2 bg-charcoal/40 dark:bg-white/40" />
              </span>
            );
          })}
          <span style={{ top: 46 + lift }} className="absolute left-0 right-0 flex justify-between text-[9px] font-extrabold text-stone-500 dark:text-stone-400">
            <span>0</span>
            <span>5</span>
            <span>10</span>
          </span>
        </div>
      </div>

      {gap && (
        <div className={card}>
          <p className={label}>{t('verdict.criteriaTitle')}</p>
          {CRITERIA.map((key) => (
            <div key={key} className="grid grid-cols-[64px_minmax(0,1fr)] gap-2.5 items-center">
              <span className={`text-[11.5px] font-extrabold ${key === gap.key && gap.gap >= 2 ? 'text-orange-700 dark:text-orange-300' : 'text-charcoal dark:text-white'}`}>
                {t(`criteria.${key}`)}
              </span>
              <span className="flex flex-col gap-[3px]">
                {detailed.map((d) => (
                  <span key={d.id} className="relative h-[7px] rounded bg-sand dark:bg-white/10 overflow-hidden">
                    <i
                      className="vd-bar-fill absolute inset-y-0 left-0 rounded"
                      style={{ width: `${revealing ? 0 : d.c[key] * 10}%`, background: personById.get(d.id)?.color }}
                    />
                  </span>
                ))}
              </span>
            </div>
          ))}
          <div className="flex flex-wrap gap-2.5 text-[10.5px] font-extrabold text-stone-500 dark:text-stone-400">
            {detailed.map((d) => (
              <span key={d.id} className="inline-flex items-center gap-1.5">
                <i className="inline-block w-2.5 h-2.5 rounded-[3px]" style={{ background: personById.get(d.id)?.color }} />
                {cap(nameOf(d.id))}
              </span>
            ))}
          </div>
          <div
            className={`flex gap-2 items-start rounded-2xl px-3 py-2.5 text-[12.5px] font-bold leading-snug ${
              gap.gap >= 2
                ? 'bg-orange-100 text-orange-800 dark:bg-orange-400/15 dark:text-orange-300'
                : 'bg-forest/10 text-forest dark:bg-bitter-lime/10 dark:text-bitter-lime'
            }`}
          >
            {gap.gap >= 2 ? <Zap size={15} className="shrink-0 mt-0.5" /> : <Check size={15} className="shrink-0 mt-0.5" />}
            <span>
              {gap.gap >= 2
                ? t('verdict.criteriaSplit', { criterion: t(`criteria.${gap.key}`).toLowerCase(), gap: fmt1(gap.gap) })
                : t('verdict.criteriaAgree', { gap: fmt1(gap.gap) })}
            </span>
          </div>
        </div>
      )}

      {bets.length > 0 && !revealing && (
        <div className={`${card} vd-pop`}>
          <p className={label}>{t('verdict.yourBets')}</p>
          {bets.map((b) => {
            const person = personById.get(b.id);
            return (
              <div key={b.id} className="flex items-center gap-2.5">
                {person && <Avatar person={person} size={26} />}
                <span className="flex-1 min-w-0 text-[12.5px] font-semibold text-charcoal dark:text-white">
                  {t('verdict.betLine', { guess: fmt1(b.g), name: nameOf(b.id), real: fmt1(b.real) })}
                </span>
                <em
                  className={`not-italic shrink-0 text-[10.5px] font-black px-2 py-1 rounded-lg ${
                    b.res === 'hit'
                      ? 'bg-forest text-white dark:bg-bitter-lime dark:text-charcoal'
                      : b.res === 'near'
                        ? 'bg-forest/10 text-forest dark:bg-bitter-lime/10 dark:text-bitter-lime'
                        : 'bg-sand text-stone-600 dark:bg-white/10 dark:text-stone-300'
                  }`}
                >
                  {t(`verdict.bet.${b.res}`)}
                </em>
              </div>
            );
          })}
        </div>
      )}

      {raterIds.some((id) => ratingOf(id).review) && (
        <div className={card}>
          <p className={label}>{t('verdict.quotesTitle')}</p>
          {raterIds
            .filter((id) => ratingOf(id).review)
            .map((id) => {
              const r = ratingOf(id);
              const person = personById.get(id);
              const isMe = id === currentUserId;
              const hidden = p.blocked.has(id);
              const reactions = extras.reactions.filter((x) => x.rating_id === r.id);
              return (
                <div key={id} className="space-y-1.5">
                  <div className="flex gap-2.5 items-start">
                    {person && <Avatar person={person} size={28} />}
                    <div className="flex-1 min-w-0 rounded-[4px_16px_16px_16px] bg-sand dark:bg-[#202020] px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <b className="text-[11px] font-black text-charcoal dark:text-white">
                          {cap(nameOf(id))} · {fmt1(ratingValue(r))}
                        </b>
                        {!isMe && (
                          <button
                            onClick={() =>
                              p.onReport({ contentType: 'review', contentId: r.id, reportedUserId: id, reportedName: nameOf(id), snapshot: r.review })
                            }
                            aria-label={t('moderation.report')}
                            className="w-7 h-7 -mr-1.5 -my-1 flex items-center justify-center text-stone-400 dark:text-stone-500"
                          >
                            <Flag size={11} />
                          </button>
                        )}
                      </div>
                      <p className={`mt-0.5 text-[12.5px] leading-snug font-medium ${hidden ? 'italic text-stone-500' : 'text-charcoal dark:text-stone-200'}`}>
                        {hidden ? t('moderation.hiddenReview') : r.review}
                      </p>
                    </div>
                  </div>
                  {!hidden && (
                    <div className="flex flex-wrap gap-1.5 pl-[38px]">
                      {REACTIONS.map((emoji) => {
                        const who = reactions.filter((x) => x.emoji === emoji).map((x) => x.profile_id);
                        const mine = who.includes(currentUserId);
                        if (isMe && !who.length) return null;
                        if (!isMe && !iRated && !who.length) return null;
                        return (
                          <button
                            key={emoji}
                            disabled={isMe || !iRated}
                            onClick={() => toggleReaction(r.id, emoji, !mine)}
                            aria-pressed={mine}
                            className={`h-8 px-2.5 rounded-full text-[11px] font-extrabold flex items-center gap-1 transition-colors ${
                              mine
                                ? 'bg-charcoal text-white dark:bg-white dark:text-charcoal'
                                : 'bg-white dark:bg-[#161616] border border-sand dark:border-white/10 text-stone-600 dark:text-stone-300'
                            }`}
                          >
                            <span className="text-[13px]">{emoji}</span>
                            {who.length > 0 && who.map(nameOf).join(', ')}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {showDebate && (
        <div className={card}>
          <p className={label}>{t('verdict.debateTitle')}</p>
          {messages.length === 0 && <p className="text-[12px] font-semibold text-stone-500 dark:text-stone-400">{t('verdict.debateEmpty')}</p>}
          {messages.map((m) => {
            const mine = m.profile_id === currentUserId;
            const person = personById.get(m.profile_id);
            const hidden = p.blocked.has(m.profile_id);
            return (
              <div key={m.id} className={`flex gap-2 items-end ${mine ? 'flex-row-reverse' : ''}`}>
                {person && <Avatar person={person} size={24} />}
                <div
                  className={`max-w-[78%] rounded-2xl px-3 py-2 text-[12.5px] font-medium leading-snug ${
                    mine ? 'bg-charcoal text-white dark:bg-white dark:text-charcoal rounded-br-[4px]' : 'bg-sand dark:bg-[#202020] text-charcoal dark:text-stone-200 rounded-bl-[4px]'
                  }`}
                >
                  {hidden ? <i className="text-stone-500">{t('moderation.hiddenReview')}</i> : m.body}
                </div>
                {mine ? (
                  <button
                    onClick={async () => {
                      await deleteDebate(m.id);
                      p.onChanged();
                    }}
                    aria-label={t('verdict.debateDelete')}
                    className="w-7 h-7 flex items-center justify-center text-stone-400"
                  >
                    <X size={12} />
                  </button>
                ) : (
                  <button
                    onClick={() =>
                      p.onReport({ contentType: 'debate_message', contentId: m.id, reportedUserId: m.profile_id, reportedName: nameOf(m.profile_id), snapshot: m.body })
                    }
                    aria-label={t('moderation.report')}
                    className="w-7 h-7 flex items-center justify-center text-stone-400"
                  >
                    <Flag size={11} />
                  </button>
                )}
              </div>
            );
          })}
          {iRated && (
            <div className="flex gap-2 items-center pt-1">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, DEBATE_MAX))}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                maxLength={DEBATE_MAX}
                placeholder={t('verdict.debatePlaceholder')}
                aria-label={t('verdict.debatePlaceholder')}
                className="flex-1 min-w-0 h-11 rounded-2xl bg-sand dark:bg-[#202020] px-3.5 text-[13px] font-semibold text-charcoal dark:text-white placeholder:text-stone-500 outline-none focus:ring-2 focus:ring-forest/30"
              />
              <button
                onClick={send}
                disabled={sending || !draft.trim()}
                aria-label={t('verdict.debateSend')}
                className="w-11 h-11 rounded-2xl bg-charcoal dark:bg-white text-white dark:text-charcoal flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform"
              >
                <Send size={15} />
              </button>
            </div>
          )}
          {iRated && draft.length > DEBATE_MAX - 30 && (
            <p className="text-right text-[10px] font-bold text-stone-500">{DEBATE_MAX - draft.length}</p>
          )}
        </div>
      )}

      {(publicDiff != null || p.myRating) && (
        <div className="grid grid-cols-2 gap-2">
          {publicDiff != null && p.publicRating && (
            <div className="rounded-2xl bg-sand dark:bg-[#161616] px-3 py-2.5">
              <b className="block text-lg font-black tracking-tight tabular-nums text-charcoal dark:text-white">
                {publicDiff >= 0 ? '+' : '−'}
                {fmt1(Math.abs(publicDiff))}
              </b>
              <small className="block text-[10.5px] font-bold text-stone-500 dark:text-stone-400 leading-snug">
                {t('verdict.vsPublic', { source: ratingSourceLabel(p.publicRating.source), value: fmt1(p.publicRating.value) })}
              </small>
            </div>
          )}
          {p.myRating && (
            <div className="rounded-2xl bg-sand dark:bg-[#161616] px-3 py-2.5">
              <b className="block text-lg font-black tracking-tight tabular-nums text-charcoal dark:text-white">
                {ratingValue(p.myRating) - avg >= 0 ? '+' : '−'}
                {fmt1(Math.abs(ratingValue(p.myRating) - avg))}
              </b>
              <small className="block text-[10.5px] font-bold text-stone-500 dark:text-stone-400 leading-snug">{t('verdict.vsGroup')}</small>
            </div>
          )}
        </div>
      )}

      {skippedNames.length > 0 && (
        <p className="text-[11.5px] font-semibold text-stone-500 dark:text-stone-400 px-1">
          {t('verdict.skippedOut', { names: listNames(skippedNames, t) })}
        </p>
      )}

      <div className={card}>
        <p className={label}>{t('verdict.nextTitle')}</p>
        <p className="text-[12px] font-semibold text-stone-500 dark:text-stone-400">
          {agreement === 'split' ? t('verdict.nextSplit') : t('verdict.nextIntro')}
        </p>
        {suggestions == null && <div className="h-[72px] rounded-2xl bg-sand dark:bg-white/5 animate-pulse" />}
        {suggestions?.length === 0 && <p className="text-[12px] font-semibold text-stone-500">{t('verdict.nextNone')}</p>}
        {suggestions?.map((s) => {
          const done = proposed.has(s.tmdbId);
          return (
            <div key={s.tmdbId} className="flex items-center gap-3">
              <Poster url={posterOf(s.posterPath)} className="w-[46px] aspect-[2/3] rounded-[10px] shrink-0" />
              <span className="flex-1 min-w-0">
                <em
                  className={`not-italic block text-[9px] font-black uppercase tracking-[0.1em] ${
                    s.kind === 'release' ? 'text-red-700 dark:text-red-400' : s.kind === 'each' ? 'text-[color:var(--vd-c2)]' : 'text-forest dark:text-bitter-lime'
                  }`}
                >
                  {t(`verdict.sug.${s.kind}`)}
                </em>
                <b className="block text-[13px] font-black leading-tight text-charcoal dark:text-white truncate">{s.title}</b>
                <small className="block mt-0.5 text-[10.5px] font-semibold text-stone-500 dark:text-stone-400 line-clamp-2">{whyOf(s)}</small>
              </span>
              <button
                disabled={done}
                onClick={async () => {
                  haptics.medium();
                  const ok = await p.onPropose(s);
                  if (ok) setProposed((prev) => new Set(prev).add(s.tmdbId));
                }}
                className={`shrink-0 h-10 px-3 rounded-xl text-[11px] font-black active:scale-95 transition-transform ${
                  done ? 'bg-forest/10 text-forest dark:bg-bitter-lime/10 dark:text-bitter-lime' : 'border-[1.5px] border-charcoal dark:border-white text-charcoal dark:text-white'
                }`}
              >
                {done ? t('verdict.proposed') : t('verdict.propose')}
              </button>
            </div>
          );
        })}
      </div>

      <button onClick={p.onRate} className={p.ghostBtn}>
        {p.myRating ? t('shared.editVerdict') : t('verdict.seenItToo')}
      </button>
    </>
  );
};

export default VerdictSheet;
