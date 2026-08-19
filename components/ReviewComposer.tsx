import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2, CornerDownLeft } from 'lucide-react';
import { getReviewStarters, continueReview, ReviewCriterion } from '../services/ai';
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
}) => {
  const { t } = useLanguage();
  const [starters, setStarters] = useState<string[]>([]);
  const [loadingStarters, setLoadingStarters] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

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
  const latest = useRef({ criteria, rating, year, value });
  latest.current = { criteria, rating, year, value };

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
        /* 16px minimum, sinon iOS zoome à la mise au point (le viewport n'interdit
           plus la mise à l'échelle, cf. index.html). */
        className="w-full bg-white dark:bg-[#161616] border border-stone-100 dark:border-white/10 p-6 rounded-[2rem] font-medium text-base tab:max-w-[60ch] outline-none focus:border-stone-200 dark:focus:border-white/30 transition-all min-h-[120px] resize-none shadow-sm dark:text-white placeholder:text-stone-300 dark:placeholder:text-stone-700"
        placeholder={t('addMovie.reviewPlaceholder')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />

      {/* Le prolongement n'apparaît qu'une fois quelque chose écrit. C'est la
          garantie que la direction de l'avis vient toujours de son auteur :
          sans texte, il n'y a rien à prolonger, donc rien à proposer. */}
      {hasText && (
        <button
          type="button"
          onClick={handleContinue}
          disabled={continuing}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-charcoal dark:bg-white/10 text-white dark:text-stone-200 text-[10px] font-black uppercase tracking-[0.15em] active:scale-95 transition-transform disabled:opacity-50 ml-1"
        >
          {continuing ? <Loader2 size={12} className="animate-spin" /> : <CornerDownLeft size={12} />}
          {continuing ? t('review.continuing') : t('review.continue')}
        </button>
      )}

      {error && (
        <p className="text-[11px] font-semibold text-red-600 dark:text-red-400 ml-1">{error}</p>
      )}
    </div>
  );
};

export default ReviewComposer;
