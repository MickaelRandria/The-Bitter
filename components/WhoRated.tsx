import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Lightbulb, Loader2, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import { haptics } from '../utils/haptics';
import { usePosterTint } from '../utils/posterTint';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { btnPrimary, btnSecondary, sectionLabel } from '../utils/ui';
import { fmt1 } from '../utils/verdict';
import type { MovieRating, SharedMovie } from '../services/supabase';
import {
  Taste,
  WhoQuestion,
  WhoScore,
  buildWhoQuestions,
  getWhoLeaderboard,
  isWhoRight,
  memberTastes,
  saveWhoScore,
} from '../services/whoRated';
import { Avatar, VerdictPerson } from './verdict/VerdictBits';
import PingMembers from './PingMembers';

/**
 * « Qui a mis cette note ? », en plein écran, sombre comme le blind test.
 *
 * Question : le film et la note en tampon, le commentaire s'il y en a un, ta
 * propre note en repère, et pour chaque membre proposé sa moyenne et sa façon
 * de noter. Réponse : les notes de l'espace sur une règle de 0 à 10, et ce que
 * ça dit de l'auteur. Fin : qui tu connais le mieux, et défier les autres.
 *
 * Logique et scores : services/whoRated.ts.
 */

type Q = WhoQuestion<VerdictPerson>;

const FALLBACK_TINT = '#2E4A5C';

const leanKey: Record<Taste['lean'], string> = {
  large: 'whoRated.leanLarge',
  severe: 'whoRated.leanSevere',
  even: 'whoRated.leanEven',
};

