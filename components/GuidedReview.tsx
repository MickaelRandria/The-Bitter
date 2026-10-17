import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Check, Mic, Square, X, Loader2, AlignCenter, Keyboard } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { guidedQuestions, compareTightened, GuidedCriterion } from '../utils/guidedReview';
import {
  startRecording,
  transcribeReview,
  assembleReview,
  tightenReview,
  DictationError,
  MAX_DICTATION_MS,
  Recording,
  ReviewSession,
} from '../services/voiceReview';

interface Props {
  title: string;
  names: string[];
  criteria: GuidedCriterion[];
  rating?: number;
  /** Partagée avec le composeur : un avis = une question du jour. */
  session: ReviewSession;
  canRecord: boolean;
  onUse: (text: string) => void;
  onClose: () => void;
}

type Capture = 'idle' | 'recording' | 'working' | 'typing';

const clock = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

/**
 * L'avis guidé : trois questions tirées de la note, une réponse à la voix pour
 * chacune, puis un seul texte.
 *
 * Proposé à côté de l'écriture libre, jamais à sa place. Les questions viennent
 * de `guidedQuestions` (calculées, sans modèle) ; le texte final est fait des
 * réponses, reliées sans idée ajoutée. « Resserrer » coupe, et montre ce qu'il
 * a coupé : on ne publie pas sous son nom un texte qu'on n'a pas pu vérifier.
 */
