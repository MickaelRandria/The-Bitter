import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, History, List, Loader2, Play, RotateCcw, X } from 'lucide-react';
import { Movie } from '../types';
import { TmdbSeasonSummary } from '../services/tmdb';
import { buildRecapSource, getRecap, SeriesRecapResult } from '../services/seriesRecap';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { haptics } from '../utils/haptics';
import { useDialog } from '../utils/useDialog';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  series: Movie;
  seasons: TmdbSeasonSummary[];
  onClose: () => void;
}

/** Une étape du récap : une idée, lisible d'un coup d'œil. */
interface Beat {
  label?: string;
  text: string;
}

/** Au-delà, une étape redevient un paragraphe : on coupe à la fin d'une phrase. */
const MAX_BEAT = 260;

/**
 * Le récap rédigé, découpé phrase par phrase. Une phrase très courte rejoint la
 * suivante : « Tout bascule. » seule sur un écran ne dit rien.
 */
export function recapBeats(text: string): Beat[] {
  const sentences = (text.match(/[^.!?…]+[.!?…]+["»”)]*|[^.!?…]+$/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
  const beats: string[] = [];
  for (const sentence of sentences) {
    const last = beats[beats.length - 1];
    if (last && (last.length < 50 || sentence.length < 30)) beats[beats.length - 1] = `${last} ${sentence}`;
    else beats.push(sentence);
  }
  return beats.map((b) => ({ text: b }));
}

const clip = (text: string) => {
  if (text.length <= MAX_BEAT) return text;
  const cut = text.slice(0, MAX_BEAT);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > 80 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
};

/**
 * « Précédemment dans… », en stories.
 *
 * Un paragraphe de sept phrases ne se lit pas sur un téléphone. Chaque idée a
 * donc son écran, en gros, sur l'image d'un épisode déjà vu ; on touche pour
 * avancer, et le tout se lit en vingt secondes. Un dernier écran rappelle
 * jusqu'où va le récap, et « Tout lire » remet les étapes en liste.
 *
 * Deux sources : le récap rédigé quand l'assistant est joignable, sinon les
 * résumés des derniers épisodes vus. Les deux s'arrêtent au dernier épisode vu
 * (voir services/seriesRecap.ts) : rien sur la suite.
 */
const SeriesRecap: React.FC<Props> = ({ series, seasons, onClose }) => {
  const { t, language } = useLanguage();
  const dialog = useDialog(onClose, t('recap.title', { title: series.title }));
  const [result, setResult] = useState<SeriesRecapResult | null | undefined>(undefined);
  const [stills, setStills] = useState<{ label: string; url: string }[]>([]);
  const [index, setIndex] = useState(0);
  const [list, setList] = useState(false);

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

  // Les images des épisodes vus arrivent vite : le générique tourne pendant que le récap s'écrit.
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

  const beats: Beat[] = useMemo(() => {
    if (!result) return [];
    if (result.recap) return recapBeats(result.recap);
    return [...result.source.seasons.slice(-1), ...result.source.episodes.slice(-3)].map((part) => ({
      label: part.label,
      text: clip(part.text),
    }));
  }, [result]);

  const seen = result?.source.lastSeen;
  const done = beats.length > 0 && index >= beats.length;
  const still = stills.length ? stills[Math.min(index, beats.length - 1, stills.length - 1) % stills.length] : null;
  const image = still?.url ?? series.posterUrl;

  const next = () => {
    haptics.soft();
    setIndex((i) => Math.min(beats.length, i + 1));
  };
  const previous = () => {
    haptics.soft();
    setIndex((i) => Math.max(0, i - 1));
  };

  const primary =
    'flex w-full items-center justify-center gap-2 rounded-2xl bg-bitter-lime py-4 text-[11px] font-black uppercase tracking-widest text-black transition-transform active:scale-[0.98]';
  const quiet = 'flex items-center justify-center gap-1.5 py-2 text-[10px] font-black uppercase tracking-widest text-white/50';

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[300] flex justify-center bg-black text-white animate-[fadeIn_0.3s_ease-out]"
    >
      {image && (
        <img
          key={image}
          src={resizeTmdbImage(image, 'w780')}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-55 animate-[fadeIn_0.8s_ease-out] motion-safe:animate-[kenburns_12s_ease-out_infinite_alternate]"
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/90" />

      <div className="relative flex h-full w-full max-w-md flex-col px-6 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        {/* Les barres de progression, comme une story. */}
        {beats.length > 0 && !list && (
          <div className="flex gap-1" aria-hidden>
            {beats.map((_, i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i < index || done ? 'bg-white' : i === index ? 'bg-bitter-lime' : 'bg-white/25'}`}
              />
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-white/70">
            <History size={12} strokeWidth={3} className="shrink-0" />
            <span className="truncate">{t('recap.kicker')} {series.title}</span>
          </p>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-transform active:scale-90"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        {result === undefined ? (
          <div className="flex flex-1 flex-col justify-end pb-10">
            <Loader2 size={20} className="animate-spin text-bitter-lime" />
            <p className="mt-3 text-[22px] font-black leading-tight tracking-tight">{t('recap.loading')}</p>
          </div>
        ) : result === null || beats.length === 0 ? (
          <div className="flex flex-1 flex-col justify-end gap-6 pb-6">
            <p className="text-[17px] font-bold leading-snug text-white/85">{t('recap.empty')}</p>
            <button onClick={onClose} className={primary}>
              {t('recap.close')}
            </button>
          </div>
        ) : list ? (
          // « Tout lire » : les mêmes étapes, en liste courte.
          <div className="mt-4 flex-1 overflow-y-auto no-scrollbar">
            <ol className="space-y-3 pb-4">
              {beats.map((beat, i) => (
                <li key={i} className="flex gap-3 rounded-2xl bg-black/50 p-4 backdrop-blur">
                  <span className="text-[12px] font-black tabular-nums text-bitter-lime">{i + 1}</span>
                  <span className="min-w-0">
                    {beat.label && (
                      <span className="block text-[10px] font-black uppercase tracking-widest text-white/50">{beat.label}</span>
                    )}
                    <span className="block text-[14px] leading-relaxed text-white/90">{beat.text}</span>
                  </span>
                </li>
              ))}
            </ol>
            <button onClick={onClose} className={primary}>
              <Play size={13} fill="currentColor" />
              {t('recap.resume')}
            </button>
          </div>
        ) : done ? (
          <div className="flex flex-1 flex-col justify-end gap-3 pb-2 animate-[fadeIn_0.4s_ease-out]">
            <p className="text-[30px] font-black leading-tight tracking-tight">{t('recap.ready')}</p>
            {seen && (
              <p className="text-[13px] leading-relaxed text-white/65">
                {t('recap.until', { season: seen.season, episode: seen.episode })}
              </p>
            )}
            {result.recap && <p className="text-[11px] text-white/40">{t('recap.aiNote')}</p>}
            <div className="mt-4 space-y-1">
              <button onClick={onClose} className={primary}>
                <Play size={13} fill="currentColor" />
                {t('recap.resume')}
              </button>
              <div className="flex justify-between">
                <button
                  onClick={() => {
                    haptics.soft();
                    setIndex(0);
                  }}
                  className={quiet}
                >
                  <RotateCcw size={12} strokeWidth={2.5} />
                  {t('recap.again')}
                </button>
                <button onClick={() => setList(true)} className={quiet}>
                  <List size={12} strokeWidth={2.5} />
                  {t('recap.readAll')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Toucher à droite avance, à gauche revient. */}
            <div className="relative flex flex-1 flex-col justify-end pb-6">
              <button aria-label={t('recap.previous')} onClick={previous} className="absolute inset-y-0 left-0 w-1/3" />
              <button aria-label={t('recap.next')} onClick={next} className="absolute inset-y-0 right-0 w-2/3" />
              <div key={index} className="pointer-events-none animate-[fadeIn_0.45s_ease-out]">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-bitter-lime">
                  {beats[index].label ?? still?.label ?? t('recap.step', { index: index + 1, total: beats.length })}
                </p>
                <p className="mt-3 text-[25px] font-black leading-[1.22] tracking-tight [text-shadow:0_2px_16px_rgba(0,0,0,0.6)]">
                  {beats[index].text}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setList(true)} className={`${quiet} px-2`}>
                <List size={12} strokeWidth={2.5} />
                {t('recap.readAll')}
              </button>
              <button onClick={next} className={`${primary} flex-1`}>
                {index < beats.length - 1 ? t('recap.next') : t('recap.finish')}
                <ChevronRight size={14} strokeWidth={3} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SeriesRecap;
