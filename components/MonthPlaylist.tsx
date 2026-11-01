import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, ExternalLink, Loader2, Music2, Pause, Play, Plus, X } from 'lucide-react';
import { Movie } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import { haptics } from '../utils/haptics';
import { stopPreview, togglePreview, usePreviewPlayer } from '../utils/previewPlayer';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { readSoundtrack } from '../utils/soundtrackTags';
import { getDisplayWeightedRating } from '../utils/rating';
import { btnPrimary, btnSecondary, chip, sectionLabel, sheetFrame } from '../utils/ui';
import { getSoundtrack, type SoundtrackTrack } from '../services/soundtrack';
import {
  PlaylistResult,
  createSpotifyPlaylist,
  isSpotifyConnected,
  spotifyAvailable,
  startSpotifyLogin,
  takePendingPlaylist,
} from '../services/spotify';

/**
 * « Ton mois ciné en musique » : un morceau de BO par film vu dans le mois —
 * tes coups de cœur de la fiche quand il y en a, sinon le plus écouté.
 *
 * La playlist se crée dans Spotify (voir services/spotify.ts pour les limites
 * du mode développement) ; sans Spotify, on peut toujours écouter les extraits
 * et copier la liste.
 */

interface PlaylistItem {
  movie: Movie;
  track: SoundtrackTrack;
  artist: string;
}

