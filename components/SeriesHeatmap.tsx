import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { TvProgress } from '../types';
import { TmdbSeasonSummary } from '../services/tmdb';
import { EpisodeScore, getSeriesEpisodeScores } from '../services/tv';
import { episodeKey } from '../utils/tvProgress';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  tmdbId: number;
  seasons: TmdbSeasonSummary[];
  progress?: TvProgress;
}

/**
 * La carte de la série : chaque épisode, coloré par la note du public.
 *
 * On y lit d'un coup d'œil ce qu'aucune moyenne ne dit : une série qui décolle
 * à la saison 2, une dernière saison qui s'effondre, un épisode sommet. C'est ce
 * qui aide à décider si on continue.
 *
 * Les notes ne sont pas des spoilers, les titres si : celui d'un épisode n'est
 * donné que s'il est déjà vu. La carte se charge à l'ouverture seulement — une
 * ou deux requêtes TMDB, pas à chaque fiche consultée.
 */

/** Du rouge au vert ; lisibles sur fond clair comme sombre. */
const SCALE: { min: number; color: string; label: string }[] = [
  { min: 9, color: '#1b7a3e', label: '9+' },
  { min: 8, color: '#4a9d44', label: '8' },
  { min: 7, color: '#9cc24a', label: '7' },
  { min: 6, color: '#e2bb3f', label: '6' },
  { min: 5, color: '#e58c45', label: '5' },
  { min: 0, color: '#cf4f3e', label: '<5' },
];

const colorFor = (rating: number) => SCALE.find((step) => rating >= step.min)!.color;

/** Au moins trois épisodes notés pour qu'une moyenne de saison ait un sens. */
const MIN_RATED_FOR_SEASON = 3;


/**
 * La courbe de la série : la note du public, épisode après épisode, saison par
 * saison. La partie déjà vue est tracée en citron, la suite en gris, et un
 * point dit « tu es ici ». On voit d'un coup d'œil si la série décolle ou
 * s'effondre, sans rien lire de son histoire.
 */
