import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, ExternalLink, RotateCcw, Sparkles, Target, X } from 'lucide-react';
import { generateSeriesTrivia, SeriesTrivia, TriviaItem } from '../services/seriesTrivia';
import { getEpisodeCrew } from '../services/tv';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { haptics } from '../utils/haptics';
import { useDialog } from '../utils/useDialog';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  title: string;
  image?: string;
  tmdbId: number;
  season: number;
  episode: number;
  onClose: () => void;
}

type View = 'loading' | 'error' | 'empty' | 'home' | 'facts' | 'quiz' | 'result';
type Fact = Extract<TriviaItem, { type: 'fact' }>;
type Quiz = Extract<TriviaItem, { type: 'quiz' }>;

/** Le modèle met parfois les titres en italique Markdown (« *Severance* ») : on montre le texte nu. */
const plain = (text: string) => text.replace(/\*+/g, '');

/** Le temps habituel d'une première préparation, pour la jauge d'attente. */
const EXPECTED_SECONDS = 35;

/** Une manche de quiz : quatre questions. */
const ROUND_SIZE = 4;
/** Après la première manche, deux relances au plus par épisode. */
const MAX_RELAUNCHES = 2;
/** Une dernière manche plus courte passe, une question seule non. */
const MIN_ROUND = 2;

/**
 * L'ordre des questions pour un épisode donné. Toujours le même pour cet
 * épisode (on peut refaire sa manche), différent d'un épisode à l'autre : le
 * quiz ne recommence pas par les mêmes questions à chaque soirée.
 */
function episodeOrder<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const random = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** La manche atteinte pour cet épisode, gardée sur l'appareil : fermer l'écran ne rend pas les relances. */
const roundKey = (tmdbId: number, season: number, episode: number) =>
  `bitter.triviaRound:${tmdbId}:${season}:${episode}`;
const readRound = (key: string) => {
  try {
    return Math.max(0, Math.min(MAX_RELAUNCHES, Number(localStorage.getItem(key)) || 0));
  } catch {
    return 0;
  }
};
const writeRound = (key: string, round: number) => {
  try {
    localStorage.setItem(key, String(round));
  } catch {
    /* Navigation privée : la limite ne survivra pas à la fermeture, rien de grave. */
  }
};

/**
 * « Le saviez-vous + » : les coulisses de la série, en plein écran.
 *
 * Deux parcours séparés depuis l'accueil. Les ANECDOTES se lisent comme des
 * stories : une par écran, une barre par anecdote, on touche à droite pour
 * avancer. Le QUIZ pose une question à la fois et finit sur un score.
 *
 * C'est l'ouverture de cet écran qui prépare le contenu quand il n'existe pas
 * encore (une seule fois par série, pour tout le monde) : l'attente est donc
 * mise en scène, et on peut fermer, la préparation continue sans nous.
 */
