import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { haptics } from '../../utils/haptics';
import { onPreviewEnded, stopPreview, togglePreview, usePreviewPlayer } from '../../utils/previewPlayer';
import { usePosterTint } from '../../utils/posterTint';
import { resizeTmdbImage } from '../../utils/tmdbImage';
import { getSoundtrack, type SoundtrackAlbum } from '../../services/soundtrack';
import AlbumLinks from './AlbumLinks';

/**
 * « Dans l'ambiance » : la BO du film sur l'écran du trajet, pour la route.
 *
 * Les extraits de 30 s s'enchaînent dans l'ordre de l'album ; les liens
 * Deezer, Spotify et Apple Music ouvrent l'album entier dans l'appli de chacun.
 * Rien ne s'affiche tant que l'album n'est pas trouvé, ni quand il n'existe pas.
 */

const FALLBACK_TINT = '#1d2a38';

const RouteAmbiance: React.FC<{ tmdbId: number; title: string; posterUrl?: string }> = ({ tmdbId, title, posterUrl }) => {
  const { t } = useLanguage();
  const [album, setAlbum] = useState<SoundtrackAlbum | null>(null);
  const [index, setIndex] = useState(0);
  const player = usePreviewPlayer();
  const tint = usePosterTint(posterUrl ? resizeTmdbImage(posterUrl, 'w92') : undefined);

  useEffect(() => {
    let alive = true;
    getSoundtrack(tmdbId, title)
      .then((albums) => {
        // La musique composée d'abord ; un album sans extrait ne sert à rien ici.
        const found = albums.find((item) => item.tracks.some((track) => track.preview)) ?? null;
        if (alive) setAlbum(found);
      })
      .catch(() => alive && setAlbum(null));
    return () => {
      alive = false;
    };
  }, [tmdbId, title]);

  // La musique s'arrête avec l'écran du trajet.
  useEffect(() => () => stopPreview(), []);

  const tracks = album?.tracks ?? [];
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;

  // Un extrait fini lance le suivant, tant qu'il en reste.
  useEffect(
    () =>
      onPreviewEnded((endedId) => {
        const list = tracksRef.current;
        const at = list.findIndex((track) => track.id === endedId);
        if (at < 0 || at + 1 >= list.length) return;
        setIndex(at + 1);
        togglePreview(list[at + 1]);
      }),
    []
  );

  if (!album || tracks.length === 0) return null;

  const current = tracks[Math.min(index, tracks.length - 1)];
  const isCurrent = player.trackId === current.id;
  const playing = isCurrent && player.playing;
  const progress = isCurrent ? Math.min(100, (player.position / (player.length || 30)) * 100) : 0;

  const go = (next: number) => {
    if (next < 0 || next >= tracks.length) return;
    haptics.soft();
    setIndex(next);
    togglePreview(tracks[next]);
  };

  return (
    <section
      aria-label={t('ambiance.title')}
      className="relative isolate overflow-hidden rounded-[26px] p-5 text-white"
      style={{ background: tint ?? FALLBACK_TINT }}
    >
      {album.cover && (
        <img
          src={album.cover}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-6 -top-5 -z-10 h-36 w-36 rotate-[8deg] rounded-[18px] object-cover opacity-50"
        />
      )}
      <div className="pr-24">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-bitter-lime">{t('ambiance.title')}</p>
        <p className="mt-1 text-xs font-semibold leading-snug text-stone-300">{t('ambiance.body')}</p>
      </div>

      <div className="mt-4 min-w-0">
        <p className="truncate text-lg font-black tracking-[-0.04em]">{current.title}</p>
        <p className="truncate text-xs font-semibold text-stone-300">
          {[album.artist, t('ambiance.position', { n: Math.min(index, tracks.length - 1) + 1, total: tracks.length })]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
        <div className="h-full rounded-full bg-bitter-lime transition-[width] duration-200" style={{ width: `${progress}%` }} />
      </div>
      {isCurrent && player.failed && <p className="mt-2 text-[11px] font-bold text-stone-300">{t('soundtrack.failed')}</p>}

      <div className="mt-3 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          aria-label={t('ambiance.previous')}
          className="flex h-11 w-11 items-center justify-center rounded-full text-white transition active:scale-90 disabled:opacity-30"
        >
          <SkipBack size={20} fill="currentColor" />
        </button>
        <button
          type="button"
          onClick={() => {
            haptics.soft();
            togglePreview(current);
          }}
          aria-label={t(playing ? 'soundtrack.pause' : 'soundtrack.play', { title: current.title })}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-bitter-lime text-[#111] transition active:scale-90"
        >
          {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
        </button>
        <button
          type="button"
          onClick={() => go(index + 1)}
          disabled={index >= tracks.length - 1}
          aria-label={t('ambiance.next')}
          className="flex h-11 w-11 items-center justify-center rounded-full text-white transition active:scale-90 disabled:opacity-30"
        >
          <SkipForward size={20} fill="currentColor" />
        </button>
      </div>

      <div className="mt-3">
        <AlbumLinks album={album} tone="dark" />
      </div>
      <p className="mt-2 text-center text-[10px] font-bold text-stone-400">{t('soundtrack.credit')}</p>
    </section>
  );
};

export default RouteAmbiance;