const SeriesCurve: React.FC<{
  rows: { season: number; episodes: EpisodeScore[] }[];
  isSeen: (score: EpisodeScore) => boolean;
  today: string;
  hereLabel: string;
}> = ({ rows, isSeen, today, hereLabel }) => {
  const points = rows.flatMap((row) =>
    row.episodes.filter((e) => e.rating != null && e.airDate != null && e.airDate <= today)
  );
  if (points.length < 3) return null;
  const W = 320;
  const H = 120;
  const PAD = 8;
  const ratings = points.map((p) => p.rating!);
  const low = Math.max(0, Math.min(...ratings) - 0.3);
  const high = Math.min(10, Math.max(...ratings) + 0.3);
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / Math.max(1, points.length - 1);
  const y = (r: number) => H - PAD - ((r - low) / Math.max(0.5, high - low)) * (H - 2 * PAD);
  const path = (list: { i: number; r: number }[]) => list.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.r).toFixed(1)}`).join(' ');
  const indexed = points.map((p, i) => ({ i, r: p.rating!, seen: isSeen(p), season: p.season }));
  const lastSeen = indexed.filter((p) => p.seen).pop();
  const seenPath = lastSeen ? path(indexed.slice(0, lastSeen.i + 1)) : '';
  const restPath = path(indexed.slice(lastSeen ? lastSeen.i : 0));
  const boundaries = indexed.filter((p, k) => k > 0 && p.season !== indexed[k - 1].season);

  return (
    <div className="rounded-2xl bg-[#141414] px-3 pb-2 pt-3">
      <svg viewBox={`0 0 ${W} ${H + 14}`} className="h-auto w-full" role="img" aria-hidden>
        {boundaries.map((b) => (
          <g key={b.i}>
            <line x1={x(b.i) - 2} x2={x(b.i) - 2} y1={4} y2={H} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
            <text x={x(b.i) + 1} y={H + 11} fontSize="9" fontWeight="800" fill="rgba(255,255,255,0.4)">S{b.season}</text>
          </g>
        ))}
        <text x={PAD} y={H + 11} fontSize="9" fontWeight="800" fill="rgba(255,255,255,0.4)">S{indexed[0].season}</text>
        <path d={restPath} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {seenPath && (
          <path d={seenPath} fill="none" stroke="#D9FF00" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        )}
        {lastSeen && (
          <g>
            <circle cx={x(lastSeen.i)} cy={y(lastSeen.r)} r="6" fill="#D9FF00" opacity="0.25" />
            <circle cx={x(lastSeen.i)} cy={y(lastSeen.r)} r="3.5" fill="#D9FF00" />
            <text
              x={Math.min(W - 40, Math.max(4, x(lastSeen.i) - 18))}
              y={Math.max(10, y(lastSeen.r) - 13)}
              fontSize="9"
              fontWeight="900"
              fill="#D9FF00"
            >
              {hereLabel}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};

const SeriesHeatmap: React.FC<Props> = ({ tmdbId, seasons, progress }) => {
  const { t, language } = useLanguage();
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  const [open, setOpen] = useState(true);
  const [scores, setScores] = useState<EpisodeScore[] | null | 'error'>(null);
  const [selected, setSelected] = useState<EpisodeScore | null>(null);
  const seasonKey = seasons.map((s) => s.seasonNumber).join(',');

  useEffect(() => {
    if (!open || scores !== null) return;
    let active = true;
    getSeriesEpisodeScores(
      tmdbId,
      seasonKey.split(',').map(Number),
      language === 'fr' ? 'fr-FR' : 'en-US'
    )
      .then((data) => active && setScores(data))
      .catch(() => active && setScores('error'));
    return () => {
      active = false;
    };
  }, [open, scores, tmdbId, seasonKey, language]);

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
  const format = (value: number) =>
    value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const isSeen = (score: EpisodeScore) => {
    if (progress?.episodes?.[episodeKey(score.season, score.episode)]?.watched) return true;
    if (progress?.seasonsWatched?.includes(score.season)) return true;
    const { lastSeason, lastEpisode } = progress ?? {};
    return (
      lastSeason != null &&
      (score.season < lastSeason ||
        (score.season === lastSeason && score.episode < (lastEpisode ?? 1)))
    );
  };

  const { rows, maxEpisodes, bestSeason, bestEpisode } = useMemo(() => {
    const list = Array.isArray(scores) ? scores : [];
    const bySeason = new Map<number, EpisodeScore[]>();
    for (const score of list)
      bySeason.set(score.season, [...(bySeason.get(score.season) ?? []), score]);
    const rows = [...bySeason.entries()]
      .sort(([a], [b]) => a - b)
      .map(([season, episodes]) => ({
        season,
        episodes: episodes.sort((a, b) => a.episode - b.episode),
      }));

    const averages = rows
      .map((row) => {
        const rated = row.episodes.filter((e) => e.rating != null);
        return rated.length >= MIN_RATED_FOR_SEASON
          ? {
              season: row.season,
              average: rated.reduce((sum, e) => sum + e.rating!, 0) / rated.length,
            }
          : null;
      })
      .filter((a): a is { season: number; average: number } => a != null);

    return {
      rows,
      maxEpisodes: Math.max(1, ...rows.map((row) => row.episodes.length)),
      bestSeason:
        averages.length > 1 ? averages.reduce((a, b) => (b.average > a.average ? b : a)) : null,
      bestEpisode: list
        .filter((e) => e.rating != null)
        .reduce<EpisodeScore | null>((a, b) => (!a || b.rating! > a.rating! ? b : a), null),
    };
  }, [scores]);

  const describe = (score: EpisodeScore) => {
    const place = t('upNext.episodeLine', { season: score.season, episode: score.episode });
    const aired = score.airDate != null && score.airDate <= today;
    const rating = !aired
      ? t('heatmap.notAired')
      : score.rating != null
        ? t('heatmap.rating', {
            rating: format(score.rating),
            votes: score.votes.toLocaleString(locale),
          })
        : t('heatmap.noRating');
    return `${place} · ${rating}${isSeen(score) ? ` · ${t('heatmap.seen')}` : ''}`;
  };

  return (
    <section>
      <button
        onClick={() => {
          haptics.soft();
          setOpen((value) => !value);
        }}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="block text-[9px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600">
            {t('heatmap.title')}
          </span>
          <span className="block text-[11px] text-stone-500 dark:text-stone-400">
            {t('heatmap.subtitle')}
          </span>
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="mt-3">
          {scores === null ? (
            <div className="flex justify-center py-4">
              <Loader2 className="animate-spin text-stone-300" size={20} />
            </div>
          ) : scores === 'error' || rows.length === 0 ? (
            <p className="text-[11px] text-stone-400 dark:text-stone-600">
              {t('heatmap.unavailable')}
            </p>
          ) : (
            <>
              {(bestSeason || bestEpisode) && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {bestSeason && (
                    <span className="rounded-xl bg-forest/10 px-3 py-2 text-[11px] font-bold text-forest dark:bg-bitter-lime/10 dark:text-bitter-lime">
                      {t('heatmap.bestSeason', { season: bestSeason.season, rating: format(bestSeason.average) })}
                    </span>
                  )}
                  {bestEpisode && (
                    <span className="rounded-xl bg-stone-100 px-3 py-2 text-[11px] font-bold text-charcoal dark:bg-white/[0.06] dark:text-white">
                      {t('heatmap.bestEpisode', {
                        place: t('upNext.episodeLine', { season: bestEpisode.season, episode: bestEpisode.episode }),
                        rating: format(bestEpisode.rating!),
                      })}
                    </span>
                  )}
                </div>
              )}
              <div className="mb-3">
                <SeriesCurve rows={rows} isSeen={isSeen} today={today} hereLabel={t('heatmap.here')} />
              </div>
              <div className="-mx-1 overflow-x-auto no-scrollbar px-1 pb-1">
                <div className="space-y-[3px]">
                  {rows.map((row) => (
                    <div key={row.season} className="flex items-center gap-1.5">
                      <span className="w-6 shrink-0 text-[9px] font-black tabular-nums text-stone-400 dark:text-stone-500">
                        S{row.season}
                      </span>
                      <div
                        className="grid gap-[3px]"
                        style={{
                          gridTemplateColumns: `repeat(${maxEpisodes}, minmax(10px, 22px))`,
                        }}
                      >
                        {row.episodes.map((score) => {
                          const aired = score.airDate != null && score.airDate <= today;
                          const active =
                            selected?.season === score.season && selected.episode === score.episode;
                          return (
                            <button
                              key={score.episode}
                              onClick={() => setSelected(active ? null : score)}
                              aria-label={describe(score)}
                              aria-pressed={active}
                              className={`relative aspect-square rounded-[4px] transition-transform active:scale-90 ${
                                !aired
                                  ? 'border border-dashed border-stone-300 dark:border-white/15'
                                  : score.rating == null
                                    ? 'bg-stone-200 dark:bg-white/10'
                                    : ''
                              } ${active ? 'ring-2 ring-charcoal dark:ring-white ring-offset-1 ring-offset-cream dark:ring-offset-[#0c0c0c]' : ''}`}
                              style={
                                aired && score.rating != null
                                  ? { background: colorFor(score.rating) }
                                  : undefined
                              }
                            >
                              {isSeen(score) && (
                                <span className="absolute inset-0 m-auto h-[5px] w-[5px] rounded-full bg-white/90 shadow-sm" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <p
                className="mt-2 min-h-[16px] text-[11px] font-bold text-charcoal dark:text-stone-200"
                aria-live="polite"
              >
                {selected
                  ? `${describe(selected)}${isSeen(selected) && selected.name ? ` — ${selected.name}` : ''}`
                  : ''}
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] font-bold text-stone-400 dark:text-stone-500">
                {[...SCALE].reverse().map((step) => (
                  <span key={step.label} className="flex items-center gap-1">
                    <span
                      className="h-2.5 w-2.5 rounded-[3px]"
                      style={{ background: step.color }}
                    />
                    {step.label}
                  </span>
                ))}
                <span className="flex items-center gap-1">
                  <span className="relative h-2.5 w-2.5 rounded-[3px] bg-stone-300 dark:bg-white/20">
                    <span className="absolute inset-0 m-auto h-[4px] w-[4px] rounded-full bg-white" />
                  </span>
                  {t('heatmap.seenLegend')}
                </span>
              </div>

            </>
          )}
        </div>
      )}
    </section>
  );
};

export default SeriesHeatmap;