const TriviaExperience: React.FC<Props> = ({ title, image, tmdbId, season, episode, onClose }) => {
  const { t, language } = useLanguage();
  const dialog = useDialog(onClose, t('trivia.plus'));
  const [view, setView] = useState<View>('loading');
  const [trivia, setTrivia] = useState<SeriesTrivia | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [crew, setCrew] = useState<{ directors: string[]; writers: string[] } | null>(null);
  const [factIndex, setFactIndex] = useState(0);
  const [quizIndex, setQuizIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const storageKey = roundKey(tmdbId, season, episode);
  const [round, setRound] = useState(() => readRound(storageKey));

  useEffect(() => {
    let active = true;
    setView('loading');
    setElapsed(0);
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 250);
    generateSeriesTrivia(tmdbId, season, language === 'en' ? 'en' : 'fr').then((result) => {
      window.clearInterval(timer);
      if (!active) return;
      if ('error' in result) {
        setError(
          result.error === 'unauthenticated'
            ? t('trivia.needAccount')
            : result.error === 'unavailable'
              ? t('trivia.unavailable')
              : result.error
        );
        setView('error');
        return;
      }
      setTrivia(result);
      setView(result.status === 'ready' ? 'home' : 'empty');
      if (result.status === 'ready') haptics.success();
    });
    return () => {
      active = false;
      window.clearInterval(timer);
    };
    // `t` change d'identité à chaque rendu ; seule la série compte ici.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbId, season, language, attempt]);

  useEffect(() => {
    let active = true;
    getEpisodeCrew(tmdbId, season, episode, language === 'en' ? 'en-US' : 'fr-FR')
      .catch(() => null)
      .then((value) => active && setCrew(value));
    return () => {
      active = false;
    };
  }, [tmdbId, season, episode, language]);

  const facts = useMemo(() => (trivia?.items ?? []).filter((i): i is Fact => i.type === 'fact'), [trivia]);
  const quiz = useMemo(() => (trivia?.items ?? []).filter((i): i is Quiz => i.type === 'quiz'), [trivia]);
  /** Le quiz de l'IA se signale comme tel ; celui des bases de données, non (une ancienne entrée sans origine est de l'IA). */
  const aiQuiz = quiz.length > 0 && !quiz.some((q) => q.origin === 'data');
  const rounds = useMemo(() => {
    const ordered = episodeOrder<Quiz>(quiz, `${tmdbId}:${season}:${episode}`);
    const chunks: Quiz[][] = [];
    for (let i = 0; i < ordered.length; i += ROUND_SIZE) chunks.push(ordered.slice(i, i + ROUND_SIZE));
    return chunks.filter((chunk) => chunk.length >= MIN_ROUND).slice(0, 1 + MAX_RELAUNCHES);
  }, [quiz, tmdbId, season, episode]);
  const currentRound = Math.min(round, Math.max(0, rounds.length - 1));
  const questions = rounds[currentRound] ?? [];
  const nextRound = rounds[currentRound + 1];
  const source = trivia?.sources[language === 'en' ? 'en' : 'fr'] ?? trivia?.sources.en ?? trivia?.sources.fr;
  const steps = [t('trivia.loading1'), t('trivia.loading2'), t('trivia.loading3')];
  const step = Math.min(steps.length - 1, Math.floor(elapsed / (EXPECTED_SECONDS / steps.length)));
  // Une jauge qui avance vite puis ralentit : elle ne promet jamais une fin qu'elle ne connaît pas.
  const gauge = 96 * (1 - Math.exp(-elapsed / (EXPECTED_SECONDS * 0.6)));

  const openFacts = () => {
    haptics.soft();
    setFactIndex(0);
    setView('facts');
  };
  const openQuiz = () => {
    haptics.soft();
    setQuizIndex(0);
    setPicked(null);
    setScore(0);
    setView('quiz');
  };
  const nextFact = () => {
    haptics.soft();
    if (factIndex < facts.length - 1) setFactIndex(factIndex + 1);
    else if (questions.length) openQuiz();
    else setView('home');
  };

  const relaunch = () => {
    const next = currentRound + 1;
    setRound(next);
    writeRound(storageKey, next);
    openQuiz();
  };

  const verdict =
    questions.length === 0
      ? ''
      : score === questions.length
        ? t('trivia.verdictPerfect')
        : score / questions.length >= 0.5
          ? t('trivia.verdictGood')
          : score > 0
            ? t('trivia.verdictSome')
            : t('trivia.verdictNone');

  const tile =
    'flex w-full items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.05] p-5 text-left transition-transform active:scale-[0.98]';
  const primary =
    'flex w-full items-center justify-center gap-2 rounded-2xl bg-bitter-lime py-4 text-[11px] font-black uppercase tracking-widest text-black transition-transform active:scale-[0.98]';
  const quiet = 'flex items-center gap-1.5 py-2 text-[10px] font-black uppercase tracking-widest text-white/45';

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[310] flex justify-center bg-[#070707] text-white animate-[fadeIn_0.3s_ease-out]"
    >
      {image && (
        <img
          src={resizeTmdbImage(image, 'w780')}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[60dvh] w-full object-cover opacity-60 motion-safe:animate-[kenburns_14s_ease-out_infinite_alternate]"
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-[#070707]/75 to-[#070707]" />

      <div className="relative flex h-full w-full max-w-md flex-col px-6 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        {/* En-tête : où l'on est, et de quoi revenir. */}
        <div className="flex items-center justify-between gap-3">
          {view === 'facts' || view === 'quiz' || view === 'result' ? (
            <button onClick={() => setView('home')} className={quiet}>
              <ChevronLeft size={14} strokeWidth={3} />
              {t('trivia.back')}
            </button>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-bitter-lime px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-black">
              <Sparkles size={11} strokeWidth={3} />
              {t('trivia.plus')}
            </span>
          )}
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-transform active:scale-90"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        {view === 'loading' && (
          <div className="flex flex-1 flex-col justify-center animate-[fadeIn_0.4s_ease-out]">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40">{title}</p>
            <p key={step} className="mt-3 text-[26px] font-black leading-tight tracking-tight animate-[fadeIn_0.5s_ease-out]">
              {steps[step]}
            </p>
            <div className="mt-8 h-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-bitter-lime transition-[width] duration-300" style={{ width: `${gauge}%` }} />
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-white/45">{t('trivia.loadingHint')}</p>
          </div>
        )}

        {(view === 'error' || view === 'empty') && (
          <div className="flex flex-1 flex-col justify-center gap-6 animate-[fadeIn_0.4s_ease-out]">
            <p className="text-[18px] font-bold leading-snug text-white/80">
              {view === 'error' ? error : t('trivia.empty')}
            </p>
            {view === 'error' && (
              <button
                onClick={() => {
                  haptics.soft();
                  setAttempt((n) => n + 1);
                }}
                className={primary}
              >
                <RotateCcw size={14} strokeWidth={2.5} />
                {t('trivia.retry')}
              </button>
            )}
          </div>
        )}

        {view === 'home' && (
          <div className="flex flex-1 flex-col justify-end gap-3 pb-2 animate-[fadeIn_0.4s_ease-out]">
            <div className="mb-4">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40">
                {t('trivia.seasonChip', { season })}
              </p>
              <p className="mt-1 text-[34px] font-black leading-none tracking-tight line-clamp-2">{title}</p>
              {crew && (crew.directors.length > 0 || crew.writers.length > 0) && (
                <p className="mt-3 text-[12px] leading-relaxed text-white/55">
                  {[
                    crew.directors.length ? t('trivia.directedBy', { names: crew.directors.join(', ') }) : '',
                    crew.writers.length ? t('trivia.writtenBy', { names: crew.writers.join(', ') }) : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
            </div>
            {facts.length > 0 && (
              <button onClick={openFacts} className={tile}>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-bitter-lime text-black">
                  <BookOpen size={22} strokeWidth={2.5} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-black tracking-tight">{t('trivia.factsTile')}</span>
                  <span className="block text-[12px] text-white/50">{t('trivia.factsCount', { count: facts.length })}</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-white/40" />
              </button>
            )}
            {questions.length > 0 && (
              <button onClick={openQuiz} className={tile}>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-black">
                  <Target size={22} strokeWidth={2.5} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-black tracking-tight">{t('trivia.quizTile')}</span>
                  <span className="block text-[12px] text-white/50">
                    {rounds.length > 1
                      ? t('trivia.roundOf', { round: currentRound + 1, total: rounds.length }) + ' · '
                      : ''}
                    {t('trivia.quizRound', { count: questions.length })}
                  </span>
                  <span className={`mt-1 block text-[10px] font-bold ${aiQuiz ? 'text-amber-300/90' : 'text-white/35'}`}>
                    {aiQuiz ? t('trivia.quizAi') : t('trivia.quizData')}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-white/40" />
              </button>
            )}
            {source && (
              <a
                href={source}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 self-start text-[10px] font-bold text-white/35"
              >
                {t('trivia.source')}
                <ExternalLink size={10} />
              </a>
            )}
          </div>
        )}

        {view === 'facts' && facts[factIndex] && (
          <div className="flex flex-1 flex-col pt-4">
            <div className="flex gap-1" aria-hidden>
              {facts.map((_, index) => (
                <span
                  key={index}
                  className={`h-1 flex-1 rounded-full transition-colors duration-300 ${index <= factIndex ? 'bg-white' : 'bg-white/20'}`}
                />
              ))}
            </div>
            {/* Comme une story : toucher à droite avance, à gauche revient. */}
            <div className="relative flex flex-1 flex-col justify-center">
              <button
                aria-label={t('trivia.previous')}
                onClick={() => {
                  haptics.soft();
                  setFactIndex(Math.max(0, factIndex - 1));
                }}
                className="absolute inset-y-0 left-0 w-1/3"
              />
              <button aria-label={t('trivia.next')} onClick={nextFact} className="absolute inset-y-0 right-0 w-2/3" />
              <div key={factIndex} className="pointer-events-none animate-[fadeIn_0.4s_ease-out]">
                <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-bitter-lime">
                  <BookOpen size={12} strokeWidth={3} />
                  {t('trivia.factOf', { index: factIndex + 1, total: facts.length })}
                  {facts[factIndex].season != null && (
                    <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-white/70">
                      {t('trivia.seasonChip', { season: facts[factIndex].season! })}
                    </span>
                  )}
                </p>
                <p className="mt-5 text-[24px] font-black leading-[1.25] tracking-tight">
                  {plain(facts[factIndex].text)}
                </p>
              </div>
            </div>
            <button onClick={nextFact} className={primary}>
              {factIndex < facts.length - 1 ? (
                <>
                  {t('trivia.next')}
                  <ChevronRight size={14} strokeWidth={3} />
                </>
              ) : questions.length ? (
                <>
                  <Target size={14} strokeWidth={3} />
                  {t('trivia.toQuiz')}
                </>
              ) : (
                t('trivia.done')
              )}
            </button>
          </div>
        )}

        {view === 'quiz' && questions[quizIndex] && (
          <div className="flex flex-1 flex-col pt-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/45">
                {rounds.length > 1 && `${t('trivia.roundOf', { round: currentRound + 1, total: rounds.length })} · `}
                {t('trivia.questionOf', { index: quizIndex + 1, total: questions.length })}
              </p>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-bitter-lime">
                {t('trivia.points', { score })}
              </p>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-bitter-lime transition-[width] duration-500"
                style={{ width: `${((quizIndex + (picked != null ? 1 : 0)) / questions.length) * 100}%` }}
              />
            </div>
            {aiQuiz && (
              <p className="mt-3 rounded-xl bg-amber-400/10 px-3 py-2 text-[11px] font-bold leading-snug text-amber-200/90">
                {t('trivia.quizAi')}
              </p>
            )}
            <div key={quizIndex} className="flex flex-1 flex-col justify-center animate-[fadeIn_0.4s_ease-out]">
              <p className="text-[24px] font-black leading-[1.25] tracking-tight">{plain(questions[quizIndex].question)}</p>
              <div className="mt-6 space-y-2.5">
                {questions[quizIndex].options.map((option, index) => {
                  const right = index === questions[quizIndex].answer;
                  const answered = picked != null;
                  return (
                    <button
                      key={option}
                      disabled={answered}
                      onClick={() => {
                        setPicked(index);
                        if (right) {
                          haptics.success();
                          setScore((s) => s + 1);
                        } else {
                          haptics.medium();
                        }
                      }}
                      className={`w-full rounded-2xl px-4 py-4 text-left text-[15px] font-bold transition-all active:scale-[0.98] ${
                        !answered
                          ? 'bg-white/[0.07] text-white'
                          : right
                            ? 'scale-[1.02] bg-bitter-lime text-black'
                            : index === picked
                              ? 'bg-red-500/25 text-red-200 line-through'
                              : 'bg-white/[0.03] text-white/30'
                      }`}
                    >
                      {plain(option)}
                    </button>
                  );
                })}
              </div>
              {picked != null && (
                <p className="mt-4 text-[13px] leading-relaxed text-white/65 animate-[fadeIn_0.3s_ease-out]">
                  <span className="font-black text-white">
                    {picked === questions[quizIndex].answer ? t('trivia.right') : t('trivia.wrong')}
                  </span>{' '}
                  {plain(questions[quizIndex].explanation)}
                </p>
              )}
            </div>
            {picked != null && (
              <button
                onClick={() => {
                  haptics.soft();
                  if (quizIndex < questions.length - 1) {
                    setQuizIndex(quizIndex + 1);
                    setPicked(null);
                  } else {
                    setView('result');
                  }
                }}
                className={primary}
              >
                {quizIndex < questions.length - 1 ? t('trivia.nextQuestion') : t('trivia.seeScore')}
                <ChevronRight size={14} strokeWidth={3} />
              </button>
            )}
          </div>
        )}

        {view === 'result' && (
          <div className="flex flex-1 flex-col justify-center animate-[fadeIn_0.5s_ease-out]">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40">{title}</p>
            <p className="mt-2 text-[96px] font-black leading-none tracking-tighter text-bitter-lime tabular-nums">
              {score}
              <span className="text-[40px] text-white/30">/{questions.length}</span>
            </p>
            <p className="mt-3 text-[22px] font-black tracking-tight">{verdict}</p>
            <div className="mt-10 space-y-2">
              {nextRound ? (
                <>
                  <button onClick={relaunch} className={primary}>
                    <RotateCcw size={14} strokeWidth={2.5} />
                    {t('trivia.relaunch', { count: nextRound.length })}
                  </button>
                  <p className="pb-1 text-center text-[11px] text-white/40">
                    {t('trivia.relaunchesLeft', { count: rounds.length - 1 - currentRound })}
                  </p>
                </>
              ) : (
                <p className="pb-2 text-[13px] leading-relaxed text-white/55">{t('trivia.noMoreRounds')}</p>
              )}
              {facts.length > 0 && (
                <button
                  onClick={openFacts}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 py-3.5 text-[10px] font-black uppercase tracking-widest text-white/80 transition-transform active:scale-[0.98]"
                >
                  <BookOpen size={13} strokeWidth={2.5} />
                  {t('trivia.readFacts')}
                </button>
              )}
              <button onClick={onClose} className={`${quiet} w-full justify-center`}>
                {t('trivia.backToEpisode')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TriviaExperience;
