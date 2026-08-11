import React, { useState } from 'react';
import { Sparkles, ArrowRight, Loader2, X } from 'lucide-react';
import { interpretDiscoverQuery, buildDiscoverUrl } from '../services/ai';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  favoriteGenres?: string[];
  /** Les films trouvés, plus le résumé de ce qui a été compris. */
  onResults: (items: any[], summary: string) => void;
  onClear: () => void;
  /** Non nul quand une envie est en cours d'affichage. */
  activeSummary: string | null;
}

/**
 * Chercher un film en le décrivant plutôt qu'en le filtrant.
 *
 * Les filtres existent déjà — genre, durée, période, plateforme — mais sur un
 * téléphone personne n'ouvre six menus pour décider d'une soirée. Une phrase
 * les remplace tous.
 *
 * Ce qui rend cette fonction sûre, et différente d'un assistant : le modèle ne
 * choisit aucun film. Il ne produit que des critères, et c'est TMDB qui répond.
 * Rien ne peut donc être inventé — le pire cas est un contresens, et il se voit
 * aussitôt puisque l'écran affiche ce qui a été compris.
 */
const MoodSearch: React.FC<Props> = ({ favoriteGenres, onResults, onClear, activeSummary }) => {
  const { t } = useLanguage();
  const [phrase, setPhrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const examples = [
    t('mood.example1'),
    t('mood.example2'),
    t('mood.example3'),
  ];

  const run = async (text: string) => {
    const wanted = text.trim();
    if (!wanted || loading) return;

    haptics.medium();
    setError(null);
    setLoading(true);
    try {
      const filters = await interpretDiscoverQuery(wanted, favoriteGenres);
      const response = await fetch(buildDiscoverUrl(filters));
      const data = await response.json();
      const items = (data.results || []).filter((m: any) => m.poster_path);

      if (items.length === 0) {
        // Des critères trop serrés ne rendent rien. Le dire vaut mieux qu'une
        // grille vide, qui ferait croire à une panne.
        setError(t('mood.nothingFound'));
        return;
      }

      onResults(items, filters.summary);
      haptics.success();
    } catch (e: any) {
      setError(e?.message || t('mood.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-stone-300 dark:text-stone-700">
          <Sparkles size={18} strokeWidth={2.5} />
        </div>
        <input
          type="text"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') run(phrase);
          }}
          placeholder={t('mood.placeholder')}
          className="w-full bg-stone-100/50 dark:bg-[#161616] focus:bg-white dark:focus:bg-[#1a1a1a] border-2 border-transparent focus:border-stone-200 dark:focus:border-white/10 rounded-[2rem] py-5 pl-14 pr-16 text-sm font-semibold outline-none transition-all shadow-sm placeholder:text-stone-300 dark:placeholder:text-stone-700 text-charcoal dark:text-white"
        />
        <button
          type="button"
          onClick={() => run(phrase)}
          disabled={loading || !phrase.trim()}
          aria-label={t('mood.go')}
          className="absolute inset-y-0 right-3 my-auto w-11 h-11 rounded-full bg-charcoal dark:bg-bitter-lime text-white dark:text-charcoal flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} strokeWidth={3} />}
        </button>
      </div>

      {/* Un champ vide n'appelle personne. Trois exemples suffisent à montrer
          qu'on peut écrire une phrase plutôt que taper un titre. */}
      {!activeSummary && !phrase && (
        <div className="flex flex-wrap gap-2">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setPhrase(example);
                run(example);
              }}
              className="px-3.5 py-2 rounded-full bg-white dark:bg-[#161616] border border-stone-200 dark:border-white/10 text-[11px] font-semibold text-stone-500 dark:text-stone-400 active:scale-95 transition-transform"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      {/* Ce qui a été retenu, en clair. Sans ça, l'écran changerait de contenu
          sans qu'on sache pourquoi — et un contresens passerait inaperçu. */}
      {activeSummary && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-charcoal dark:bg-[#1a1a1a] border border-transparent dark:border-white/10">
          <Sparkles size={12} className="text-white dark:text-bitter-lime shrink-0" />
          <span className="flex-1 text-[11px] font-bold text-white dark:text-stone-200 truncate">
            {activeSummary}
          </span>
          <button
            type="button"
            onClick={() => {
              haptics.soft();
              setPhrase('');
              onClear();
            }}
            aria-label={t('common.close')}
            className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center text-white active:scale-90 transition-transform shrink-0"
          >
            <X size={12} strokeWidth={3} />
          </button>
        </div>
      )}

      {error && (
        <p className="text-[11px] font-semibold text-red-600 dark:text-red-400 ml-1">{error}</p>
      )}
    </div>
  );
};

export default MoodSearch;