const monthKey = (time: number) => {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

/** Les films d'un mois, du premier vu au dernier : des films, avec une fiche TMDB. */
const filmsOf = (movies: Movie[], key: string) =>
  movies
    .filter((m) => m.dateWatched && m.tmdbId != null && (m.mediaType ?? 'movie') === 'movie' && monthKey(m.dateWatched) === key)
    .sort((a, b) => (a.dateWatched ?? 0) - (b.dateWatched ?? 0));

async function itemsFor(movies: Movie[]): Promise<PlaylistItem[]> {
  const found = await Promise.all(
    movies.map(async (movie) => {
      try {
        const albums = await getSoundtrack(movie.tmdbId!, movie.title);
        const favorites = readSoundtrack(movie.tags).favorites;
        const picks: PlaylistItem[] = [];
        for (const album of albums) {
          album.tracks
            .filter((track) => favorites.includes(track.id))
            .forEach((track) => picks.push({ movie, track, artist: album.artist }));
        }
        if (picks.length) return picks;
        const album = albums.find((item) => item.tracks.length);
        if (!album) return [];
        const top = [...album.tracks].sort((a, b) => b.rank - a.rank)[0];
        return [{ movie, track: top, artist: album.artist }];
      } catch {
        return [];
      }
    })
  );
  return found.flat();
}

const MonthPlaylistSheet: React.FC<{
  monthLabel: string;
  films: Movie[];
  autoCreate: boolean;
  returnError: boolean;
  onClose: () => void;
}> = ({ monthLabel, films, autoCreate, returnError, onClose }) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, t('playlist.title'));
  const player = usePreviewPlayer();
  const [items, setItems] = useState<PlaylistItem[] | null>(null);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [creating, setCreating] = useState<number | null>(null);
  const [result, setResult] = useState<PlaylistResult | null>(null);
  const [error, setError] = useState<string | null>(returnError ? t('playlist.loginFailed') : null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    itemsFor(films).then((list) => alive && setItems(list));
    return () => {
      alive = false;
    };
  }, [films]);

  useEffect(() => () => stopPreview(), []);

  const shown = useMemo(() => {
    if (!items) return [];
    if (!onlyFavorites) return items;
    return items.filter((item) => readSoundtrack(item.movie.tags).favorites.includes(item.track.id));
  }, [items, onlyFavorites]);
  const hasFavorites = !!items?.some((item) => readSoundtrack(item.movie.tags).favorites.includes(item.track.id));

  const create = async () => {
    if (!shown.length) return;
    setError(null);
    if (!isSpotifyConnected()) {
      await startSpotifyLogin(films.length ? monthKey(films[0].dateWatched!) : '');
      return;
    }
    haptics.medium();
    setCreating(0);
    try {
      const made = await createSpotifyPlaylist(
        t('playlist.spotifyName', { month: monthLabel }),
        t('playlist.spotifyDescription'),
        shown.map((item) => ({ title: item.track.title, artist: item.artist })),
        setCreating
      );
      if (!made) {
        await startSpotifyLogin(monthKey(films[0].dateWatched!));
        return;
      }
      haptics.success();
      setResult(made);
    } catch (failure) {
      const message = (failure as Error).message;
      setError(
        message === 'spotify-auth'
          ? t('playlist.notAllowed')
          : message === 'spotify-nothing-found'
            ? t('playlist.nothingFound')
            : t('playlist.failed')
      );
    } finally {
      setCreating(null);
    }
  };

  // Retour de Spotify : la création reprend d'elle-même, une fois la liste prête.
  const [resumed, setResumed] = useState(false);
  useEffect(() => {
    if (!autoCreate || resumed || !items || !items.length) return;
    setResumed(true);
    void create();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCreate, resumed, items]);

  const copy = async () => {
    const text = [
      t('playlist.spotifyName', { month: monthLabel }),
      ...shown.map((item) => `${item.track.title} — ${item.artist} (${item.movie.title})`),
    ].join('\n');
    try {
      if (navigator.share) await navigator.share({ title: t('playlist.title'), text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }
    } catch {
      // Partage annulé : rien à signaler.
    }
  };

  const covers = films.filter((film) => film.posterUrl).slice(0, 4);

  return createPortal(
    <div {...dialog.props} className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(event) => event.stopPropagation()}
        className={`max-h-[94dvh] w-full max-w-md overflow-y-auto bg-cream px-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-5 text-charcoal dark:bg-[#161616] dark:text-white ${sheetFrame}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-end gap-4">
            <div className="grid h-28 w-28 shrink-0 -rotate-3 grid-cols-2 overflow-hidden rounded-[20px] bg-forest shadow-lg" aria-hidden="true">
              {covers.map((film) => (
                <img key={film.id} src={resizeTmdbImage(film.posterUrl!, 'w185')} alt="" className="h-full w-full object-cover" />
              ))}
            </div>
            <div className="min-w-0 pb-1">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-forest dark:text-bitter-lime">{monthLabel}</p>
              <h2 className="mt-1 text-[26px] font-black leading-[0.95] tracking-[-0.055em]">{t('playlist.title')}</h2>
              <p className="mt-2 text-xs font-semibold text-stone-500 dark:text-stone-400">
                {t('playlist.meta', { films: films.length, tracks: shown.length })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sand dark:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        {hasFavorites && (
          <div className="mt-5 flex gap-2">
            <button type="button" aria-pressed={!onlyFavorites} onClick={() => setOnlyFavorites(false)} className={chip(!onlyFavorites)}>
              {t('playlist.onePerFilm')}
            </button>
            <button type="button" aria-pressed={onlyFavorites} onClick={() => setOnlyFavorites(true)} className={chip(onlyFavorites)}>
              {t('playlist.favorites')}
            </button>
          </div>
        )}

        <div className="mt-4">
          {items === null ? (
            <div className="flex items-center gap-2 py-8 text-sm font-bold text-stone-500">
              <Loader2 size={16} className="animate-spin" />
              {t('playlist.loading')}
            </div>
          ) : shown.length === 0 ? (
            <p className="py-6 text-sm text-stone-500 dark:text-stone-400">{t('playlist.empty')}</p>
          ) : (
            <ul className="divide-y divide-stone-100 dark:divide-white/5">
              {shown.map((item) => {
                const current = player.trackId === item.track.id;
                const playing = current && player.playing;
                const note = getDisplayWeightedRating(item.movie);
                return (
                  <li key={`${item.movie.id}-${item.track.id}`} className="flex items-center gap-3 py-2">
                    <button
                      type="button"
                      onClick={() => {
                        haptics.soft();
                        togglePreview(item.track);
                      }}
                      aria-label={t(playing ? 'soundtrack.pause' : 'soundtrack.play', { title: item.track.title })}
                      className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-forest"
                    >
                      {item.movie.posterUrl && (
                        <img src={resizeTmdbImage(item.movie.posterUrl, 'w92')} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      )}
                      <span className={`absolute inset-0 flex items-center justify-center ${current ? 'bg-black/50' : 'bg-black/25'} text-white`}>
                        {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                      </span>
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-extrabold tracking-tight ${current ? 'text-forest dark:text-bitter-lime' : ''}`}>{item.track.title}</p>
                      <p className="truncate text-[11px] font-semibold text-stone-500 dark:text-stone-400">
                        {item.artist} · <span className="text-charcoal dark:text-white">{item.movie.title}</span>
                      </p>
                    </div>
                    {note > 0 && (
                      <span className="shrink-0 rounded-full bg-charcoal px-2 py-1 text-[11px] font-black tabular-nums text-bitter-lime">
                        {String(Math.round(note * 10) / 10).replace('.', ',')}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-xs font-bold text-[#C2410C] dark:text-[#F08A24]">
            {error}
          </p>
        )}

        {result ? (
          <div className="mt-5 flex flex-col gap-2 rounded-[22px] bg-sand p-4 dark:bg-white/5">
            <p className="flex items-center gap-2 text-sm font-black">
              <Check size={16} className="text-forest dark:text-bitter-lime" />
              {t('playlist.created', { found: result.found, total: result.total })}
            </p>
            <a href={result.url} target="_blank" rel="noopener noreferrer" className={`${btnPrimary} w-full`}>
              <ExternalLink size={15} />
              {t('playlist.openSpotify')}
            </a>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-2">
            {spotifyAvailable && (
              <button type="button" disabled={!shown.length || creating !== null} onClick={create} className={`${btnPrimary} w-full`}>
                {creating !== null ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} strokeWidth={3} />}
                {creating !== null ? t('playlist.searching', { n: creating, total: shown.length }) : t('playlist.createSpotify')}
              </button>
            )}
            <button type="button" disabled={!shown.length} onClick={copy} className={`${btnSecondary} w-full`}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? t('playlist.copied') : t('playlist.copy')}
            </button>
            {spotifyAvailable && <p className="text-center text-[11px] text-stone-500 dark:text-stone-400">{t('playlist.spotifyNote')}</p>}
          </div>
        )}
        <p className="mt-3 text-center text-[10px] font-bold text-stone-400">{t('soundtrack.credit')}</p>
      </div>
    </div>,
    document.body
  );
};

