import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Flame, Share2, X } from 'lucide-react';
import { Movie } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { tmdbImage } from '../utils/tmdbImage';
import { DAILY_FILMS } from '../config/dailyFilms';
import { PoolFilm, parisDay, planFor, seeded, streakOf } from '../utils/dailyFil';
import { DayResults, dayResults, doneDays, localAnswer, saveAnswer } from '../services/dailyFil';
import { getMovieDetailsForAdd } from '../services/tmdb';
import { TrailerItem, bestVideo, getTrailerFeed, youtubeEmbed } from '../services/trailers';

/**
 * Le Fil du jour : un rendez-vous de trois minutes, le même pour tout le monde.
 *
 * Le film mystère, « Tu l'as vu ? » (la bande-annonce se lance si non), deux
 * bandes-annonces faites pour toi (dès 5 films notés), deux questions du jour,
 * puis la série et les amis. Le contenu commun se déduit de la date
 * (utils/dailyFil) ; les réponses vont sur le compte (services/dailyFil).
 */
interface Props {
  movies: Movie[];
  onClose: () => void;
  /** « Vu » + une note : le film entre dans la collection, noté. */
  onRateWatched: (tmdbId: number, rating: number) => Promise<boolean>;
  /** « Ça me tente » : le film rejoint « À voir ». */
  onAddWatchlist: (tmdbId: number) => Promise<boolean>;
}

type Step = 'mystery' | 'seen0' | 'seen1' | 'reco0' | 'reco1' | 'q1' | 'q2' | 'end';
const MAX_TRIES = 4;
/** Il faut des notes pour deviner tes goûts : en dessous, pas de recommandations. */
const RECO_FROM = 5;

const poster = (f: PoolFilm, size: 'w342' | 'w500' = 'w500') => tmdbImage(f.p, size);

const shuffleWith = <T,>(list: T[], seed: number) => {
  const rnd = seeded(seed);
  return list.map((x) => ({ x, k: rnd() })).sort((a, b) => a.k - b.k).map((e) => e.x);
};

