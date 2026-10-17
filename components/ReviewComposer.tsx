import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2, CornerDownLeft, Mic, Square, X, Undo2 } from 'lucide-react';
import { getReviewStarters, continueReview, ReviewCriterion } from '../services/ai';
import {
  canDictate,
  startRecording,
  transcribeReview,
  DictationError,
  MAX_DICTATION_MS,
  Recording,
} from '../services/voiceReview';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  title: string;
  year?: number;
  /** Les critères tels qu'ils viennent d'être notés, quel que soit le mode. */
  criteria: ReviewCriterion[];
  rating?: number;
  value: string;
  onChange: (value: string) => void;
  /** Faux tant que la note n'est pas posée : rien à proposer avant. */
  ready: boolean;
  /** Réalisateur, acteurs… : le vocabulaire que la dictée doit savoir écrire. */
  names?: string[];
}

/**
 * La zone d'avis, avec de quoi la commencer.
 *
 * Sur 90 films notés dans l'application, un seul portait un avis écrit. Le
 * champ n'était pourtant ni caché ni compliqué : il était simplement vide, et
 * arrivait après le travail de la notation. Ce n'est pas l'envie qui manquait,
 * c'est la première phrase.
 *
 * D'où la règle qui gouverne tout ce composant : **on n'arrive jamais sur un
 * champ vide**. Les amorces sont demandées dès que la note est posée, pendant
 * qu'on fait défiler l'écran, pour être déjà là au moment où le regard s'y
 * pose. Une aide qui se charge après coup est une aide qu'on ne voit pas.
 *
 * Et la règle qui la protège : **l'IA ne peut rien écrire à partir de rien**.
 * Le bouton « continuer » n'existe pas tant que le champ est vide, les amorces
 * ne portent aucun jugement, et le prolongement s'arrête à une phrase. À chaque
 * étape il faut un geste, et la dernière phrase reste toujours à écrire.
 */