const GuidedReview: React.FC<Props> = ({
  title,
  names,
  criteria,
  rating,
  session,
  canRecord,
  onUse,
  onClose,
}) => {
  const { t, language } = useLanguage();
  const lang = language === 'en' ? 'en' : 'fr';
  const questions = useMemo(
    () => guidedQuestions(criteria, rating, lang),
    [criteria, rating, lang]
  );
  const prompts = questions.map((q) => t(q.key, q.params));
  const terms = useMemo(() => [title, ...names], [title, names]);

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ''));
  const [capture, setCapture] = useState<Capture>(canRecord ? 'idle' : 'typing');
  const [draft, setDraft] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recording = useRef<Recording | null>(null);

  // Résultat.
  const [full, setFull] = useState('');
  const [tight, setTight] = useState('');
  const [showTight, setShowTight] = useState(false);
  const [busy, setBusy] = useState<'assemble' | 'tighten' | null>(null);
  const [picking, setPicking] = useState(false);
  const finished = step >= questions.length;

  useEffect(() => () => recording.current?.cancel(), []);

  useEffect(() => {
    if (capture !== 'recording') return;
    const startedAt = Date.now();
    let frame = 0;
    const tick = () => {
      setElapsed(Date.now() - startedAt);
      setLevel(recording.current?.level() ?? 0);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [capture]);

  const message = (e: unknown) => {
    if (e instanceof DictationError) {
      if (e.code === 'denied') return t('review.dictateDenied');
      if (e.code === 'no_mic') return t('review.dictateNoMic');
      if (e.code === 'empty') return t('review.dictateEmpty');
      if (e.message && e.message !== e.code) return e.message;
    }
    return t('review.dictateFailed');
  };

  /** Passe à la question suivante ; après la dernière, assemble l'avis. */
  const advance = (nextAnswers: string[], from: number) => {
    setDraft('');
    setCapture(canRecord ? 'idle' : 'typing');
    // On saute les questions déjà répondues, quand on revient en refaire une.
    let next = from + 1;
    while (next < questions.length && nextAnswers[next].trim()) next++;
    setStep(next);
    if (next >= questions.length) assemble(nextAnswers);
  };

  const commit = (text: string) => {
    const next = answers.map((answer, i) => (i === step ? text.trim() : answer));
    setAnswers(next);
    haptics.success();
    advance(next, step);
  };

  const startAnswer = async () => {
    haptics.soft();
    setError(null);
    try {
      recording.current = await startRecording(() => stopAnswer());
      setElapsed(0);
      setCapture('recording');
    } catch (e) {
      setError(message(e));
    }
  };

  const stopAnswer = async () => {
    const current = recording.current;
    if (!current) return;
    recording.current = null;
    haptics.soft();
    setCapture('working');
    try {
      const audio = await current.stop();
      if (!audio) throw new DictationError('empty');
      const result = await transcribeReview(audio, terms, lang, session);
      commit(result.text);
    } catch (e) {
      setError(message(e));
      setCapture('idle');
    }
  };

  const cancelAnswer = () => {
    recording.current?.cancel();
    recording.current = null;
    setCapture('idle');
  };

  const skip = () => {
    haptics.soft();
    setError(null);
    advance(answers, step);
  };

  const assemble = async (list: string[]) => {
    const filled = list
      .map((text, i) => ({ question: prompts[i], text: text.trim() }))
      .filter((answer) => answer.text);
    setTight('');
    setShowTight(false);
    if (filled.length === 0) return setFull('');
    setBusy('assemble');
    setError(null);
    try {
      setFull(await assembleReview(filled, terms, lang, session));
    } catch (e) {
      // Rien de perdu : les réponses mises bout à bout restent un avis.
      setFull(filled.map((answer) => answer.text).join(' '));
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  const tighten = async () => {
    if (!full.trim()) return;
    haptics.soft();
    setBusy('tighten');
    setError(null);
    try {
      setTight(await tightenReview(full, terms, lang, session));
      setShowTight(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  const redo = (index: number) => {
    haptics.soft();
    setError(null);
    setAnswers((prev) => prev.map((answer, i) => (i === index ? '' : answer)));
    setDraft(answers[index]);
    setCapture(canRecord ? 'idle' : 'typing');
    setStep(index);
  };

  const back = () => {
    if (capture === 'recording') cancelAnswer();
    if (step === 0) return onClose();
    setError(null);
    setStep((s) => Math.min(s, questions.length) - 1);
  };

  const comparison = useMemo(() => (tight ? compareTightened(full, tight) : null), [full, tight]);
  const shown = showTight && tight ? tight : full;

  const question = questions[Math.min(step, questions.length - 1)];
  const chipTone = {
    low: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300',
    high: 'bg-charcoal text-bitter-lime dark:bg-white/10',
    neutral:
      'bg-white border border-stone-200 dark:bg-white/5 dark:border-white/10 dark:text-stone-200',
  } as const;

  const linkButton =
    'h-11 px-2 text-[12px] font-bold text-stone-600 dark:text-stone-400 underline underline-offset-[3px]';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('guided.title')}
      className="fixed inset-0 z-[200] flex flex-col bg-[#FAF9F6] dark:bg-[#0c0c0c] text-charcoal dark:text-white"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="max-w-md w-full mx-auto flex flex-col flex-1 min-h-0">
        <div className="flex items-center gap-3 px-6 pt-6 pb-3">
          <button
            type="button"
            onClick={back}
            aria-label={t('guided.back')}
            className="h-11 w-11 shrink-0 rounded-full bg-[#EFEDE8] dark:bg-white/10 flex items-center justify-center active:scale-90 transition-transform"
          >
            <ChevronLeft size={18} />
          </button>
          <div
            className="flex-1 flex gap-1.5"
            aria-label={t('guided.progress', {
              n: Math.min(step + 1, questions.length),
              total: questions.length,
            })}
          >
            {questions.map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-1 rounded-full ${i <= step ? 'bg-charcoal dark:bg-white' : 'bg-stone-200 dark:bg-white/10'}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('guided.close')}
            className="h-11 w-11 shrink-0 rounded-full bg-[#EFEDE8] dark:bg-white/10 flex items-center justify-center active:scale-90 transition-transform"
          >
            <X size={16} />
          </button>
        </div>

        {!finished ? (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-3 space-y-5">
              {/* La réponse précédente reste sous les yeux : on enchaîne mieux
                  quand on voit ce qu'on vient de dire. */}
              {step > 0 && answers[step - 1] && (
                <div className="p-4 rounded-[20px] bg-white dark:bg-[#161616] border border-stone-100 dark:border-white/10 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">
                      <Check size={11} className="text-green-600" strokeWidth={3} />
                      {t('guided.answered', { n: step })}
                    </p>
                    <button
                      type="button"
                      onClick={() => redo(step - 1)}
                      className="h-8 px-1 text-[11px] font-bold text-stone-600 dark:text-stone-400 underline underline-offset-[3px]"
                    >
                      {t('guided.redo')}
                    </button>
                  </div>
                  <p className="text-[14px] font-medium leading-relaxed">{answers[step - 1]}</p>
                </div>
              )}

              <div className="px-1 space-y-4 pt-2">
                {question.chips.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {question.chips.map((chip) => (
                      <span
                        key={chip.label}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold ${chipTone[chip.tone]}`}
                      >
                        {chip.label} · {chip.value}
                      </span>
                    ))}
                  </div>
                )}
                <h2 className="text-[28px] font-black leading-[1.12] tracking-tight">
                  {prompts[step]}
                </h2>
                <p className="text-[13px] font-medium text-stone-500 dark:text-stone-400 leading-relaxed">
                  {t(question.hintKey)}
                </p>
              </div>

              {capture === 'typing' && (
                <div className="space-y-3">
                  <textarea
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={4}
                    placeholder={t('guided.typePlaceholder')}
                    className="w-full bg-white dark:bg-[#161616] border border-stone-100 dark:border-white/10 p-5 rounded-[1.5rem] text-sm font-medium outline-none focus:border-stone-300 dark:focus:border-white/30 resize-none"
                  />
                  <button
                    type="button"
                    disabled={!draft.trim()}
                    onClick={() => commit(draft)}
                    className="h-11 px-5 rounded-full bg-charcoal dark:bg-white text-white dark:text-charcoal text-[10px] font-black uppercase tracking-[0.15em] disabled:opacity-40 active:scale-95 transition-transform"
                  >
                    {t('guided.next')}
                  </button>
                </div>
              )}

              {error && (
                <p className="text-[12px] font-semibold text-red-600 dark:text-red-400 px-1">
                  {error}
                </p>
              )}
            </div>

            <div className="px-6 pb-8 pt-4 flex flex-col items-center gap-3">
              {capture === 'recording' && (
                <>
                  <div className="flex items-center gap-1 h-11" aria-hidden="true">
                    {[0.3, 0.6, 0.85, 0.5, 1, 0.7, 0.4, 0.8, 0.55, 0.3, 0.65, 0.45].map(
                      (weight, i) => (
                        <span
                          key={i}
                          className="w-1 rounded-full bg-charcoal dark:bg-bitter-lime transition-[height] duration-75"
                          style={{
                            height: `${Math.max(12, Math.min(100, level * weight * 150))}%`,
                          }}
                        />
                      )
                    )}
                  </div>
                  <p
                    className="text-[13px] font-extrabold text-stone-600 dark:text-stone-400 tabular-nums"
                    aria-live="polite"
                  >
                    <span className="inline-block w-2 h-2 rounded-full bg-red-600 mr-2 animate-pulse" />
                    {clock(elapsed)}{' '}
                    <span className="text-stone-400 dark:text-stone-600">
                      / {clock(MAX_DICTATION_MS)}
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={stopAnswer}
                    aria-label={t('guided.stop')}
                    className="h-[104px] w-[104px] rounded-full bg-bitter-lime ring-[10px] ring-bitter-lime/30 flex items-center justify-center active:scale-95 transition-transform"
                  >
                    <Square size={24} fill="#1A1A1A" className="text-charcoal" />
                  </button>
                  <button type="button" onClick={cancelAnswer} className={linkButton}>
                    {t('review.dictateCancel')}
                  </button>
                </>
              )}

              {capture === 'working' && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <Loader2 size={28} className="animate-spin text-stone-400" />
                  <p className="text-[12px] font-bold text-stone-500">
                    {t('review.dictateWorking')}
                  </p>
                </div>
              )}

              {capture === 'idle' && (
                <>
                  <button
                    type="button"
                    onClick={startAnswer}
                    aria-label={t('guided.speak')}
                    className="h-24 w-24 rounded-full bg-bitter-lime text-charcoal flex items-center justify-center active:scale-95 transition-transform"
                  >
                    <Mic size={32} strokeWidth={2.2} />
                  </button>
                  <p className="text-[11px] font-black uppercase tracking-[0.16em]">
                    {t('guided.speak')}
                  </p>
                </>
              )}

              {(capture === 'idle' || capture === 'typing') && (
                <div className="flex gap-6">
                  {capture === 'idle' ? (
                    <button
                      type="button"
                      onClick={() => setCapture('typing')}
                      className={`${linkButton} flex items-center gap-1.5`}
                    >
                      <Keyboard size={13} />
                      {t('guided.type')}
                    </button>
                  ) : (
                    canRecord && (
                      <button
                        type="button"
                        onClick={() => setCapture('idle')}
                        className={`${linkButton} flex items-center gap-1.5`}
                      >
                        <Mic size={13} />
                        {t('guided.speakInstead')}
                      </button>
                    )
                  )}
                  <button type="button" onClick={skip} className={linkButton}>
                    {t('guided.skip')}
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-3 space-y-4">
              <h2 className="px-1 text-[26px] font-black tracking-tight">
                {t('guided.resultTitle')}
              </h2>

              {busy === 'assemble' ? (
                <div className="p-6 rounded-[26px] bg-white dark:bg-[#161616] border border-stone-100 dark:border-white/10 space-y-3">
                  <p className="flex items-center gap-2 text-[12px] font-bold text-stone-500">
                    <Loader2 size={14} className="animate-spin" />
                    {t('guided.assembling')}
                  </p>
                  {[90, 100, 70].map((w) => (
                    <span
                      key={w}
                      className="block h-3 rounded-full bg-stone-100 dark:bg-white/5 animate-pulse"
                      style={{ width: `${w}%` }}
                    />
                  ))}
                </div>
              ) : !full.trim() ? (
                <p className="px-1 text-[14px] font-medium text-stone-500">{t('guided.nothing')}</p>
              ) : (
                <>
                  {tight && (
                    <div
                      role="group"
                      aria-label={t('guided.versionLabel')}
                      className="flex p-1 rounded-full bg-[#EFEDE8] dark:bg-white/10"
                    >
                      {[
                        { on: true, label: t('guided.versionTight', { n: countWords(tight) }) },
                        { on: false, label: t('guided.versionFull', { n: countWords(full) }) },
                      ].map((option) => (
                        <button
                          key={String(option.on)}
                          type="button"
                          aria-pressed={showTight === option.on}
                          onClick={() => setShowTight(option.on)}
                          className={`flex-1 h-10 rounded-full text-[11px] font-black tracking-wide ${showTight === option.on ? 'bg-white dark:bg-[#222] shadow-sm' : 'text-stone-500'}`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Un seul texte, modifiable : c'est le sien, il a le dernier mot. */}
                  <div className="rounded-[26px] bg-white dark:bg-[#161616] border border-stone-100 dark:border-white/10 overflow-hidden">
                    <textarea
                      value={shown}
                      onChange={(e) =>
                        showTight && tight ? setTight(e.target.value) : setFull(e.target.value)
                      }
                      rows={Math.min(
                        14,
                        Math.max(
                          5,
                          Math.ceil(shown.length / 38) + (shown.match(/\n/g)?.length ?? 0)
                        )
                      )}
                      aria-label={t('guided.resultTitle')}
                      className="w-full bg-transparent p-5 text-[15px] font-medium leading-relaxed outline-none resize-none"
                    />
                    <p className="px-5 pb-4 pt-0 text-[11px] font-semibold text-stone-500">
                      {t('guided.wordCount', { n: countWords(shown) })}
                    </p>
                  </div>

                  {showTight &&
                    comparison &&
                    (comparison.removed.length > 0 || comparison.added.length > 0) && (
                      <div className="p-4 rounded-[20px] border border-dashed border-stone-300 dark:border-white/15 space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">
                          {t('guided.cut')}
                        </p>
                        {comparison.removed.map((passage, i) => (
                          <p
                            key={i}
                            className="text-[12px] font-medium leading-snug text-stone-500 line-through"
                          >
                            {passage}
                          </p>
                        ))}
                        <p className="pt-1 text-[11px] font-semibold text-stone-600 dark:text-stone-400">
                          {comparison.added.length === 0
                            ? t('guided.nothingAdded')
                            : t('guided.addedOnly', {
                                words: comparison.added.map((w) => `« ${w} »`).join(', '),
                              })}
                        </p>
                      </div>
                    )}

                  {!showTight && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={tighten}
                        disabled={busy !== null || countWords(full) < 25}
                        className="h-11 px-5 rounded-full bg-bitter-lime text-charcoal text-[10px] font-black uppercase tracking-[0.15em] flex items-center gap-2 disabled:opacity-40 active:scale-95 transition-transform"
                      >
                        {busy === 'tighten' ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <AlignCenter size={13} />
                        )}
                        {busy === 'tighten' ? t('guided.tightening') : t('guided.tighten')}
                      </button>
                      <button
                        type="button"
                        aria-expanded={picking}
                        onClick={() => setPicking((p) => !p)}
                        className="h-11 px-5 rounded-full bg-white dark:bg-white/5 border border-stone-200 dark:border-white/10 text-[10px] font-black uppercase tracking-[0.15em] active:scale-95 transition-transform"
                      >
                        {t('guided.redoAnswers')}
                      </button>
                    </div>
                  )}

                  {!showTight && picking && (
                    <div className="space-y-2">
                      {prompts.map((prompt, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setPicking(false);
                            redo(i);
                          }}
                          className="w-full min-h-11 px-4 py-3 rounded-2xl bg-white dark:bg-[#161616] border border-stone-100 dark:border-white/10 text-left text-[12px] font-semibold active:scale-[0.99] transition-transform"
                        >
                          <span className="text-stone-400 mr-2">{i + 1}.</span>
                          {prompt}
                          {!answers[i] && (
                            <span className="ml-2 text-stone-400">({t('guided.skipped')})</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {error && (
                <p className="text-[12px] font-semibold text-red-600 dark:text-red-400 px-1">
                  {error}
                </p>
              )}
            </div>

            <div className="px-5 pb-7 pt-4 space-y-2">
              <button
                type="button"
                disabled={!shown.trim() || busy !== null}
                onClick={() => {
                  haptics.success();
                  onUse(shown.trim());
                }}
                className="w-full h-14 rounded-full bg-charcoal dark:bg-white text-white dark:text-charcoal text-[11px] font-black uppercase tracking-[0.18em] disabled:opacity-40 active:scale-[0.98] transition-transform"
              >
                {showTight && tight ? t('guided.useTight') : t('guided.use')}
              </button>
              {showTight && tight && (
                <button
                  type="button"
                  onClick={() => setShowTight(false)}
                  className={`w-full ${linkButton}`}
                >
                  {t('guided.backToFull')}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

export default GuidedReview;
