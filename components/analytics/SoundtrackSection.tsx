import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pause, Play, X } from 'lucide-react';
import type { Movie } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';
import { haptics } from '../../utils/haptics';
import { resizeTmdbImage } from '../../utils/tmdbImage';
import { soundScore } from '../../utils/soundScore';
import { stopPreview, togglePreview, usePreviewPlayer } from '../../utils/previewPlayer';
import { getComposers, getSoundtrack, topTracks, type SoundtrackAlbum, type SoundtrackTrack } from '../../services/soundtrack';

/**
 * La bande originale dans la page Goûts : ta note Son moyenne, tes sommets à
 * l'oreille, tes compositeurs.
 *
 * Ce n'est pas la dataviz qui bouge, c'est la page : elle se pose en rythme
 * quand on arrive dessus (une croche à 120 bpm entre deux éléments), le fond
 * prend les couleurs de l'affiche qu'on écoute, et un mini-lecteur reste au-
 * dessus de la navigation tant que l'extrait joue.
 */

const BEAT_MS = 250;
const PEAKS = 5;
const MIN_FILMS = 5;
const COMPOSER_ROWS = 7;

interface Peak {
  movie: Movie;
  score: number;
  album: SoundtrackAlbum;
  track: SoundtrackTrack;
}

interface ComposerRow {
  name: string;
  average: number;
  films: string[];
}

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace('.', ',');

const prefersReducedMotion = () => {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
};

/** Lance `task` sur chaque élément, `width` à la fois : TMDB n'aime pas les rafales. */
async function pool<T>(items: T[], width: number, task: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, items.length) }, async () => {
      while (next < items.length) await task(items[next++]);
    })
  );
}

