import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Quote, Users, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import { haptics } from '../utils/haptics';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { btnPrimary, btnSecondary } from '../utils/ui';
import { fmt1, ratingValue } from '../utils/verdict';
import type { MovieRating, SharedMovie } from '../services/supabase';
import { Avatar, VerdictPerson } from './verdict/VerdictBits';

/**
 * « Qui a mis cette note ? », dans un espace : un film, une note, parfois son
 * commentaire, et quatre membres. Rien à savoir sur la musique : il suffit de
 * connaître ses amis.
 *
 * On ne devine jamais ses propres notes, mais on peut se choisir comme leurre.
 * Deux membres qui ont mis la même note au film ont raison tous les deux.
 * Rien n'est enregistré : une partie se rejoue autant qu'on veut.
 */

const QUESTION_COUNT = 8;
/** En dessous, la partie tournerait court. */
const MIN_QUESTIONS = 3;

interface WhoQuestion {
  movie: SharedMovie;
  rating: MovieRating;
  options: VerdictPerson[];
  /** Les notes de tous les membres pour ce film, montrées après la réponse. */
  all: { person: VerdictPerson; value: number }[];
}

const shuffle = <T,>(list: T[]): T[] => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/** Les notes des autres qu'on peut faire deviner : un film connu, un membre connu. */
const candidatesOf = (movies: SharedMovie[], ratings: MovieRating[], people: VerdictPerson[], currentUserId: string) => {
  const movieIds = new Set(movies.map((m) => m.id));
  const peopleIds = new Set(people.map((p) => p.id));
  return ratings.filter((r) => r.profile_id !== currentUserId && movieIds.has(r.movie_id) && peopleIds.has(r.profile_id));
};

/** Une note par film d'abord, pour varier ; puis d'autres notes si les films manquent. */
function buildQuestions(movies: SharedMovie[], ratings: MovieRating[], people: VerdictPerson[], currentUserId: string): WhoQuestion[] {
  const pool = shuffle(candidatesOf(movies, ratings, people, currentUserId));
  const seenMovies = new Set<string>();
  const first = pool.filter((r) => !seenMovies.has(r.movie_id) && seenMovies.add(r.movie_id));
  const picked = [...first, ...pool.filter((r) => !first.includes(r))].slice(0, QUESTION_COUNT);

  return picked.map((rating) => {
    const movie = movies.find((m) => m.id === rating.movie_id)!;
    const answer = people.find((p) => p.id === rating.profile_id)!;
    const options = shuffle([answer, ...shuffle(people.filter((p) => p.id !== answer.id)).slice(0, 3)]);
    const all = ratings
      .filter((r) => r.movie_id === movie.id)
      .map((r) => ({ person: people.find((p) => p.id === r.profile_id), value: ratingValue(r) }))
      .filter((row): row is { person: VerdictPerson; value: number } => !!row.person)
      .sort((a, b) => b.value - a.value);
    return { movie, rating, options, all };
  });
}

