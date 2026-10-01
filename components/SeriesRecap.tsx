import React, { useEffect, useState } from 'react';
import { History, Loader2, X } from 'lucide-react';
import { Movie } from '../types';
import { TmdbSeasonSummary } from '../services/tmdb';
import { buildRecapSource, getRecap, SeriesRecapResult } from '../services/seriesRecap';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { useDialog } from '../utils/useDialog';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  series: Movie;
  seasons: TmdbSeasonSummary[];
  onClose: () => void;
}

/**
 * « Précédemment dans… », pour reprendre une série sans tout revoir.
 *
 * Deux niveaux : le récap rédigé quand l'assistant est joignable, sinon les
 * résumés des derniers épisodes vus, tels quels. Les deux s'arrêtent au dernier
 * épisode vu — voir services/seriesRecap.ts.
 */
const SeriesRecap: React.FC<Props> = ({ series, seasons, onClose }) => {
  const { t, language } = useLanguage();
  const dialog = useDialog(onClose, t('recap.title', { title: series.title }));
  const [result, setResult] = useState<SeriesRecapResult | null | undefined>(undefined);

  useEffect(() => {
    if (series.tmdbId == null) {
      setResult(null);
      return;
    }
    let active = true;
    getRecap(
      { tmdbId: series.tmdbId, title: series.title, progress: series.tvProgress },
      seasons,
      language === 'fr' ? 'fr-FR' : 'en-US'
    )
      .catch(() => null)
      .then((value) => {
        if (active) setResult(value);
      });
    return () => {
      active = false;
    };
  }, [series.tmdbId, series.title, series.tvProgress, seasons, language]);

  /* Le générique : les images des derniers épisodes vus, sans attendre le
     récap rédigé, qui peut prendre quelques secondes. */
  const [stills, setStills] = useState<{ label: string; url: string }[]>([]);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (series.tmdbId == null) return;
    let active = true;
    buildRecapSource(series.tmdbId, series.tvProgress, seasons, language === 'fr' ? 'fr-FR' : 'en-US')
      .catch(() => null)
      .then((source) => {
        if (active && source) setStills(source.stills);
      });
    return () => {
      active = false;
    };
  }, [series.tmdbId, series.tvProgress, seasons, language]);

  useEffect(() => {
    if (stills.length < 2) return;
    const timer = window.setInterval(() => setSlide((n) => (n + 1) % stills.length), 3800);
    return () => window.clearInterval(timer);
  }, [stills.length]);

  const seen = result?.source.lastSeen;
  const fallback = result
    ? [...result.source.seasons.slice(-1), ...result.source.episodes.slice(-3)]
    : [];

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-charcoal/60 dark:bg-black/85 backdrop-blur-sm animate-[fadeIn_0.25s_ease-out]"
    >
      <div className="relative w-full sm:max-w-md bg-cream dark:bg-[#0c0c0c] rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-[slideUp_0.35s_cubic-bezier(0.16,1,0.3,1)] border-t border-white/20 dark:border-white/10">
        <div className="relative shrink-0">
          {stills.length > 0 ? (
            <div className="relative h-56 overflow-hidden bg-black">
              {stills.map((still, index) => (
                <img
                  key={still.url}
                  src={resizeTmdbImage(still.url, 'w780')}
                  alt=""
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 motion-safe:animate-[kenburns_9s_ease-out_infinite_alternate] ${
                    index === slide ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{ animationDelay: `${-index * 2.5}s` }}
                />
              ))}
              <span className="absolute left-5 top-4 rounded-md bg-black/50 px-2 py-1 text-[10px] font-black tracking-wider text-white backdrop-blur">
                {stills[slide]?.label}
              </span>
              {stills.length > 1 && (
                <div className="absolute inset-x-5 top-12 flex gap-1" aria-hidden>
                  {stills.map((still, index) => (
                    <span
                      key={still.url}
                      className={`h-0.5 flex-1 rounded-full transition-colors duration-500 ${
                        index <= slide ? 'bg-white/90' : 'bg-white/25'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
          <div className="h-28 bg-stone-200 dark:bg-[#161616] overflow-hidden">
            {series.posterUrl && (
              <img
                src={resizeTmdbImage(series.posterUrl, 'w500')}
                alt=""
                className="w-full h-full object-cover opacity-60"
              />
            )}
          </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-cream dark:from-[#0c0c0c] via-cream/40 dark:via-[#0c0c0c]/40 to-transparent" />
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white active:scale-90 transition-transform"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
          <div className="absolute inset-x-0 bottom-0 px-6 pb-3">
            <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
              <History size={11} strokeWidth={3} />
              {t('recap.kicker')}
            </p>
            <p className="text-lg font-black text-charcoal dark:text-white leading-tight line-clamp-2">
              {series.title}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-6 pt-2 pb-8 space-y-4">
          {result === undefined ? (
            <div role="status" className="flex items-center gap-2 py-8 text-[12px] text-stone-400">
              <Loader2 size={16} className="animate-spin" />
              {t('recap.loading')}
            </div>
          ) : result === null ? (
            <p className="py-6 text-[13px] leading-relaxed text-stone-500 dark:text-stone-400">
              {t('recap.empty')}
            </p>
          ) : (
            <>
              {seen && (
                <p className="text-[11px] font-bold text-stone-500 dark:text-stone-400">
                  {t('recap.until', { season: seen.season, episode: seen.episode })}
                </p>
              )}
              {result.recap ? (
                <>
                  <p className="whitespace-pre-line text-[15px] leading-relaxed text-charcoal dark:text-stone-100">
                    {result.recap}
                  </p>
                  <p className="text-[10px] text-stone-400 dark:text-stone-500">
                    {t('recap.aiNote')}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[12px] leading-relaxed text-stone-500 dark:text-stone-400">
                    {result.error ? `${result.error} ` : ''}
                    {t('recap.fallbackIntro')}
                  </p>
                  <ul className="space-y-3">
                    {fallback.map((part) => (
                      <li
                        key={part.label}
                        className="rounded-2xl border border-stone-200/80 bg-white p-3.5 dark:border-white/[0.06] dark:bg-white/[0.03]"
                      >
                        <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-500">
                          {part.label}
                        </p>
                        <p className="mt-1 text-[13px] leading-relaxed text-charcoal dark:text-stone-200">
                          {part.text}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SeriesRecap;
