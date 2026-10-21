import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Movie } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';
import { haptics } from '../../utils/haptics';
import { resizeTmdbImage } from '../../utils/tmdbImage';
import { getDisplayWeightedRating } from '../../utils/rating';
import { getPublicRating } from '../../utils/publicRating';
import { fmt1 } from '../../utils/verdict';
import SoundtrackSection from './SoundtrackSection';
import {
  GoutFilm,
  contrarian,
  decades,
  distribution,
  genreBlocks,
  hypeGaps,
  ranking,
  squarify,
  topDirectors,
} from '../../utils/goutsStats';

/**
 * L'onglet Goûts : ce que tu aimes. Une seule page qui défile, sans pop-in,
 * dans le style de Profil. Profil dit qui tu es comme critique ; ici, ce sont
 * des genres, des réalisateurs, des époques et des films.
 */
interface Props {
  movies: Movie[];
  /** Moyenne du public sur tes films ; 0 sans note du public. */
  publicAverage: number;
  onViewMovie?: (movie: Movie) => void;
  onViewDirector?: (name: string, id?: number) => void;
  /** Ouvert depuis « Tout le palmarès » : descendre au classement. */
  focusRanking?: boolean;
}

const GAP = 1.6;
const RANK_STEP = 20;

const toFilm = (m: Movie): GoutFilm => ({
  id: m.id,
  title: m.title,
  posterUrl: m.posterUrl,
  score: getDisplayWeightedRating(m),
  genre: m.genre,
  director: m.director,
  directorId: m.directorId,
  year: m.year,
  publicScore: getPublicRating(m)?.value,
  hype: typeof m.hype === 'number' ? m.hype : undefined,
});

const Poster: React.FC<{ url?: string; className?: string }> = ({ url, className = '' }) =>
  url ? (
    <img src={resizeTmdbImage(url, 'w185')} alt="" loading="lazy" className={`object-cover aspect-[2/3] ${className}`} />
  ) : (
    <span className={`block aspect-[2/3] bg-white/5 ${className}`} />
  );

/**
 * Une phrase traduite dont les valeurs passent en gras : « {genre}, ta valeur
 * sûre ». Les valeurs viennent des données (noms de genres) : jamais de HTML
 * brut, chaque morceau est un nœud React.
 */
const rich = (template: string, vars: Record<string, string>) =>
  template.split(/(\{\w+\})/).map((part, i) => {
    const key = part.match(/^\{(\w+)\}$/)?.[1];
    return key && key in vars ? (
      <em key={i} className="not-italic font-extrabold text-white">
        {vars[key]}
      </em>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    );
  });

const Head: React.FC<{ title: string; aside?: string }> = ({ title, aside }) => (
  <div className="flex items-baseline justify-between gap-3 px-1">
    <h3 className="text-[20px] font-black tracking-[-0.045em] text-white">{title}</h3>
    {aside && <small className="text-[10.5px] font-extrabold text-white/35 whitespace-nowrap">{aside}</small>}
  </div>
);