const WhoRatedGame: React.FC<{
  movies: SharedMovie[];
  ratings: MovieRating[];
  people: VerdictPerson[];
  currentUserId: string;
  spaceName: string;
  onClose: () => void;
}> = ({ movies, ratings, people, currentUserId, spaceName, onClose }) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, t('whoRated.title'));
  const [questions, setQuestions] = useState(() => buildQuestions(movies, ratings, people, currentUserId));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const done = answers.length === questions.length && picked === null && questions.length > 0;

  const question = questions[index];
  const shown = question ? fmt1(ratingValue(question.rating)) : '';
  // La même note au même film : les deux membres ont raison.
  const isRight = (personId: string) => !!question?.all.some((row) => row.person.id === personId && fmt1(row.value) === shown);
  const score = answers.filter(Boolean).length;

  const answer = (personId: string) => {
    if (picked) return;
    const right = isRight(personId);
    right ? haptics.success() : haptics.error();
    setPicked(personId);
    setAnswers((list) => [...list, right]);
  };

  const next = () => {
    setPicked(null);
    if (index < questions.length - 1) setIndex(index + 1);
  };

  const restart = () => {
    setQuestions(buildQuestions(movies, ratings, people, currentUserId));
    setIndex(0);
    setPicked(null);
    setAnswers([]);
  };

  return createPortal(
    <div {...dialog.props} className="fixed inset-0 z-[200] flex justify-center overflow-y-auto bg-[#111] text-white">
      <div className="flex min-h-full w-full max-w-md flex-col gap-5 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-[calc(env(safe-area-inset-top,0px)+16px)]">
        <header className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 transition active:scale-95"
          >
            <X size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-bitter-lime">{t('whoRated.title')}</p>
            <p className="truncate text-sm font-extrabold tracking-tight">{spaceName}</p>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-2 text-[13px] font-black tabular-nums">
            {score}/{questions.length}
          </span>
        </header>

        {!done && question && (
          <>
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${questions.length}, minmax(0, 1fr))` }}
              aria-label={t('blind.progress', { n: index + 1, total: questions.length })}
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

            <div className="relative isolate flex items-end gap-4 overflow-hidden rounded-[28px] bg-white/[0.06] p-4">
              {question.movie.poster_url && (
                <img
                  src={resizeTmdbImage(question.movie.poster_url, 'w342')}
                  alt=""
                  aria-hidden="true"
                  className="h-36 w-24 shrink-0 rounded-[16px] object-cover shadow-xl"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-lg font-black leading-[1.05] tracking-[-0.03em]">{question.movie.title}</p>
                {question.movie.year ? <p className="mt-0.5 text-xs font-semibold text-stone-400">{question.movie.year}</p> : null}
                <p className="mt-3 text-[52px] font-black leading-none tracking-[-0.06em] tabular-nums text-bitter-lime">
                  {shown}
                  <span className="text-lg text-stone-400">/10</span>
                </p>
              </div>
            </div>

            {question.rating.review?.trim() && (
              <blockquote className="flex gap-2 rounded-[20px] bg-white/[0.04] p-3.5 text-sm italic leading-relaxed text-stone-200">
                <Quote size={14} className="mt-1 shrink-0 text-stone-500" aria-hidden="true" />
                <span className="line-clamp-4">{question.rating.review.trim()}</span>
              </blockquote>
            )}

            <p className="text-center text-sm font-bold text-stone-300">{t('whoRated.question')}</p>

            <div className="grid grid-cols-2 gap-2">
              {question.options.map((person) => {
                const right = isRight(person.id);
                const state = picked
                  ? right
                    ? 'border-bitter-lime bg-bitter-lime/15'
                    : person.id === picked
                      ? 'border-[#F08A24] bg-[#F08A24]/15'
                      : 'border-white/10 bg-white/[0.04] opacity-50'
                  : 'border-white/10 bg-white/[0.07]';
                return (
                  <button
                    key={person.id}
                    type="button"
                    disabled={!!picked}
                    onClick={() => answer(person.id)}
                    className={`relative flex h-16 items-center gap-2.5 rounded-[20px] border px-3 text-left transition active:scale-[0.98] ${state}`}
                  >
                    <Avatar person={person} size={34} />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-black tracking-[-0.02em]">
                      {person.isMe ? t('blind.me') : person.name}
                    </span>
                    {picked && right && (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bitter-lime text-[#111]">
                        <Check size={14} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {picked && (
              <div className="rounded-[20px] bg-white/[0.06] p-3.5" role="status">
                <p className={`text-sm font-black ${answers[index] ? 'text-bitter-lime' : 'text-[#F08A24]'}`}>
                  {answers[index] ? t('blind.right') : t('blind.wrong')}
                </p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-stone-400">{t('whoRated.allNotes')}</p>
                <ul className="mt-2 space-y-1.5">
                  {question.all.map(({ person, value }) => (
                    <li key={person.id} className="flex items-center gap-2.5">
                      <Avatar person={person} size={24} />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{person.isMe ? t('blind.me') : person.name}</span>
                      <span className="text-[13px] font-black tabular-nums">{fmt1(value)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {picked && (
              <button type="button" onClick={next} className={`${btnPrimary} mt-auto w-full`}>
                {index < questions.length - 1 ? t('blind.next') : t('blind.seeScore')}
              </button>
            )}
          </>
        )}

        {done && (
          <div className="flex flex-1 flex-col gap-6 pt-10 text-center">
            <Users size={30} className="mx-auto text-bitter-lime" />
            <p className="text-[64px] font-black leading-none tracking-[-0.06em] tabular-nums">
              {score}
              <span className="text-2xl text-stone-400">/{questions.length}</span>
            </p>
            <p className="text-sm font-semibold text-stone-300">
              {t(score >= questions.length * 0.75 ? 'whoRated.doneGood' : score >= questions.length / 2 ? 'whoRated.doneOk' : 'whoRated.doneLow')}
            </p>
            <div className="mt-auto flex flex-col gap-2">
              <button type="button" onClick={restart} className={`${btnPrimary} w-full`}>
                {t('blind.again')}
              </button>
              <button type="button" onClick={onClose} className={`${btnSecondary} w-full !border-white/20 !text-white`}>
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

/** La carte d'entrée dans l'espace. Rien tant que les autres n'ont pas noté assez de films. */
const WhoRatedCard: React.FC<{
  spaceName: string;
  currentUserId: string;
  movies: SharedMovie[];
  ratings: MovieRating[];
  people: VerdictPerson[];
}> = ({ spaceName, currentUserId, movies, ratings, people }) => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const enough = useMemo(
    () => people.length >= 2 && candidatesOf(movies, ratings, people, currentUserId).length >= MIN_QUESTIONS,
    [movies, ratings, people, currentUserId]
  );

  if (!enough) return null;

  return (
    <section aria-label={t('whoRated.title')} className="relative isolate overflow-hidden rounded-[28px] bg-[#111] p-5 text-white">
      <Users aria-hidden="true" size={120} className="pointer-events-none absolute -right-6 -top-6 -z-10 rotate-12 text-white/[0.06]" />
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-bitter-lime">{t('whoRated.kicker')}</p>
      <h2 className="mt-1.5 text-[26px] font-black leading-[0.95] tracking-[-0.055em]">{t('whoRated.title')}</h2>
      <p className="mt-2 text-xs font-semibold leading-snug text-stone-300">{t('whoRated.cardBody')}</p>
      <button
        type="button"
        onClick={() => {
          haptics.medium();
          setOpen(true);
        }}
        className={`${btnPrimary} mt-4 w-full`}
      >
        {t('blind.play')}
      </button>
      {open && (
        <WhoRatedGame
          movies={movies}
          ratings={ratings}
          people={people}
          currentUserId={currentUserId}
          spaceName={spaceName}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
};

export default WhoRatedCard;