const DailyFil: React.FC<Props> = ({ movies, onClose, onRateWatched, onAddWatchlist }) => {
  const { t } = useLanguage();
  const day = useMemo(() => parisDay(Date.now()), []);
  const plan = useMemo(() => planFor(DAILY_FILMS, day), [day]);
  const known = useMemo(() => new Set(movies.map((m) => m.tmdbId).filter(Boolean) as number[]), [movies]);
  const rated = movies.filter((m) => m.status === 'watched').length;
  const saved = useMemo(() => localAnswer(day), [day]);

  // « Tu l'as vu ? » : deux films célèbres pas encore dans ta collection.
  const seenFilms = useMemo(() => {
    const taken = new Set([plan.mystery.film.id, ...plan.questions.flatMap((q) => [q.a.id, q.b.id])]);
    return shuffleWith(DAILY_FILMS.filter((f) => !known.has(f.id) && !taken.has(f.id)), 5000 + plan.number).slice(0, 2);
    // Fixés à l'ouverture : la collection change pendant le Fil, pas les cartes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  const [recos, setRecos] = useState<TrailerItem[] | null>(rated >= RECO_FROM ? null : []);
  useEffect(() => {
    if (rated < RECO_FROM) return;
    const seeds = movies
      .filter((m) => m.tmdbId && (m.mediaType ?? 'movie') === 'movie')
      .map((m) => ({ tmdbId: m.tmdbId!, title: m.title, status: m.status, rating: m.status === 'watched' ? (m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4 : undefined }));
    getTrailerFeed('foryou', 'movie', seeds)
      .then((items) => setRecos(items.filter((i) => !known.has(i.tmdbId)).slice(0, 2)))
      .catch(() => setRecos([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const steps: Step[] = useMemo(() => {
    const list: Step[] = ['mystery'];
    seenFilms.forEach((_, i) => list.push(i ? 'seen1' : 'seen0'));
    if (rated >= RECO_FROM && recos !== null) recos.forEach((_, i) => list.push(i ? 'reco1' : 'reco0'));
    list.push('q1', 'q2', 'end');
    return list;
  }, [seenFilms, recos, rated]);

  const [index, setIndex] = useState(0);
  const step = steps[Math.min(index, steps.length - 1)];
  const next = () => {
    haptics.soft();
    setIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  // Le film mystère.
  const [wrong, setWrong] = useState<number[]>([]);
  const [solved, setSolved] = useState<boolean | null>(saved.found != null ? !!saved.found : null);
  const [clues, setClues] = useState<string[]>([]);
  useEffect(() => {
    const f = plan.mystery.film;
    getMovieDetailsForAdd(f.id)
      .then((d) => {
        const list = [
          `${d?.genre ? d.genre.split(',')[0] : t('fil.film')} · ${f.y}`,
          d?.director ? t('fil.clueDirector', { name: d.director }) : null,
          d?.actors ? t('fil.clueActor', { name: d.actors.split(',')[0].trim() }) : null,
          d?.review ? `« ${d.review.split(/[.!?]\s/)[0].slice(0, 110)}… »` : null,
        ].filter(Boolean) as string[];
        setClues(list);
      })
      .catch(() => setClues([`${f.y}`]));
    // Une seule lecture par film : `t` change à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);
  const tries = wrong.length + (solved ? 1 : 0);
  const blur = solved != null ? 0 : Math.max(4, 22 - wrong.length * 6);
  const guess = (f: PoolFilm) => {
    if (solved != null || wrong.includes(f.id)) return;
    if (f.id === plan.mystery.film.id) {
      haptics.success();
      setSolved(true);
      void saveAnswer(day, { tries: wrong.length + 1, found: true });
    } else {
      haptics.error();
      const now = [...wrong, f.id];
      setWrong(now);
      if (now.length >= MAX_TRIES - 1) {
        setSolved(false);
        void saveAnswer(day, { tries: MAX_TRIES, found: false });
      }
    }
  };
  const share = async () => {
    const text = solved
      ? t('fil.shareFound', { n: String(plan.number), tries: String(tries) })
      : t('fil.shareMissed', { n: String(plan.number) });
    try {
      if (navigator.share) await navigator.share({ text, url: 'https://thebitter.watch' });
      else await navigator.clipboard.writeText(`${text} https://thebitter.watch`);
    } catch {
      // Partage annulé : rien à faire.
    }
  };

  // « Tu l'as vu ? » et les bandes-annonces.
  const [seenMode, setSeenMode] = useState<'ask' | 'rate' | 'trailer'>('ask');
  const [rating, setRating] = useState(7);
  const [video, setVideo] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setSeenMode('ask');
    setRating(7);
    setVideo(undefined);
  }, [index]);
  const seenFilm = step === 'seen0' ? seenFilms[0] : step === 'seen1' ? seenFilms[1] : null;
  const notSeen = async () => {
    if (!seenFilm) return;
    haptics.soft();
    setSeenMode('trailer');
    const v = await bestVideo('movie', seenFilm.id).catch(() => null);
    if (!v) next();
    else setVideo(v.key);
  };
  const reco = step === 'reco0' ? recos?.[0] : step === 'reco1' ? recos?.[1] : null;
  useEffect(() => {
    if ((step === 'reco0' || step === 'reco1') && !reco) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, reco]);

  // Les questions du jour.
  const [votes, setVotes] = useState<{ q1?: 'a' | 'b'; q2?: 'a' | 'b' }>({ q1: saved.q1, q2: saved.q2 });
  const [results, setResults] = useState<DayResults | null>(null);
  const vote = async (key: 'q1' | 'q2', side: 'a' | 'b') => {
    if (votes[key]) return;
    haptics.medium();
    setVotes((v) => ({ ...v, [key]: side }));
    await saveAnswer(day, { [key]: side });
    setResults(await dayResults(day));
  };

  // La fin : série, amis, demain.
  const [streak, setStreak] = useState<number | null>(null);
  useEffect(() => {
    if (step !== 'end') return;
    (async () => {
      await saveAnswer(day, { done: true });
      const days = await doneDays();
      days.add(day);
      setStreak(streakOf(days, day));
      setResults(await dayResults(day));
    })();
  }, [step, day]);

  // Le défilement de la page dessous est bloqué tant que le Fil est ouvert.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const lime = 'bg-bitter-lime text-charcoal';
  const ghostBtn = 'bg-white/10 border border-white/10 text-white';
  const big = 'h-12 rounded-2xl text-[13px] font-black active:scale-[0.98] transition-transform';
  const friendsDone = (results?.friends ?? []).filter((f) => f.done);

  const question = (key: 'q1' | 'q2') => {
    const q = plan.questions.find((x) => x.key === key)!;
    const mine = votes[key];
    const counts = results ? results[key] : null;
    const total = counts ? counts.a + counts.b : 0;
    const pct = (side: 'a' | 'b') => (counts && total ? Math.round((counts[side] / total) * 100) : null);
    const sameFriends = (results?.friends ?? []).filter((f) => f[key] && f[key] === mine).map((f) => f.name);
    return (
      <div className="flex-1 flex flex-col gap-3 pt-2">
        <span className="text-center text-[10px] font-black uppercase tracking-[0.16em] text-bitter-lime">{t('fil.question')}</span>
        <h2 className="text-center text-[21px] font-black tracking-[-0.045em]">{t(`fil.prompt.${q.prompt}`)}</h2>
        <div className="grid grid-cols-2 gap-2.5">
          {(['a', 'b'] as const).map((side) => {
            const f = q[side];
            return (
              <button
                key={side}
                type="button"
                onClick={() => vote(key, side)}
                aria-pressed={mine === side}
                className={`relative isolate overflow-hidden rounded-[18px] aspect-[2/3] text-left transition-[filter,box-shadow] ${
                  mine && mine !== side ? 'grayscale brightness-50' : ''
                } ${mine === side ? 'ring-2 ring-bitter-lime' : ''}`}
              >
                <img src={poster(f, 'w342')} alt="" className="absolute inset-0 -z-20 w-full h-full object-cover" />
                <span className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,transparent_40%,rgba(0,0,0,0.85))]" />
                <b className="absolute left-2.5 right-2.5 bottom-2.5 text-[13px] font-black tracking-[-0.02em] leading-tight text-white">{f.t}</b>
              </button>
            );
          })}
        </div>
        {!mine ? (
          <p className="text-center text-[11.5px] font-bold text-white/40">{t('fil.voteHint')}</p>
        ) : (
          <div className="flex flex-col gap-2.5 animate-[fadeIn_0.3s_ease-out]">
            {(['a', 'b'] as const).map((side) => {
              const p = pct(side);
              return (
                <div key={side} className="flex flex-col gap-1">
                  <span className="flex justify-between text-[12px] font-extrabold">
                    <span className="truncate pr-2">{q[side].t}</span>
                    <b className="tabular-nums">{p == null ? '—' : `${p} %`}</b>
                  </span>
                  <span className="h-2 rounded-full bg-white/[0.08] overflow-hidden">
                    <i className={`block h-full rounded-full transition-[width] duration-700 ${mine === side ? 'bg-bitter-lime' : 'bg-white/40'}`} style={{ width: `${p ?? 0}%` }} />
                  </span>
                </div>
              );
            })}
            <p className="text-[11.5px] font-bold text-white/60">
              {results
                ? sameFriends.length
                  ? t('fil.friendsAgree', { names: sameFriends.slice(0, 3).join(', ') })
                  : t('fil.players', { n: String(results.players) })
                : t('fil.resultsSoon')}
            </p>
            <button type="button" onClick={next} className={`${big} ${lime} mt-1`}>
              {t('fil.next')}
            </button>
          </div>
        )}
      </div>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-[#070707] text-white flex flex-col" role="dialog" aria-modal="true" aria-label={t('fil.title')}>
      {/* La progression, comme une story, et de quoi fermer. */}
      <div className="shrink-0 px-3 pt-[calc(env(safe-area-inset-top,0px)+10px)]">
        <div className="flex gap-[3px]">
          {steps.map((s, i) => (
            <i key={s} className={`flex-1 h-[3px] rounded-full ${i < index ? 'bg-white' : i === index ? 'bg-white/70' : 'bg-white/20'}`} />
          ))}
        </div>
        <div className="mt-2.5 flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/60">{t('fil.number', { n: String(plan.number) })}</span>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="w-9 h-9 -mr-1 rounded-full bg-white/10 flex items-center justify-center">
            <X size={17} />
          </button>
        </div>
      </div>

      <div key={step} className="flex-1 min-h-0 flex flex-col px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] animate-[fadeIn_0.3s_ease-out]">
        {step === 'mystery' && (
          <div className="flex-1 flex flex-col items-center gap-3 pt-2">
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-bitter-lime">{t('fil.mystery')}</span>
            <h2 className="text-[21px] font-black tracking-[-0.045em]">{solved == null ? t('fil.whichFilm') : plan.mystery.film.t}</h2>
            <div className="relative w-[56%] max-w-[240px] aspect-[2/3] rounded-2xl overflow-hidden shadow-[0_24px_40px_-18px_rgba(0,0,0,0.9)]">
              <img
                src={poster(plan.mystery.film)}
                alt=""
                className="w-full h-full object-cover transition-[filter,transform] duration-700"
                style={{ filter: blur ? `blur(${blur}px) saturate(1.2)` : 'none', transform: blur ? 'scale(1.15)' : 'none' }}
              />
            </div>
            <div className="flex gap-1.5" aria-label={t('fil.triesLeft', { n: String(MAX_TRIES - tries) })}>
              {Array.from({ length: MAX_TRIES }, (_, i) => (
                <i
                  key={i}
                  className={`w-6 h-1.5 rounded-full ${
                    i < wrong.length ? 'bg-[#F08A24]' : solved && i === wrong.length ? 'bg-bitter-lime' : 'bg-white/15'
                  }`}
                />
              ))}
            </div>
            <p className="min-h-[18px] text-center text-[12px] font-bold text-white/70">
              {solved == null
                ? clues[Math.min(wrong.length, clues.length - 1)] ?? ''
                : solved
                  ? t('fil.foundIn', { n: String(tries) })
                  : t('fil.missed')}
            </p>
            {solved == null ? (
              <div className="w-full grid grid-cols-2 gap-2 mt-auto">
                {plan.mystery.options.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    disabled={wrong.includes(f.id)}
                    onClick={() => guess(f)}
                    className="min-h-12 px-2 py-2.5 rounded-xl bg-white/[0.08] border border-white/10 text-[12px] font-extrabold leading-tight disabled:opacity-30 active:scale-[0.98] transition-transform"
                  >
                    {f.t}
                  </button>
                ))}
              </div>
            ) : (
              <div className="w-full grid grid-cols-[auto_1fr] gap-2 mt-auto">
                <button type="button" onClick={share} aria-label={t('fil.share')} className={`${big} ${ghostBtn} w-12 flex items-center justify-center`}>
                  <Share2 size={17} />
                </button>
                <button type="button" onClick={next} className={`${big} ${lime}`}>
                  {t('fil.next')}
                </button>
              </div>
            )}
          </div>
        )}

        {seenFilm && (
          <div className="flex-1 flex flex-col items-center gap-3.5 pt-2">
            {seenMode === 'trailer' ? (
              <>
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-bitter-lime">{t('fil.trailer')}</span>
                <h2 className="text-[21px] font-black tracking-[-0.045em] text-center">{seenFilm.t}</h2>
                <div className="w-full aspect-video rounded-2xl overflow-hidden bg-black">
                  {video ? (
                    <iframe src={youtubeEmbed(video)} title={seenFilm.t} allow="autoplay; encrypted-media; picture-in-picture" className="w-full h-full" />
                  ) : (
                    <span className="block w-full h-full animate-pulse bg-white/5" />
                  )}
                </div>
                <div className="w-full grid grid-cols-2 gap-2 mt-auto">
                  <button type="button" onClick={next} className={`${big} ${ghostBtn}`}>{t('fil.meh')}</button>
                  <button
                    type="button"
                    onClick={() => {
                      haptics.success();
                      void onAddWatchlist(seenFilm.id);
                      next();
                    }}
                    className={`${big} ${lime}`}
                  >
                    {t('fil.tempting')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="relative w-[62%] max-w-[260px] aspect-[2/3] rounded-[20px] overflow-hidden -rotate-3 shadow-[0_28px_46px_-18px_rgba(0,0,0,0.9)]">
                  <img src={poster(seenFilm)} alt="" className="w-full h-full object-cover" />
                </div>
                <h2 className="text-[21px] font-black tracking-[-0.045em]">{t('fil.seenIt')}</h2>
                <p className="-mt-2 text-[12px] font-bold text-white/60">
                  {seenFilm.t} · {seenFilm.y}
                </p>
                {seenMode === 'rate' ? (
                  <div className="w-full mt-auto flex flex-col gap-3">
                    <label className="flex flex-col gap-2 p-3 rounded-2xl bg-white/[0.08] border border-white/10">
                      <span className="flex justify-between text-[11.5px] font-extrabold text-white/60">
                        {t('fil.yourRating')}
                        <b className="text-[19px] tracking-[-0.04em] text-bitter-lime tabular-nums">{rating.toFixed(1).replace('.', ',')}</b>
                      </span>
                      <input type="range" min={0} max={10} step={0.5} value={rating} onChange={(e) => setRating(Number(e.target.value))} className="w-full accent-[#D9FF00]" />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        haptics.success();
                        void onRateWatched(seenFilm.id, rating);
                        next();
                      }}
                      className={`${big} ${lime}`}
                    >
                      {t('fil.save')}
                    </button>
                  </div>
                ) : (
                  <div className="w-full grid grid-cols-2 gap-2 mt-auto">
                    <button type="button" onClick={notSeen} className={`${big} ${ghostBtn}`}>{t('fil.notSeen')}</button>
                    <button type="button" onClick={() => { haptics.soft(); setSeenMode('rate'); }} className={`${big} ${lime}`}>{t('fil.seen')}</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {reco && (
          <div className="flex-1 flex flex-col gap-3.5 pt-2">
            <span className="text-center text-[10px] font-black uppercase tracking-[0.16em] text-bitter-lime">{t('fil.forYou')}</span>
            <h2 className="text-center text-[21px] font-black tracking-[-0.045em]">{reco.title}</h2>
            {reco.reason.kind === 'because' && <p className="-mt-2 text-center text-[12px] font-bold text-white/60">{t('trailers.because', { title: reco.reason.from })}</p>}
            <div className="w-full aspect-video rounded-2xl overflow-hidden bg-black">
              <iframe src={youtubeEmbed(reco.videoKey)} title={reco.title} allow="autoplay; encrypted-media; picture-in-picture" className="w-full h-full" />
            </div>
            <div className="w-full grid grid-cols-2 gap-2 mt-auto">
              <button type="button" onClick={next} className={`${big} ${ghostBtn}`}>{t('fil.skip')}</button>
              <button
                type="button"
                onClick={() => {
                  haptics.success();
                  void onAddWatchlist(reco.tmdbId);
                  next();
                }}
                className={`${big} ${lime}`}
              >
                {t('fil.myList')}
              </button>
            </div>
          </div>
        )}

        {step === 'q1' && question('q1')}
        {step === 'q2' && question('q2')}

        {step === 'end' && (
          <div className="flex-1 flex flex-col gap-3 pt-6">
            <div className="flex items-center justify-center gap-2.5">
              <Flame size={40} className="text-[#F08A24]" fill="currentColor" />
              <b className="text-[56px] font-black tracking-[-0.07em] leading-[0.9] tabular-nums">{streak ?? '…'}</b>
            </div>
            <h2 className="text-center text-[21px] font-black tracking-[-0.045em]">
              {streak && streak > 1 ? t('fil.streak', { n: String(streak) }) : t('fil.firstDay')}
            </h2>
            <div className="flex flex-col mt-2">
              <span className="flex justify-between py-2.5 border-t border-white/[0.08] text-[12.5px] font-extrabold">
                {t('fil.mystery')}
                <b className="text-bitter-lime">{solved ? t('fil.foundShort', { n: String(tries) }) : t('fil.missedShort')}</b>
              </span>
              {results && (
                <span className="flex justify-between py-2.5 border-t border-white/[0.08] text-[12.5px] font-extrabold">
                  {t('fil.playersToday')}
                  <b className="text-bitter-lime tabular-nums">{results.players}</b>
                </span>
              )}
              <span className="flex justify-between py-2.5 border-t border-white/[0.08] text-[12.5px] font-extrabold">
                {t('fil.friendsToday')}
                <b className="text-bitter-lime">{results ? (friendsDone.length ? friendsDone.slice(0, 3).map((f) => f.name).join(', ') : t('fil.noneYet')) : '—'}</b>
              </span>
            </div>
            <div className="mt-auto rounded-2xl bg-white/[0.06] px-3.5 py-3 text-[12px] font-bold text-white/60">
              {t('fil.tomorrow')}
              <b className="block mt-0.5 text-[13px] text-white">{t('fil.tomorrowMystery', { decade: String(plan.tomorrowDecade) })}</b>
            </div>
            <button type="button" onClick={onClose} className={`${big} ${lime} flex items-center justify-center gap-2`}>
              <Check size={17} strokeWidth={3} />
              {t('fil.done')}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default DailyFil;

