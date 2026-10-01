import React, { useEffect, useState } from 'react';
import { Clapperboard, ExternalLink, HelpCircle, Sparkles } from 'lucide-react';
import { getSeriesTrivia, SeriesTrivia, TriviaItem } from '../services/seriesTrivia';
import { getEpisodeCrew } from '../services/tv';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  tmdbId: number;
  season: number;
  episode: number;
}

/** Le modèle met parfois les titres en italique Markdown (« *Severance* ») : on montre le texte nu. */
const plain = (text: string) => text.replace(/\*+/g, '');

/** Une question de quiz : on choisit, la bonne réponse s'allume, l'explication suit. */
const QuizCard: React.FC<{
  item: Extract<TriviaItem, { type: 'quiz' }>;
  onAnswer: (right: boolean) => void;
}> = ({ item, onAnswer }) => {
  const { t } = useLanguage();
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked != null;
  return (
    <>
      <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-bitter-lime">
        <HelpCircle size={11} strokeWidth={3} />
        {t('trivia.quiz')}
      </p>
      <p className="mt-2 text-[13px] font-bold leading-snug text-white">{plain(item.question)}</p>
      <div className="mt-3 space-y-1.5">
        {item.options.map((option, index) => {
          const right = index === item.answer;
          return (
            <button
              key={option}
              disabled={answered}
              onClick={() => {
                setPicked(index);
                if (right) haptics.success();
                else haptics.soft();
                onAnswer(right);
              }}
              className={`w-full rounded-xl px-3 py-2 text-left text-[12px] font-bold transition-all active:scale-[0.98] ${
                !answered
                  ? 'bg-white/[0.08] text-white/85'
                  : right
                    ? 'bg-bitter-lime text-black'
                    : index === picked
                      ? 'bg-red-500/25 text-red-200 line-through'
                      : 'bg-white/[0.04] text-white/35'
              }`}
            >
              {plain(option)}
            </button>
          );
        })}
      </div>
      {answered && (
        <p className="mt-2.5 text-[11px] leading-relaxed text-white/60 animate-[fadeIn_0.3s_ease-out]">
          <span className="font-black text-white/85">
            {picked === item.answer ? t('trivia.right') : t('trivia.wrong')}
          </span>{' '}
          {plain(item.explanation)}
        </p>
      )}
    </>
  );
};

/**
 * « Le saviez-vous ? » pendant l'épisode.
 *
 * D'abord ce qui est sûr (qui a réalisé et écrit l'épisode, selon TMDB), puis
 * les anecdotes et le quiz tirés de Wikipédia par la fonction `series-trivia`,
 * déjà triés pour ne rien dévoiler de ce qui vient après la saison en cours.
 */
const TriviaCards: React.FC<Props> = ({ tmdbId, season, episode }) => {
  const { t, language } = useLanguage();
  const [trivia, setTrivia] = useState<SeriesTrivia | null | undefined>(undefined);
  /** `undefined` tant que TMDB n'a pas répondu : le carrousel attend, voir plus bas. */
  const [crew, setCrew] = useState<{ directors: string[]; writers: string[] } | null | undefined>(undefined);
  const [score, setScore] = useState({ right: 0, answered: 0 });

  useEffect(() => {
    let active = true;
    getSeriesTrivia(tmdbId, season, language === 'en' ? 'en' : 'fr').then((value) => active && setTrivia(value));
    getEpisodeCrew(tmdbId, season, episode, language === 'en' ? 'en-US' : 'fr-FR')
      .catch(() => null)
      .then((value) => active && setCrew(value));
    return () => {
      active = false;
    };
  }, [tmdbId, season, episode, language]);

  const items = trivia?.items ?? [];
  const quizCount = items.filter((i) => i.type === 'quiz').length;
  const hasCrew = !!crew && (crew.directors.length > 0 || crew.writers.length > 0);
  const source = trivia?.sources[language === 'en' ? 'en' : 'fr'] ?? trivia?.sources.en ?? trivia?.sources.fr;

  // Rien à dire et plus rien à attendre : la section ne s'affiche pas.
  if (!hasCrew && crew !== undefined && trivia !== undefined && items.length === 0) return null;
  /* La carte de l'épisode vient en premier. L'insérer après coup devant des
     anecdotes déjà là laisserait le carrousel calé sur l'anecdote, la carte
     hors de l'écran à gauche : on attend TMDB, qui répond vite. */
  if (crew === undefined) return null;

  const card = 'w-[78%] max-w-[290px] shrink-0 snap-start rounded-2xl bg-white/[0.06] p-4';

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">{t('trivia.title')}</p>
        {score.answered > 0 && (
          <span className="rounded-full bg-bitter-lime/15 px-2 py-0.5 text-[10px] font-black text-bitter-lime">
            {t('trivia.score', { score: score.right, total: quizCount })}
          </span>
        )}
      </div>
      <ul className="-mx-6 mt-3 flex snap-x snap-mandatory scroll-px-6 gap-3 overflow-x-auto no-scrollbar px-6 pb-1">
        {hasCrew && (
          <li className={card}>
            <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-white/50">
              <Clapperboard size={11} strokeWidth={3} />
              {t('trivia.episode')}
            </p>
            {crew!.directors.length > 0 && (
              <p className="mt-2 text-[13px] leading-snug text-white">
                {t('trivia.directedBy', { names: crew!.directors.join(', ') })}
              </p>
            )}
            {crew!.writers.length > 0 && (
              <p className="mt-1 text-[13px] leading-snug text-white/75">
                {t('trivia.writtenBy', { names: crew!.writers.join(', ') })}
              </p>
            )}
          </li>
        )}
        {trivia === undefined && (
          <li className={`${card} animate-pulse`}>
            <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-white/40">
              <Sparkles size={11} strokeWidth={3} />
              {t('trivia.fact')}
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-white/40">{t('trivia.loading')}</p>
          </li>
        )}
        {items.map((item, index) => (
          <li key={index} className={card}>
            {item.type === 'quiz' ? (
              <QuizCard
                item={item}
                onAnswer={(right) =>
                  setScore((s) => ({ right: s.right + (right ? 1 : 0), answered: s.answered + 1 }))
                }
              />
            ) : (
              <>
                <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-bitter-lime">
                  <Sparkles size={11} strokeWidth={3} />
                  {t('trivia.fact')}
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-white/90">{plain(item.text)}</p>
              </>
            )}
          </li>
        ))}
      </ul>
      {source && items.length > 0 && (
        <a
          href={source}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-white/35"
        >
          {t('trivia.source')}
          <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
};

export default TriviaCards;
