import React, { useEffect, useState } from 'react';
import { ChevronRight, Clapperboard, Sparkles } from 'lucide-react';
import { peekSeriesTrivia, SeriesTrivia } from '../services/seriesTrivia';
import { getEpisodeCrew } from '../services/tv';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  tmdbId: number;
  season: number;
  episode: number;
  onOpen: () => void;
}

/**
 * L'entrée de « Le saviez-vous + » pendant l'épisode.
 *
 * Qui a réalisé et écrit l'épisode s'affiche tout de suite : c'est TMDB, ça ne
 * coûte rien. Les anecdotes et le quiz, eux, passent par Mistral : le bouton
 * dit seulement ce qui est déjà prêt (un coup d'œil au cache, gratuit), et
 * c'est le geste qui lance la préparation quand il n'y a rien encore.
 */
const TriviaEntry: React.FC<Props> = ({ tmdbId, season, episode, onOpen }) => {
  const { t, language } = useLanguage();
  const [crew, setCrew] = useState<{ directors: string[]; writers: string[] } | null>(null);
  const [peek, setPeek] = useState<SeriesTrivia | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    getEpisodeCrew(tmdbId, season, episode, language === 'en' ? 'en-US' : 'fr-FR')
      .catch(() => null)
      .then((value) => active && setCrew(value));
    peekSeriesTrivia(tmdbId, season, language === 'en' ? 'en' : 'fr').then((value) => active && setPeek(value));
    return () => {
      active = false;
    };
  }, [tmdbId, season, episode, language]);

  const facts = peek?.items.filter((i) => i.type === 'fact').length ?? 0;
  const quiz = peek?.items.filter((i) => i.type === 'quiz').length ?? 0;
  const credits = [
    crew?.directors.length ? t('trivia.directedBy', { names: crew.directors.join(', ') }) : '',
    crew?.writers.length ? t('trivia.writtenBy', { names: crew.writers.join(', ') }) : '',
  ].filter(Boolean);
  // Sans compte (peek null) ou rien de montrable : seulement les crédits.
  const showEntry = peek != null && peek.status !== 'empty';

  if (!credits.length && !showEntry) return null;

  return (
    <div className="space-y-3">
      {credits.length > 0 && (
        <p className="flex items-start gap-2 text-[12px] leading-relaxed text-white/60">
          <Clapperboard size={14} className="mt-0.5 shrink-0 text-white/40" />
          <span>{credits.join(' · ')}</span>
        </p>
      )}
      {showEntry && (
        <button
          onClick={() => {
            haptics.medium();
            onOpen();
          }}
          className="group relative flex w-full items-center gap-3.5 overflow-hidden rounded-2xl border border-bitter-lime/25 bg-gradient-to-br from-bitter-lime/[0.16] via-white/[0.04] to-transparent p-4 text-left transition-transform active:scale-[0.98]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-bitter-lime text-black">
            <Sparkles size={20} strokeWidth={2.5} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-black tracking-tight text-white">{t('trivia.plus')}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-white/55">
              {peek!.status === 'ready'
                ? t('trivia.entryReady', { facts, quiz })
                : t('trivia.entryMissing')}
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-bitter-lime transition-transform group-active:translate-x-0.5" />
        </button>
      )}
    </div>
  );
};

export default TriviaEntry;