/** La carte du film : affiche, titre, et la note à deviner en tampon. */
const FilmCard: React.FC<{ question: Q }> = ({ question }) => {
  const { movie } = question;
  const tint = usePosterTint(movie.poster_url ? resizeTmdbImage(movie.poster_url, 'w92') : undefined);
  return (
    <div className="flex gap-3.5 rounded-[28px] p-4" style={{ background: tint ?? FALLBACK_TINT }}>
      {movie.poster_url ? (
        <img
          src={resizeTmdbImage(movie.poster_url, 'w342')}
          alt=""
          aria-hidden="true"
          className="h-[142px] w-24 shrink-0 rounded-[16px] object-cover shadow-[0_18px_40px_rgba(0,0,0,0.35)]"
        />
      ) : (
        <div aria-hidden="true" className="h-[142px] w-24 shrink-0 rounded-[16px] bg-black/25" />
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          <p className="line-clamp-2 text-[19px] font-black leading-[1.05] tracking-[-0.04em]">{movie.title}</p>
          <p className="mt-1 truncate text-[11px] font-bold text-white/70">
            {[movie.director, movie.year].filter(Boolean).join(' · ')}
          </p>
        </div>
        <p className="-rotate-3 self-start rounded-[18px] bg-[#111] px-3 py-2 text-[44px] font-black leading-none tracking-[-0.06em] text-bitter-lime tabular-nums">
          {fmt1(question.value)}
          <span className="text-[15px] text-stone-400">/10</span>
        </p>
      </div>
    </div>
  );
};

/** Les notes de l'espace sur une règle de 0 à 10 ; l'auteur en grand, ton choix cerclé. */
const Scale: React.FC<{ question: Q; picked: string | null }> = ({ question, picked }) => {
  const { t } = useLanguage();
  // Deux notes proches : la seconde descend d'un cran, pour rester lisible.
  let lastValue = -10;
  let lifted = false;
  const marks = question.all.map((row) => {
    lifted = row.value - lastValue < 0.9 ? !lifted : false;
    lastValue = row.value;
    return { ...row, lifted };
  });
  return (
    <div className="rounded-[24px] bg-white/[0.06] p-4">
      <p className={`${sectionLabel} !text-stone-400`}>{t('whoRated.allNotes')}</p>
      <div className="relative mx-4 mt-3 h-[104px]" role="list">
        <div aria-hidden="true" className="absolute inset-x-0 top-[66px] h-1 rounded bg-white/[0.12]" />
        {marks.map(({ person, value, lifted: down }) => {
          const author = person.id === question.answer.id;
          const size = author ? 40 : 30;
          return (
            <div
              key={person.id}
              role="listitem"
              aria-label={`${person.isMe ? t('blind.me') : person.name} : ${fmt1(value)}`}
              className="absolute flex w-10 flex-col items-center"
              style={{ left: `calc(${value * 10}% - 20px)`, top: author ? 0 : down ? 22 : 10 }}
            >
              <span
                className={`rounded-full ${person.id === picked && !author ? 'outline outline-2 outline-offset-2 outline-dashed outline-[#F08A24]' : ''} ${author ? 'shadow-[0_0_0_3px_#111,0_0_0_5px_#fff]' : ''}`}
                style={{ width: size, height: size }}
              >
                <Avatar person={person} size={size} />
              </span>
              <span className={`mt-auto pt-1 text-xs font-black tabular-nums ${author ? 'text-white' : 'text-stone-400'}`}>{fmt1(value)}</span>
            </div>
          );
        })}
      </div>
      <div aria-hidden="true" className="flex justify-between text-[10px] font-bold text-stone-500">
        <span>0</span>
        <span>5</span>
        <span>10</span>
      </div>
    </div>
  );
};

export const WhoRatedGame: React.FC<{
  spaceId: string;
  spaceName: string;
  currentUserId: string;
  movies: SharedMovie[];
  ratings: MovieRating[];
  people: VerdictPerson[];
  onClose: (saved: boolean) => void;
}> = ({ spaceId, spaceName, currentUserId, movies, ratings, people, onClose }) => {
  const { t } = useLanguage();
  const [saved, setSaved] = useState<boolean | null>(null);
  const close = () => onClose(saved === true);
  const dialog = useDialog(close, t('whoRated.title'));
  const [questions, setQuestions] = useState(() => buildWhoQuestions(movies, ratings, people, currentUserId));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [done, setDone] = useState(false);
  const [board, setBoard] = useState<WhoScore[] | null>(null);
  const tastes = useMemo(() => memberTastes(ratings), [ratings]);

  const question = questions[index];
  const score = answers.filter(Boolean).length;
  const total = questions.length;
  // La série en cours : les bonnes réponses d'affilée, jusqu'à la dernière.
  const streakAt = (list: boolean[]) => {
    let n = 0;
    for (let i = list.length - 1; i >= 0 && list[i]; i--) n++;
    return n;
  };
  const streak = streakAt(answers);
  const bestStreak = answers.reduce(
    (acc, right) => (right ? { run: acc.run + 1, best: Math.max(acc.best, acc.run + 1) } : { run: 0, best: acc.best }),
    { run: 0, best: 0 }
  ).best;

  const personName = (person: VerdictPerson) => (person.isMe ? t('blind.me') : person.name);
  const myNote = question?.all.find((row) => row.person.id === currentUserId)?.value;

  const answer = (personId: string) => {
    if (picked || !question) return;
    const right = isWhoRight(question, personId);
    right ? haptics.success() : haptics.error();
    setPicked(personId);
    setAnswers((list) => [...list, right]);
  };

  const next = async () => {
    if (index < questions.length - 1) {
      setPicked(null);
      setIndex(index + 1);
      return;
    }
    setPicked(null);
    setDone(true);
    const ok = await saveWhoScore(spaceId, currentUserId, score, total);
    setSaved(ok);
    setBoard(await getWhoLeaderboard(spaceId));
  };

  const restart = () => {
    setQuestions(buildWhoQuestions(movies, ratings, people, currentUserId));
    setIndex(0);
    setPicked(null);
    setAnswers([]);
    setDone(false);
    setBoard(null);
  };

  // Ce que la réponse dit de l'auteur : sa moyenne comparée à la tienne (ou au groupe).
  const insight = (q: Q) => {
    const author = tastes.get(q.answer.id);
    if (!author) return null;
    const mine = tastes.get(currentUserId);
    const name = personName(q.answer);
    if (!mine || q.answer.id === currentUserId) return t(leanKey[author.lean] + 'Insight', { name, avg: fmt1(author.avg) });
    const diff = author.avg - mine.avg;
    if (Math.abs(diff) < 0.3) return t('whoRated.insightSame', { name });
    return t(diff > 0 ? 'whoRated.insightMore' : 'whoRated.insightLess', { name, d: fmt1(Math.abs(diff)) });
  };

  // Fin de partie : par membre deviné, et la trouvaille la plus éloignée de ses habitudes.
  const byFriend = useMemo(() => {
    const map = new Map<string, { person: VerdictPerson; ok: number; of: number }>();
    answers.forEach((right, i) => {
      const q = questions[i];
      if (!q) return;
      const entry = map.get(q.answer.id) ?? { person: q.answer, ok: 0, of: 0 };
      entry.of += 1;
      if (right) entry.ok += 1;
      map.set(q.answer.id, entry);
    });
    return [...map.values()].sort((a, b) => b.ok / b.of - a.ok / a.of || b.of - a.of);
  }, [answers, questions]);

  const bestFind = useMemo(() => {
    let best: { q: Q; gap: number } | null = null;
    answers.forEach((right, i) => {
      const q = questions[i];
      const taste = q && tastes.get(q.answer.id);
      if (!right || !q || !taste) return;
      const gap = Math.abs(q.value - taste.avg);
      if (!best || gap > best.gap) best = { q, gap };
    });
    return (best as { q: Q; gap: number } | null)?.q ?? null;
  }, [answers, questions, tastes]);

  const leader = board?.[0];
  const leaderPerson = leader ? people.find((p) => p.id === leader.profileId) : undefined;

  return createPortal(
    <div {...dialog.props} className="fixed inset-0 z-[200] flex justify-center overflow-y-auto bg-[#111] text-white">
      <div className="flex min-h-full w-full max-w-md flex-col gap-4 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-[calc(env(safe-area-inset-top,0px)+16px)]">
        <header className="flex items-center gap-3">
          <button
            type="button"
            onClick={close}
            aria-label={t('common.close')}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 transition active:scale-95"
          >
            <X size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#F08A24]">{t('whoRated.title')}</p>
            <p className="truncate text-sm font-extrabold tracking-tight">
              {done || !question ? spaceName : t('whoRated.progress', { n: index + 1, total })}
            </p>
          </div>
          {!done && streak >= 2 ? (
            <span className="rounded-full bg-[#F08A24]/20 px-3 py-2 text-xs font-black text-[#F7B271]">{t('whoRated.streak', { n: streak })}</span>
          ) : (
            <span className="rounded-full bg-white/10 px-3 py-2 text-[13px] font-black tabular-nums">
              {score}/{answers.length || total}
            </span>
          )}
        </header>

        {!done && question && (
          <>
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
              aria-label={t('whoRated.progress', { n: index + 1, total })}
            >
              {questions.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 rounded-full ${
                    i < answers.length ? (answers[i] ? 'bg-bitter-lime' : 'bg-[#F08A24]') : i === index ? 'bg-white' : 'bg-white/15'
                  }`}
                />
              ))}
            </div>

            {!picked ? (
              <>
                <FilmCard question={question} />

                {question.rating.review?.trim() && (
                  <blockquote className="rounded-[20px] bg-white/[0.05] px-3.5 py-3 text-[13px] italic leading-relaxed text-stone-200">
                    <span className="line-clamp-4">« {question.rating.review.trim()} »</span>
                  </blockquote>
                )}

                <p className="flex flex-wrap items-center gap-2 text-xs font-bold text-stone-300">
                  {myNote != null ? (
                    <>
                      <span className="rounded-full bg-white/10 px-2 py-1 font-black text-white">{t('whoRated.yours', { n: fmt1(myNote) })}</span>
                      {t('whoRated.notYours')}
                    </>
                  ) : (
                    t('whoRated.youDidNot')
                  )}
                </p>

                <div className="mt-auto flex flex-col gap-1.5">
                  {question.options.map((person) => {
                    const taste = tastes.get(person.id);
                    return (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => answer(person.id)}
                        className="flex h-[60px] items-center gap-3 rounded-[20px] border border-white/10 bg-white/[0.07] px-3.5 text-left transition active:scale-[0.98]"
                      >
                        <Avatar person={person} size={36} />
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="truncate text-[15px] font-black tracking-[-0.02em]">{personName(person)}</span>
                          {taste && (
                            <span className="flex items-center gap-2">
                              <span aria-hidden="true" className="relative h-1 w-[72px] shrink-0 rounded bg-white/[0.12]">
                                <span className="absolute inset-y-0 left-0 rounded bg-white/70" style={{ width: `${taste.avg * 10}%` }} />
                              </span>
                              <span className="truncate text-[11px] font-bold text-stone-400">
                                {t('whoRated.tasteLine', { avg: fmt1(taste.avg), lean: t(leanKey[taste.lean]) })}
                              </span>
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col items-center gap-2.5 pt-3 text-center" role="status">
                  <span className="rounded-full shadow-[0_0_0_6px_#111,0_0_0_8px_#F08A24]">
                    <Avatar person={question.answer} size={84} />
                  </span>
                  <p className="text-[30px] font-black leading-none tracking-[-0.055em]">
                    {t('whoRated.itWas', { name: personName(question.answer) })}
                  </p>
                  <p className={`text-[13px] font-bold ${answers[index] ? 'text-bitter-lime' : 'text-[#F7B271]'}`}>
                    {answers[index]
                      ? picked !== question.answer.id
                        ? t('whoRated.rightToo', { name: personName(people.find((p) => p.id === picked) ?? question.answer), n: fmt1(question.value) })
                        : streak >= 2
                          ? t('whoRated.rightStreak', { n: streak })
                          : t('blind.right')
                      : streakAt(answers.slice(0, -1)) >= 2
                        ? t('whoRated.wrongStreak', { name: personName(people.find((p) => p.id === picked) ?? question.answer), n: streakAt(answers.slice(0, -1)) })
                        : t('whoRated.wrong', { name: personName(people.find((p) => p.id === picked) ?? question.answer) })}
                  </p>
                </div>

                <Scale question={question} picked={picked} />

                {insight(question) && (
                  <p className="flex items-start gap-2.5 rounded-[18px] bg-bitter-lime/[0.08] px-3.5 py-3 text-xs font-bold leading-relaxed text-[#E6FF66]">
                    <Lightbulb size={16} aria-hidden="true" className="mt-px shrink-0 text-bitter-lime" />
                    {insight(question)}
                  </p>
                )}

                <button type="button" onClick={next} className={`${btnPrimary} mt-auto w-full`}>
                  {index < questions.length - 1 ? t('whoRated.next') : t('blind.seeScore')}
                </button>
              </>
            )}
          </>
        )}

        {done && (
          <div className="flex flex-1 flex-col gap-4 pt-2">
            <div className="text-center">
              <p className="text-[72px] font-black leading-none tracking-[-0.07em] tabular-nums">
                {score}
                <span className="text-[26px] text-stone-500">/{total}</span>
              </p>
              <p className="mt-2 text-[15px] font-extrabold">
                {t(score >= total * 0.75 ? 'whoRated.doneGood' : score >= total / 2 ? 'whoRated.doneOk' : 'whoRated.doneLow')}
              </p>
              <p className="mt-1 text-xs font-semibold text-stone-400">
                {t('whoRated.bestStreak', { n: bestStreak })}
                {board === null ? (
                  <Loader2 size={12} className="ml-1.5 inline animate-spin" />
                ) : leader && leaderPerson ? (
                  ` · ${t('whoRated.record', { name: personName(leaderPerson), score: leader.score, total: leader.total })}`
                ) : null}
              </p>
            </div>

            {byFriend.length > 0 && (
              <div className="rounded-[24px] bg-white/[0.06] p-4">
                <p className={`${sectionLabel} !text-stone-400`}>{t('whoRated.knowBest')}</p>
                <ul className="mt-3 space-y-3">
                  {byFriend.map(({ person, ok, of }) => (
                    <li key={person.id} className="flex items-center gap-2.5">
                      <Avatar person={person} size={34} />
                      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="flex justify-between text-[13px] font-extrabold">
                          <span className="truncate">{personName(person)}</span>
                          <span className="tabular-nums text-stone-300">
                            {ok}/{of}
                          </span>
                        </span>
                        <span aria-hidden="true" className="relative h-1.5 rounded-full bg-white/10">
                          <span
                            className={`absolute inset-y-0 left-0 rounded-full ${ok === of ? 'bg-bitter-lime' : 'bg-[#F08A24]'}`}
                            style={{ width: `${Math.round((ok / of) * 100)}%` }}
                          />
                        </span>
                        <span className="text-[11px] font-semibold text-stone-400">
                          {ok === of
                            ? t('whoRated.friendPerfect')
                            : ok * 2 >= of
                              ? t('whoRated.friendGood')
                              : t('whoRated.friendSurprise', { name: personName(person) })}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {bestFind && (
              <div className="flex items-center gap-3 rounded-[20px] bg-white/[0.06] p-3">
                {bestFind.movie.poster_url && (
                  <img
                    src={resizeTmdbImage(bestFind.movie.poster_url, 'w92')}
                    alt=""
                    aria-hidden="true"
                    className="h-16 w-11 shrink-0 rounded-[10px] object-cover"
                  />
                )}
                <p className="text-xs font-bold leading-relaxed">
                  {t('whoRated.bestFind', { n: fmt1(bestFind.value), name: personName(bestFind.answer), title: bestFind.movie.title })}
                </p>
              </div>
            )}

            {saved === false && <p className="text-center text-xs font-bold text-stone-400">{t('blind.saveFailed')}</p>}

            <div className="rounded-[24px] bg-white/[0.06] p-4">
              <p className={`${sectionLabel} mb-3 !text-stone-400`}>{t('whoRated.challenge')}</p>
              <PingMembers
                spaceId={spaceId}
                what="who"
                people={people}
                score={score}
                total={total}
                shareText={t('whoRated.shareText', { score, total, space: spaceName })}
              />
            </div>

            <div className="mt-auto grid grid-cols-2 gap-2">
              <button type="button" onClick={restart} className={`${btnPrimary} w-full`}>
                {t('blind.again')}
              </button>
              <button type="button" onClick={close} className={`${btnSecondary} w-full !border-white/20 !text-white`}>
                {t('common.close')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

/** Le classement de l'espace, pour la carte d'entrée ; vide sans la table. */
export function useWhoBoard(spaceId: string, enabled: boolean) {
  const [board, setBoard] = useState<WhoScore[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    getWhoLeaderboard(spaceId).then((list) => alive && setBoard(list));
    return () => {
      alive = false;
    };
  }, [spaceId, enabled]);
  return [board, setBoard] as const;
}