const GoutsTab: React.FC<Props> = ({ movies, publicAverage, onViewMovie, onViewDirector, focusRanking = false }) => {
  const { t } = useLanguage();
  const watched = useMemo(() => movies.filter((m) => m.status === 'watched'), [movies]);
  const byId = useMemo(() => new Map(watched.map((m) => [m.id, m])), [watched]);
  const films = useMemo(() => watched.map(toFilm), [watched]);
  const open = (id: string) => {
    const movie = byId.get(id);
    if (!movie) return;
    haptics.soft();
    onViewMovie?.(movie);
  };

  const blocks = useMemo(() => genreBlocks(films), [films]);
  const tiles = useMemo(() => squarify(blocks.map((b) => b.count)), [blocks]);
  const dist = useMemo(() => distribution(films), [films]);
  const myAvg = dist.average;
  const { surprise, disappointment } = useMemo(() => contrarian(films), [films]);
  const directors = useMemo(() => topDirectors(films), [films]);
  const eras = useMemo(() => decades(films), [films]);
  const hype = useMemo(() => hypeGaps(films), [films]);
  const ranked = useMemo(() => ranking(films), [films]);

  const [genre, setGenre] = useState<string | null>(null);
  const [shown, setShown] = useState(5);
  const rankRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focusRanking) return;
    setShown(RANK_STEP);
    const id = window.setTimeout(() => rankRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
    return () => window.clearTimeout(id);
  }, [focusRanking]);

  // Les phrases qui résument.
  const topGenre = blocks.find((b) => !b.others);
  const loved = [...blocks].filter((b) => !b.others).sort((a, b) => b.average - a.average)[0];
  const genreLine = !topGenre
    ? null
    : loved && loved.name !== topGenre.name
      ? rich(t('gouts.genreLineSplit'), { most: topGenre.name, best: loved.name })
      : rich(t('gouts.genreLineSame'), { genre: topGenre.name });
  const topEra = [...eras].sort((a, b) => b.average - a.average)[0];
  const mostEra = [...eras].sort((a, b) => b.count - a.count)[0];
  const eraLine =
    topEra && mostEra && topEra.decade !== mostEra.decade
      ? rich(t('gouts.eraLineSplit'), { most: String(mostEra.decade), best: String(topEra.decade) })
      : topEra
        ? rich(t('gouts.eraLineSame'), { decade: String(topEra.decade) })
        : null;
  const maxEra = Math.max(1, ...eras.map((e) => e.count));
  const maxBucket = Math.max(1, ...dist.buckets);
  const mark = (v: number) => `${((Math.max(0, Math.min(10, v)) + 0.5) / 11) * 100}%`;
  const selected = blocks.find((b) => b.name === genre);

  const sec = 'flex flex-col gap-3.5';
  const lead = 'px-1 -mt-1.5 text-[13px] font-semibold leading-snug text-white/60';
  const line = 'border-t border-white/[0.08]';

  if (!films.length) return null;

  return (
    <div className="flex flex-col gap-[34px] pb-2 animate-[fadeIn_0.3s_ease-out]">
      {/* 1 · Tes genres : un mur d'affiches, la surface d'un bloc = le nombre de films. */}
      {blocks.length > 0 && (
        <section className={sec}>
          <Head title={t('gouts.genres')} aside={t('gouts.onFilms', { n: String(dist.total) })} />
          <p className={lead}>{t('gouts.genresHow')}</p>
          <div className="relative aspect-square">
            {tiles.map((tile) => {
              const b = blocks[tile.index];
              const up = b.average > myAvg;
              const small = tile.w * tile.h < 1300;
              const active = genre === b.name;
              return (
                <button
                  key={b.name}
                  type="button"
                  onClick={() => {
                    haptics.soft();
                    setGenre(active ? null : b.name);
                  }}
                  aria-pressed={active}
                  aria-label={t('gouts.genreAria', { genre: b.name, n: String(b.count), avg: fmt1(b.average) })}
                  className={`absolute isolate overflow-hidden rounded-2xl text-left transition-[box-shadow,transform] active:scale-[0.98] ${
                    b.others ? 'bg-[#24221F]' : 'bg-[#1C1B19]'
                  } ${active ? 'ring-2 ring-bitter-lime' : ''}`}
                  style={{
                    left: `calc(${tile.x}% + ${GAP / 2}%)`,
                    top: `calc(${tile.y}% + ${GAP / 2}%)`,
                    width: `calc(${tile.w}% - ${GAP}%)`,
                    height: `calc(${tile.h}% - ${GAP}%)`,
                  }}
                >
                  {!b.others && b.favorite?.posterUrl && (
                    <>
                      <img
                        src={resizeTmdbImage(b.favorite.posterUrl, 'w342')}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 -z-20 w-full h-full object-cover object-[center_25%]"
                      />
                      <span className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(12,12,12,0)_25%,rgba(12,12,12,0.6)_55%,rgba(12,12,12,0.94)_100%)]" />
                    </>
                  )}
                  <span className={`absolute flex flex-col ${small ? 'left-[9px] right-2 bottom-2' : 'left-3 right-2.5 bottom-[11px]'}`}>
                    <em className={`not-italic font-black tracking-[-0.06em] leading-[0.9] tabular-nums ${small ? 'text-[22px]' : 'text-[32px]'} ${up ? 'text-bitter-lime' : 'text-white'}`}>
                      {fmt1(b.average)}
                    </em>
                    <b className={`mt-[5px] font-black tracking-[-0.02em] truncate text-white ${small ? 'text-[11px]' : 'text-[13.5px]'}`}>
                      {b.others ? t('gouts.others') : b.name}
                    </b>
                    <small className="text-[10px] font-extrabold text-white/60">{t('gouts.films', { n: String(b.count) })}</small>
                  </span>
                </button>
              );
            })}
          </div>
          {selected ? (
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-6 px-6 pb-1 animate-[fadeIn_0.25s_ease-out]">
              {selected.films.slice(0, 20).map((f) => (
                <button key={f.id} type="button" onClick={() => open(f.id)} className="shrink-0 w-[72px] text-left active:scale-95 transition-transform">
                  <Poster url={f.posterUrl} className="w-full rounded-[10px]" />
                  <span className="mt-1 block text-[10px] font-black text-white truncate">{f.title}</span>
                  <span className="block text-[10px] font-extrabold text-white/40 tabular-nums">{fmt1(f.score)}</span>
                </button>
              ))}
            </div>
          ) : (
            genreLine && <p className="px-1 text-[13px] font-semibold leading-snug text-white/60">{genreLine}</p>
          )}
        </section>
      )}

      {/* 2 · Contre l'avis général. */}
      {(surprise || disappointment) && (
        <section className={sec}>
          <Head title={t('gouts.contrarian')} aside={t('gouts.vsPublic')} />
          <div className="grid grid-cols-2 gap-2.5">
            {[
              surprise && { f: surprise, label: t('gouts.surprise'), down: false },
              disappointment && { f: disappointment, label: t('gouts.disappointment'), down: true },
            ]
              .filter(Boolean)
              .map((item) => {
                const { f, label, down } = item as { f: GoutFilm & { gap: number }; label: string; down: boolean };
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => open(f.id)}
                    className="relative isolate overflow-hidden rounded-[18px] aspect-[3/4.3] flex flex-col justify-end p-[11px] text-left active:scale-[0.98] transition-transform"
                  >
                    {f.posterUrl && (
                      <img
                        src={resizeTmdbImage(f.posterUrl, 'w342')}
                        alt=""
                        loading="lazy"
                        className={`absolute inset-0 -z-20 w-full h-full object-cover ${down ? 'grayscale' : ''}`}
                      />
                    )}
                    <span className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,transparent_30%,rgba(0,0,0,0.9))]" />
                    <span className={`absolute top-[9px] left-[9px] text-[8.5px] font-black tracking-[0.12em] uppercase px-[7px] py-1 rounded-[7px] text-charcoal ${down ? 'bg-white' : 'bg-bitter-lime'}`}>
                      {label}
                    </span>
                    <span className={`text-[30px] font-black tracking-[-0.06em] leading-[0.9] tabular-nums ${down ? 'text-[#F08A24]' : 'text-bitter-lime'}`}>
                      {f.gap > 0 ? '+' : '−'}
                      {fmt1(Math.abs(f.gap))}
                    </span>
                    <b className="mt-1.5 text-[13px] font-black tracking-[-0.02em] text-white line-clamp-2">{f.title}</b>
                    <small className="text-[10.5px] font-extrabold text-white/75 tabular-nums">
                      {t('gouts.youPublic', { me: fmt1(f.score), pub: fmt1(f.publicScore ?? 0) })}
                    </small>
                  </button>
                );
              })}
          </div>
        </section>
      )}

      {/* 3 · Tes réalisateurs. */}
      {directors.length > 0 && (
        <section className={sec}>
          <Head title={t('gouts.directors')} aside={t('gouts.directorsAside')} />
          <div className="flex flex-col">
            {directors.map((d, i) => (
              <button
                key={d.name}
                type="button"
                onClick={() => {
                  haptics.soft();
                  onViewDirector?.(d.name, d.id);
                }}
                className={`grid grid-cols-[96px_minmax(0,1fr)_auto] gap-3.5 items-center text-left py-3.5 ${i ? line : 'pt-0'} active:opacity-80`}
              >
                <span className="relative h-[72px]" aria-hidden="true">
                  {d.films.slice(0, 3).map((f, j) => (
                    <Poster
                      key={f.id}
                      url={f.posterUrl}
                      className={`absolute w-[46px] rounded-[9px] shadow-[0_12px_20px_-12px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.06] ${
                        j === 0 ? 'left-0 top-1 -rotate-[7deg]' : j === 1 ? 'left-[25px] top-0 z-[1]' : 'left-[50px] top-1 rotate-[7deg]'
                      }`}
                    />
                  ))}
                </span>
                <span className="min-w-0">
                  <b className="block text-[15px] font-black tracking-[-0.025em] text-white truncate">{d.name}</b>
                  <small className="text-[10.5px] font-bold text-white/35">{t('gouts.films', { n: String(d.count) })}</small>
                </span>
                <em className={`not-italic text-[22px] font-black tracking-[-0.05em] tabular-nums ${i === 0 ? 'text-bitter-lime' : 'text-white'}`}>{fmt1(d.average)}</em>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 4 · Tes époques. */}
      {eras.length >= 2 && (
        <section className={sec}>
          <Head title={t('gouts.eras')} aside={t('gouts.erasAside')} />
          {eraLine && <p className={lead}>{eraLine}</p>}
          <div className="grid gap-1.5 items-end" style={{ gridTemplateColumns: `repeat(${eras.length}, minmax(0, 1fr))` }}>
            {eras.map((e) => {
              const top = topEra && e.decade === topEra.decade;
              return (
                <button key={e.decade} type="button" onClick={() => e.best && open(e.best.id)} className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
                  <Poster url={e.best?.posterUrl} className="w-full rounded-lg shadow-[0_10px_18px_-12px_rgba(0,0,0,0.9)]" />
                  <span className={`w-full rounded-t-md rounded-b-sm ${top ? 'bg-bitter-lime' : 'bg-white/[0.12]'}`} style={{ height: `${Math.max(6, (e.count / maxEra) * 88)}px` }} />
                  <b className={`text-[10px] font-black ${top ? 'text-bitter-lime' : 'text-white/60'}`}>{e.decade >= 2000 ? e.decade : String(e.decade).slice(2)}</b>
                  <small className="text-[9.5px] font-extrabold text-white/35 tabular-nums">{fmt1(e.average)}</small>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 5 · Ta façon de noter. */}
      {dist.total >= 5 && (
        <section className={sec}>
          <Head title={t('gouts.howYouRate')} aside={t('gouts.zeroToTen')} />
          <div className="rounded-[22px] bg-[#1C1B19] border border-white/[0.08] px-[15px] pt-4 pb-3">
            <div className="relative flex items-end gap-1 h-24" aria-hidden="true">
              {dist.buckets.map((n, note) => (
                <i
                  key={note}
                  className={`flex-1 rounded-t rounded-b-sm ${dist.common.includes(note) ? 'bg-white/30' : 'bg-white/[0.14]'}`}
                  style={{ height: `${n ? Math.max(4, (n / maxBucket) * 100) : 2}%` }}
                />
              ))}
              <span className="absolute -top-1.5 -bottom-1 w-0.5 rounded-sm bg-bitter-lime" style={{ left: mark(myAvg) }} />
              {publicAverage > 0 && <span className="absolute -top-1.5 -bottom-1 border-l-2 border-dashed border-white/55" style={{ left: mark(publicAverage) }} />}
            </div>
            <div className="flex gap-1 mt-1.5">
              {dist.buckets.map((_, note) => (
                <span key={note} className="flex-1 text-center text-[9px] font-extrabold text-white/35 tabular-nums">{note}</span>
              ))}
            </div>
            <div className="flex gap-4 mt-2.5 text-[10.5px] font-extrabold text-white/60">
              <span className="inline-flex items-center gap-1.5"><i className="w-0.5 h-3 rounded-sm bg-bitter-lime" />{t('gouts.myAvg', { v: fmt1(myAvg) })}</span>
              {publicAverage > 0 && (
                <span className="inline-flex items-center gap-1.5"><i className="h-3 border-l-2 border-dashed border-white/55" />{t('gouts.publicAvg', { v: fmt1(publicAverage) })}</span>
              )}
            </div>
            {dist.common.length > 0 && (
              <p className="mt-3.5 pt-3 border-t border-white/[0.08] text-[13.5px] font-black tracking-[-0.02em] leading-snug text-white">
                {dist.common.length === 2
                  ? t('gouts.commonTwo', { a: String(dist.common[0]), b: String(dist.common[1]) })
                  : t('gouts.commonOne', { a: String(dist.common[0]) })}
                <small className="block mt-[3px] text-[11px] font-semibold tracking-normal text-white/60">
                  {t(dist.nines === 0 ? 'gouts.ninesNone' : 'gouts.nines', { n: String(dist.nines), total: String(dist.total) })}
                </small>
              </p>
            )}
          </div>
        </section>
      )}

      {/* 6 · Attente et réalité : seulement si l'attente est remplie. */}
      {hype.length > 0 && (
        <section className={sec}>
          <Head title={t('gouts.hype')} aside={t('gouts.hypeAside')} />
          <div className="flex flex-col">
            {hype.map((f, i) => (
              <button key={f.id} type="button" onClick={() => open(f.id)} className={`grid grid-cols-[40px_minmax(0,1fr)_auto] gap-3 items-center py-2.5 text-left ${i ? line : 'pt-0'} active:opacity-80`}>
                <Poster url={f.posterUrl} className="w-10 rounded-[7px]" />
                <span className="min-w-0">
                  <b className="block text-[13.5px] font-black tracking-[-0.02em] text-white truncate">{f.title}</b>
                  <small className="text-[10.5px] font-bold text-white/35 tabular-nums">
                    {t('gouts.hypeLine', { hype: fmt1(f.hype ?? 0), score: fmt1(f.score) })}
                  </small>
                </span>
                <em className={`not-italic text-[18px] font-black tracking-[-0.04em] tabular-nums ${f.gap < 0 ? 'text-[#F08A24]' : 'text-bitter-lime'}`}>
                  {f.gap > 0 ? '+' : '−'}
                  {fmt1(Math.abs(f.gap))}
                </em>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 7 · La bande originale : ta note Son, tes sommets, tes compositeurs. */}
      <SoundtrackSection movies={watched} />

      {/* 8 · Ton classement. */}
      <section ref={rankRef} className={`${sec} scroll-mt-6`}>
        <Head title={t('gouts.ranking')} aside={t('gouts.films', { n: String(ranked.length) })} />
        <div className="flex flex-col">
          {ranked.slice(0, shown).map((f, i) => (
            <button key={f.id} type="button" onClick={() => open(f.id)} className={`grid grid-cols-[22px_34px_minmax(0,1fr)_auto] gap-[11px] items-center py-2 text-left ${i ? line : ''} active:opacity-80`}>
              <span className={`text-[13px] font-black tabular-nums ${i < 3 ? 'text-bitter-lime' : 'text-white/35'}`}>{i + 1}</span>
              <Poster url={f.posterUrl} className="w-[34px] rounded-md" />
              <span className="min-w-0">
                <b className="block text-[13px] font-black tracking-[-0.015em] text-white truncate">{f.title}</b>
                <small className="text-[10px] font-bold text-white/35 truncate block">{[f.year, f.director].filter(Boolean).join(' · ')}</small>
              </span>
              <em className="not-italic text-[15px] font-black tabular-nums text-white">{fmt1(f.score)}</em>
            </button>
          ))}
        </div>
        {shown < ranked.length && (
          <button
            type="button"
            onClick={() => {
              haptics.soft();
              setShown((n) => (n <= 5 ? RANK_STEP : n + RANK_STEP));
            }}
            className="h-11 rounded-[14px] border border-white/[0.08] text-[12px] font-black text-white/60 active:scale-[0.98] transition-transform"
          >
            {shown <= 5 ? t('gouts.seeAll', { n: String(ranked.length) }) : t('gouts.seeMore')}
          </button>
        )}
      </section>
    </div>
  );
};

export default GoutsTab;