const ReviewComposer: React.FC<Props> = ({
  title,
  year,
  criteria,
  rating,
  value,
  onChange,
  ready,
  names = [],
}) => {
  const { t, language } = useLanguage();
  const [starters, setStarters] = useState<string[]>([]);
  const [loadingStarters, setLoadingStarters] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // ── Dictée ──────────────────────────────────────────────────────────────
  const [dictation, setDictation] = useState<'idle' | 'recording' | 'working'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  /** La dernière dictée posée, pour pouvoir la retirer ou revenir aux mots exacts. */
  const [lastDictation, setLastDictation] = useState<{
    before: string;
    text: string;
    raw: string;
  } | null>(null);
  const recording = useRef<Recording | null>(null);
  const dictationSupported = canDictate();

  // Une seule demande par film : sans ce garde-fou, chaque ajustement d'un
  // curseur de notation en relancerait une.
  const askedFor = useRef<string | null>(null);

  /**
   * La note est lue au départ de la requête, jamais surveillée.
   *
   * `criteria` est un tableau reconstruit à chaque rendu par l'écran de
   * notation. Le mettre en dépendance de l'effet le rendait suicidaire :
   * `setLoadingStarters(true)` provoquait un rendu, le rendu changeait
   * l'identité du tableau, l'effet se nettoyait, et la requête en vol était
   * annulée par le rendu qu'elle venait elle-même de déclencher. Le drapeau de
   * chargement ne redescendait jamais — d'où les amorces qui tournaient sans
   * fin alors que le serveur avait répondu en une seconde.
   */
  const latest = useRef({ criteria, rating, year, value, onChange });
  latest.current = { criteria, rating, year, value, onChange };

  /** Identifie la requête en cours, pour qu'une ancienne n'éteigne pas la neuve. */
  const requestId = useRef(0);

  const fetchStarters = () => {
    const snapshot = latest.current;
    if (!title.trim() || snapshot.criteria.length === 0) return;

    askedFor.current = title;
    const id = ++requestId.current;
    setLoadingStarters(true);

    getReviewStarters(title, snapshot.criteria, snapshot.rating, snapshot.year)
      .then((result) => {
        if (requestId.current === id) setStarters(result);
      })
      .finally(() => {
        if (requestId.current === id) setLoadingStarters(false);
      });
  };

  useEffect(() => {
    if (!ready || !title.trim()) return;
    if (askedFor.current === title) return;

    // Rien à amorcer quand l'avis existe déjà : on rouvre une fiche pour la
    // corriger, pas pour la recommencer. Cela évite aussi un appel payé pour
    // des propositions que l'écran n'affichera pas.
    if (latest.current.value.trim()) return;

    fetchStarters();
  }, [ready, title]);

  /** Le curseur va à la fin : on vient d'ouvrir une phrase, pas de la relire. */
  const focusEnd = () => {
    requestAnimationFrame(() => {
      const area = areaRef.current;
      if (!area) return;
      area.focus();
      area.setSelectionRange(area.value.length, area.value.length);
    });
  };

  const handleStarter = (starter: string) => {
    haptics.soft();
    setError(null);
    onChange(`${starter} `);
    focusEnd();
  };

  const handleContinue = async () => {
    if (continuing || !value.trim()) return;
    haptics.soft();
    setError(null);
    setContinuing(true);
    try {
      const sentence = await continueReview(title, criteria, value, rating, year);
      if (sentence) {
        const separator = /\s$/.test(value) ? '' : ' ';
        onChange(`${value}${separator}${sentence} `);
        haptics.success();
        focusEnd();
      }
    } catch (e: any) {
      setError(e?.message || t('review.continueFailed'));
    } finally {
      setContinuing(false);
    }
  };

  /** Le micro est rendu si l'écran se ferme en pleine dictée. */
  useEffect(() => () => recording.current?.cancel(), []);

  useEffect(() => {
    if (dictation !== 'recording') return;
    const startedAt = Date.now();
    let frame = 0;
    const tick = () => {
      setElapsed(Date.now() - startedAt);
      setLevel(recording.current?.level() ?? 0);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [dictation]);

  const dictationMessage = (e: unknown) => {
    if (e instanceof DictationError) {
      if (e.code === 'denied') return t('review.dictateDenied');
      if (e.code === 'no_mic') return t('review.dictateNoMic');
      if (e.code === 'empty') return t('review.dictateEmpty');
      if (e.message && e.message !== e.code) return e.message;
    }
    return t('review.dictateFailed');
  };

  const stopDictation = async () => {
    const current = recording.current;
    if (!current) return;
    recording.current = null;
    haptics.soft();
    setDictation('working');
    try {
      const audio = await current.stop();
      if (!audio) throw new DictationError('empty');
      const result = await transcribeReview(
        audio,
        [title, ...names],
        language === 'en' ? 'en' : 'fr'
      );
      // La valeur est relue maintenant : on a pu taper pendant la transcription.
      const before = latest.current.value;
      const separator = before.trim() && !/\s$/.test(before) ? ' ' : '';
      latest.current.onChange(`${before}${separator}${result.text} `);
      // « Mots exacts » n'a de sens que si la mise au propre a changé quelque chose.
      setLastDictation({
        before,
        text: result.text,
        raw: result.polished && result.raw !== result.text ? result.raw : '',
      });
      haptics.success();
      focusEnd();
    } catch (e) {
      setError(dictationMessage(e));
    } finally {
      setDictation('idle');
    }
  };

  const startDictation = async () => {
    if (dictation !== 'idle') return;
    haptics.soft();
    setError(null);
    setLastDictation(null);
    try {
      recording.current = await startRecording(() => stopDictation());
      setElapsed(0);
      setDictation('recording');
    } catch (e) {
      setError(dictationMessage(e));
    }
  };

  const cancelDictation = () => {
    recording.current?.cancel();
    recording.current = null;
    setDictation('idle');
  };

  const undoDictation = () => {
    if (!lastDictation) return;
    haptics.soft();
    onChange(lastDictation.before);
    setLastDictation(null);
  };

  /** Revenir à ce que Voxtral a entendu, quand la mise au propre a trop lissé. */
  const keepRawDictation = () => {
    if (!lastDictation?.raw) return;
    haptics.soft();
    const separator = lastDictation.before.trim() && !/\s$/.test(lastDictation.before) ? ' ' : '';
    onChange(`${lastDictation.before}${separator}${lastDictation.raw} `);
    setLastDictation(null);
    focusEnd();
  };

  const clock = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  };

  const hasText = value.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="ml-1">
        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600 block">
          {t('addMovie.myReview')}
        </label>
        {/* Dire à quoi sert l'avis vaut mieux que demander de l'écrire : on
            n'écrit pas pour un champ, on écrit pour quelqu'un. */}
        <p className="text-[11px] font-medium text-stone-400 dark:text-stone-600 mt-1">
          {t('review.purpose')}
        </p>
      </div>

      {/* Les amorces disparaissent dès qu'il y a du texte : elles servaient à
          démarrer, les garder ensuite reviendrait à proposer de recommencer. */}
      {!hasText && ready && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600 ml-1">
            <Sparkles size={11} />
            {t('review.startersHint')}
          </p>

          {loadingStarters ? (
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-8 rounded-full bg-stone-100 dark:bg-white/5 animate-pulse"
                  style={{ width: `${38 + i * 14}%` }}
                />
              ))}
            </div>
          ) : starters.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {starters.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => handleStarter(starter)}
                  className="px-3.5 py-2 rounded-full bg-white dark:bg-[#161616] border border-stone-200 dark:border-white/10 text-[12px] font-semibold text-charcoal dark:text-stone-200 active:scale-95 transition-transform text-left"
                >
                  {starter}
                  <span className="text-stone-300 dark:text-stone-700">…</span>
                </button>
              ))}
            </div>
          ) : (
            /* Le chargement automatique peut ne rien rendre : réseau coupé,
               quota atteint, ou simplement une fiche rouverte plus tard. Sans
               ce bouton, l'absence de propositions serait indiscernable d'une
               fonctionnalité absente — et il n'y aurait aucun moyen de
               redemander. Une aide invisible ne vaut pas mieux que rien. */
            <button
              type="button"
              onClick={() => {
                haptics.soft();
                fetchStarters();
              }}
              className="px-4 py-2.5 rounded-full bg-white dark:bg-[#161616] border border-dashed border-stone-300 dark:border-white/15 text-[12px] font-semibold text-stone-500 dark:text-stone-400 active:scale-95 transition-transform"
            >
              {t('review.askStarters')}
            </button>
          )}
        </div>
      )}

      <textarea
        ref={areaRef}
        className="w-full bg-white dark:bg-[#161616] border border-stone-100 dark:border-white/10 p-6 rounded-[2rem] font-medium text-sm outline-none focus:border-stone-200 dark:focus:border-white/30 transition-all min-h-[120px] resize-none shadow-sm dark:text-white placeholder:text-stone-300 dark:placeholder:text-stone-700"
        placeholder={t('addMovie.reviewPlaceholder')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />

      {dictation === 'recording' ? (
        /* Pendant la dictée, rien d'autre à faire que parler : le panneau
           remplace les boutons. Le niveau montre que le micro entend, le
           chrono que la limite approche. */
        <div className="space-y-2">
          <div className="flex items-center gap-2.5 p-2 pl-4 rounded-full bg-charcoal dark:bg-white/10 text-white">
            <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            <div
              className="flex-1 min-w-0 flex items-center gap-[3px] h-6 overflow-hidden"
              aria-hidden="true"
            >
              {[0.35, 0.6, 0.85, 1, 0.75, 0.5, 0.9, 0.65, 0.4, 0.7, 1, 0.55].map((weight, i) => (
                <span
                  key={i}
                  className="w-[3px] shrink-0 rounded-full bg-bitter-lime transition-[height] duration-75"
                  style={{ height: `${Math.max(12, Math.min(100, level * weight * 150))}%` }}
                />
              ))}
            </div>
            <span className="text-[11px] font-black tabular-nums text-stone-400 shrink-0">
              {clock(elapsed)}
            </span>
            <button
              type="button"
              onClick={cancelDictation}
              aria-label={t('review.dictateCancel')}
              className="h-9 w-9 shrink-0 flex items-center justify-center rounded-full bg-white/10 active:scale-90 transition-transform"
            >
              <X size={15} />
            </button>
            <button
              type="button"
              onClick={stopDictation}
              className="h-9 shrink-0 flex items-center gap-1.5 px-4 rounded-full bg-bitter-lime text-charcoal text-[10px] font-black uppercase tracking-[0.15em] active:scale-95 transition-transform"
            >
              <Square size={10} fill="currentColor" />
              {t('review.dictateStop')}
            </button>
          </div>
          <p
            className="text-[11px] font-medium text-stone-400 dark:text-stone-500 ml-4"
            aria-live="polite"
          >
            {t('review.dictateListening')}{' '}
            <span className="tabular-nums">({clock(MAX_DICTATION_MS)} max)</span>
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 ml-1">
          {/* La dictée est une autre façon de commencer, pas une aide de plus :
              ce qui est écrit vient de la voix de son auteur, mis au propre
              sans rien y ajouter. Elle est donc offerte même sur un champ vide. */}
          {dictationSupported && (
            <button
              type="button"
              onClick={startDictation}
              disabled={dictation === 'working' || continuing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-bitter-lime text-charcoal text-[10px] font-black uppercase tracking-[0.15em] active:scale-95 transition-transform disabled:opacity-60"
            >
              {dictation === 'working' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Mic size={12} />
              )}
              {dictation === 'working'
                ? t('review.dictateWorking')
                : hasText
                  ? t('review.dictateMore')
                  : t('review.dictate')}
            </button>
          )}

          {/* Le prolongement n'apparaît qu'une fois quelque chose écrit. C'est la
              garantie que la direction de l'avis vient toujours de son auteur :
              sans texte, il n'y a rien à prolonger, donc rien à proposer. */}
          {hasText && dictation === 'idle' && (
            <button
              type="button"
              onClick={handleContinue}
              disabled={continuing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-charcoal dark:bg-white/10 text-white dark:text-stone-200 text-[10px] font-black uppercase tracking-[0.15em] active:scale-95 transition-transform disabled:opacity-50"
            >
              {continuing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <CornerDownLeft size={12} />
              )}
              {continuing ? t('review.continuing') : t('review.continue')}
            </button>
          )}
        </div>
      )}

      {/* Juste après une dictée : de quoi la défaire, ou revenir aux mots
          exacts si la mise au propre a trop lissé. Disparaît à la suivante. */}
      {lastDictation && dictation === 'idle' && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 ml-2">
          <button
            type="button"
            onClick={undoDictation}
            className="flex items-center gap-1 text-[11px] font-semibold text-stone-400 dark:text-stone-500 underline-offset-2 hover:underline"
          >
            <Undo2 size={11} />
            {t('review.dictateUndo')}
          </button>
          {lastDictation.raw && (
            <button
              type="button"
              onClick={keepRawDictation}
              className="text-[11px] font-semibold text-stone-400 dark:text-stone-500 underline-offset-2 hover:underline"
            >
              {t('review.dictateRaw')}
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="text-[11px] font-semibold text-red-600 dark:text-red-400 ml-1">{error}</p>
      )}
    </div>
  );
};

export default ReviewComposer;