/** La carte de la page Stats : le mois le plus récent qui a des films vus, parmi les trois derniers. */
const MonthPlaylistCard: React.FC<{ movies: Movie[] }> = ({ movies }) => {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState<{ key: string; autoCreate: boolean; returnError: boolean } | null>(null);

  const months = useMemo(() => {
    const now = new Date();
    return [0, 1, 2]
      .map((back) => monthKey(new Date(now.getFullYear(), now.getMonth() - back, 1).getTime()))
      .map((key) => ({ key, films: filmsOf(movies, key) }))
      .filter((month) => month.films.length > 0);
  }, [movies]);

  const labelOf = (key: string) => {
    const [year, month] = key.split('-').map(Number);
    const label = new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', { month: 'long', year: 'numeric' }).format(
      new Date(year, month - 1, 1)
    );
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  // Retour de Spotify : on rouvre le mois qu'on était en train de mettre en playlist.
  useEffect(() => {
    const pending = takePendingPlaylist();
    if (pending == null) return;
    const key = /^\d{4}-\d{2}$/.test(pending) ? pending : months[0]?.key;
    if (!key) return;
    const connected = isSpotifyConnected();
    setOpen({ key, autoCreate: connected, returnError: !connected });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selected, setSelected] = useState(0);
  // Mémorisée : une nouvelle liste à chaque rendu relancerait la recherche des BO.
  const openFilms = useMemo(() => (open ? filmsOf(movies, open.key) : []), [movies, open]);
  const month = months[Math.min(selected, months.length - 1)];
  if (!month && !open) return null;

  return (
    <>
      {month && (
        <section className="relative isolate overflow-hidden rounded-[2rem] border border-white/10 bg-[#111] p-5 text-white">
          <Music2 aria-hidden="true" size={110} className="pointer-events-none absolute -right-5 -top-5 -z-10 rotate-12 text-white/[0.06]" />
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-bitter-lime">{t('playlist.label')}</p>
          <h3 className="mt-1.5 text-[24px] font-black leading-[0.95] tracking-[-0.05em]">{t('playlist.title')}</h3>
          <p className="mt-2 text-xs font-semibold text-stone-300">
            {t('playlist.cardBody', { month: labelOf(month.key).toLowerCase(), n: month.films.length })}
          </p>
          {months.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {months.map((item, i) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={i === selected}
                  onClick={() => setSelected(i)}
                  className={`h-9 rounded-full px-3.5 text-xs font-extrabold transition active:scale-95 ${
                    i === selected ? 'bg-white text-charcoal' : 'border border-white/15 text-stone-300'
                  }`}
                >
                  {labelOf(item.key).split(' ')[0]}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              haptics.soft();
              setOpen({ key: month.key, autoCreate: false, returnError: false });
            }}
            className={`${btnPrimary} mt-4 w-full`}
          >
            <Music2 size={15} />
            {t('playlist.open')}
          </button>
          <p className={`${sectionLabel} mt-3 !normal-case !tracking-normal !text-stone-400 !font-semibold !text-[11px]`}>
            {t('soundtrack.credit')}
          </p>
        </section>
      )}
      {open && openFilms.length > 0 && (
        <MonthPlaylistSheet
          monthLabel={labelOf(open.key)}
          films={openFilms}
          autoCreate={open.autoCreate}
          returnError={open.returnError}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
};

export default MonthPlaylistCard;