const SoundtrackSection: React.FC<{ movies: Movie[] }> = ({ movies }) => {
  const { t } = useLanguage();
  const player = usePreviewPlayer();
  const sectionRef = useRef<HTMLElement>(null);
  const [entered, setEntered] = useState(false);
  const [counter, setCounter] = useState(0);
  const [peaks, setPeaks] = useState<Peak[] | null>(null);
  const [composers, setComposers] = useState<ComposerRow[] | null>(null);

  const scored = useMemo(
    () =>
      movies
        .filter((m) => m.status === 'watched' && (m.mediaType ?? 'movie') === 'movie' && m.seasonNumber == null && m.tmdbId != null)
        .map((m) => ({ movie: m, score: soundScore(m) }))
        .filter((x): x is { movie: Movie; score: number } => x.score != null),
    [movies]
  );
  const average = scored.length ? scored.reduce((a, x) => a + x.score, 0) / scored.length : 0;

  // On ne charge rien, et on n'anime rien, avant que la section soit à l'écran.
  useEffect(() => {
    const node = sectionRef.current;
    if (!node || entered) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setEntered(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [entered, scored.length]);

  // Le chiffre compte jusqu'à la moyenne pendant que la section se pose.
  useEffect(() => {
    if (!entered) return;
    if (prefersReducedMotion()) return setCounter(average);
    let frame = 0;
    const start = performance.now() + 2 * BEAT_MS;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / 1100));
      setCounter(average * (1 - Math.pow(1 - p, 3)));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [entered, average]);

  // Les sommets : les meilleures notes Son dont la bande originale existe.
  useEffect(() => {
    if (!entered) return;
    let alive = true;
    const candidates = [...scored].sort((a, b) => b.score - a.score).slice(0, PEAKS * 3);
    (async () => {
      const found: Peak[] = [];
      for (const { movie, score } of candidates) {
        if (found.length >= PEAKS) break;
        const albums = await getSoundtrack(movie.tmdbId!, movie.title).catch(() => []);
        const album = albums[0];
        const track = album ? topTracks(album, 1)[0] : undefined;
        if (album && track) found.push({ movie, score, album, track });
      }
      if (alive) setPeaks(found);
    })();
    return () => {
      alive = false;
    };
  }, [entered, scored]);

  // Les compositeurs qui reviennent, classés par ta note Son.
  useEffect(() => {
    if (!entered) return;
    let alive = true;
    const byComposer = new Map<string, { title: string; score: number }[]>();
    pool(scored, 4, async ({ movie, score }) => {
      const names = await getComposers(movie.tmdbId!).catch(() => [] as string[]);
      for (const name of names) byComposer.set(name, [...(byComposer.get(name) ?? []), { title: movie.title, score }]);
    }).then(() => {
      if (!alive) return;
      const rows = [...byComposer.entries()]
        .filter(([, films]) => films.length >= 2)
        .map(([name, films]) => ({
          name,
          average: films.reduce((a, f) => a + f.score, 0) / films.length,
          films: [...films].sort((a, b) => b.score - a.score).map((f) => f.title),
        }))
        .sort((a, b) => b.average - a.average || b.films.length - a.films.length)
        .slice(0, COMPOSER_ROWS);
      setComposers(rows);
    });
    return () => {
      alive = false;
    };
  }, [entered, scored]);

  const current = peaks?.find((p) => p.track.id === player.trackId) ?? null;

  // Quitter les stats arrête l'extrait qu'on y a lancé.
  const currentRef = useRef(current);
  currentRef.current = current;
  useEffect(() => () => {
    if (currentRef.current) stopPreview();
  }, []);

  if (scored.length < MIN_FILMS) return null;

  /** L'entrée en rythme : chaque élément attend son temps, puis se pose. */
  const beat = (n: number) =>
    entered
      ? { className: 'bo-beat', style: { animationDelay: `${n * BEAT_MS}ms` } as React.CSSProperties }
      : { className: 'bo-wait', style: undefined };

  const ambientOn = !!current && player.playing;
  const progress = current ? Math.min(100, (player.position / (player.length || 30)) * 100) : 0;

  return (
    <section ref={sectionRef} className="relative isolate flex flex-col gap-3.5" aria-labelledby="bo-stats-title">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-6 -top-24 bottom-0 -z-10 overflow-hidden transition-opacity duration-1000"
        style={{
          opacity: ambientOn ? 1 : 0,
          // Sans ce fondu, l'ambiance commence par un bord net au-dessus de la section.
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 30%)',
          maskImage: 'linear-gradient(to bottom, transparent 0, #000 30%)',
        }}
      >
        {current?.movie.posterUrl && (
          <img
            src={resizeTmdbImage(current.movie.posterUrl, 'w342')}
            alt=""
            className="bo-ambient absolute -left-[20%] -top-[10%] h-[70%] w-[140%] object-cover blur-[64px] saturate-[1.7] brightness-[0.62]"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0c0c0c]/10 via-[#0c0c0c]/60 to-[#0c0c0c]" />
      </div>

      <div className={`flex items-baseline justify-between gap-3 px-1 ${beat(0).className}`} style={beat(0).style}>
        <h3 id="bo-stats-title" className="text-[20px] font-black tracking-[-0.045em] text-white">
          {t('boStats.title')}
        </h3>
        <small className="text-[10.5px] font-extrabold text-white/35 whitespace-nowrap">{t('boStats.aside')}</small>
      </div>

      <div className={`flex items-end gap-3.5 px-1 ${beat(1).className}`} style={beat(1).style}>
        <span className="text-[76px] font-black leading-[0.8] tracking-[-0.07em] text-white tabular-nums">{fmt1(counter)}</span>
        <span className="pb-1.5 text-[13px] font-extrabold leading-snug text-white">
          {t('boStats.average')}
          <br />
          <span className="font-semibold text-white/50">{t('boStats.onFilms', { n: String(scored.length) })}</span>
        </span>
      </div>

      <div className={`mt-4 flex items-baseline justify-between px-1 ${beat(3).className}`} style={beat(3).style}>
        <h4 className="text-[16px] font-black tracking-[-0.04em] text-white">{t('boStats.peaks')}</h4>
        <small className="text-[10px] font-extrabold text-white/40">{t('boStats.tapToListen')}</small>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {(peaks ?? Array.from({ length: PEAKS }, () => null)).map((peak, i) => {
          const playing = !!peak && current?.track.id === peak.track.id && player.playing;
          const selected = !!peak && current?.track.id === peak.track.id;
          return peak ? (
            <button
              key={peak.movie.id}
              type="button"
              onClick={() => {
                haptics.soft();
                togglePreview(peak.track);
              }}
              aria-pressed={selected}
              aria-label={t(playing ? 'boStats.pauseFilm' : 'boStats.playFilm', { title: peak.movie.title, score: fmt1(peak.score) })}
              className={`flex flex-col gap-1.5 text-left ${beat(4 + i * 0.5).className}`}
              style={beat(4 + i * 0.5).style}
            >
              <span
                className={`relative block aspect-[2/3] w-full overflow-hidden rounded-[10px] transition-[transform,box-shadow] duration-300 ${
                  selected ? '-translate-y-1 shadow-[0_0_0_2px_#0c0c0c,0_0_0_3.5px_#D9FF00]' : 'shadow-[0_8px_18px_rgba(0,0,0,0.45)]'
                }`}
              >
                {peak.movie.posterUrl && (
                  <img src={resizeTmdbImage(peak.movie.posterUrl, 'w185')} alt="" loading="lazy" className="h-full w-full object-cover" />
                )}
                {playing && (
                  <span aria-hidden="true" className="absolute bottom-1.5 left-1.5 flex h-[14px] items-end gap-[2px] rounded-md bg-[#0c0c0c]/70 px-1 py-[3px]">
                    <span className="bo-eq block h-full w-[2px] bg-bitter-lime" />
                    <span className="bo-eq block h-full w-[2px] bg-bitter-lime [animation-delay:-0.3s]" />
                    <span className="bo-eq block h-full w-[2px] bg-bitter-lime [animation-delay:-0.6s]" />
                  </span>
                )}
              </span>
              <span className={`text-[15px] font-black tracking-[-0.03em] tabular-nums ${selected ? 'text-bitter-lime' : 'text-white'}`}>
                {fmt1(peak.score)}
              </span>
            </button>
          ) : (
            <span key={i} aria-hidden="true" className="block aspect-[2/3] w-full animate-pulse rounded-[10px] bg-white/[0.06]" />
          );
        })}
      </div>
      {peaks && peaks.length === 0 && <p className="px-1 text-[12px] font-semibold text-white/45">{t('boStats.noPeaks')}</p>}

      {composers && composers.length > 0 && (
        <>
          <div className={`mt-5 px-1 ${beat(9).className}`} style={beat(9).style}>
            <h4 className="text-[16px] font-black tracking-[-0.04em] text-white">{t('boStats.composers')}</h4>
            <p className="mt-1 text-[12px] font-semibold text-white/50">{t('boStats.composersHow')}</p>
          </div>
          <div className="flex flex-col">
            {composers.map((row, i) => (
              <div
                key={row.name}
                className={`grid min-h-[52px] grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/[0.07] ${beat(10 + i * 0.5).className}`}
                style={beat(10 + i * 0.5).style}
              >
                <span className={`text-[18px] font-black tracking-[-0.05em] tabular-nums ${i === 0 ? 'text-bitter-lime' : 'text-white/25'}`}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0">
                  <b className="block truncate text-[14.5px] font-black tracking-[-0.02em] text-white">{row.name}</b>
                  <small className="block truncate text-[10.5px] font-semibold text-white/40">{row.films.join(' · ')}</small>
                </span>
                <em className={`not-italic text-[15px] font-black tabular-nums ${i === 0 ? 'text-bitter-lime' : 'text-white'}`}>{fmt1(row.average)}</em>
              </div>
            ))}
          </div>
        </>
      )}

      {current &&
        createPortal(
          <div
            className="bo-player-in fixed inset-x-3.5 z-[60] mx-auto max-w-md overflow-hidden rounded-[22px] border border-white/10 bg-[#1c1c1c]/90 text-white shadow-[0_18px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl"
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem + 84px)' }}
            role="region"
            aria-label={t('boStats.player')}
          >
            <div className="flex items-center gap-3 p-2.5">
              {current.album.cover ? (
                <img src={current.album.cover} alt="" className="h-[42px] w-[42px] rounded-[10px] object-cover" />
              ) : (
                <span className="h-[42px] w-[42px] rounded-[10px] bg-white/10" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black">{current.track.title}</p>
                <p className="truncate text-[11px] font-bold text-white/55">
                  {[current.album.artist, current.movie.title].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => togglePreview(current.track)}
                aria-label={t(player.playing ? 'soundtrack.pause' : 'soundtrack.play', { title: current.track.title })}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bitter-lime text-charcoal active:scale-90 transition-transform"
              >
                {player.playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
              </button>
              <button
                type="button"
                onClick={() => stopPreview()}
                aria-label={t('boStats.closePlayer')}
                className="flex h-11 w-9 shrink-0 items-center justify-center text-white/50"
              >
                <X size={16} strokeWidth={2.4} />
              </button>
            </div>
            <div className="h-[2px] bg-white/10" aria-hidden="true">
              <div className="h-full bg-bitter-lime transition-[width] duration-200" style={{ width: `${progress}%` }} />
            </div>
          </div>,
          document.body
        )}
    </section>
  );
};

export default SoundtrackSection;
