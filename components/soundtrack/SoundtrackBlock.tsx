import React, { useEffect, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { haptics } from '../../utils/haptics';
import { stopPreview, togglePreview, usePreviewPlayer } from '../../utils/previewPlayer';
import { albumDisplayTitle, albumLength, getSoundtrack, topTracks, type SoundtrackAlbum } from '../../services/soundtrack';
import TrackList from './TrackList';
import AlbumLinks from './AlbumLinks';
import SoundtrackSheet from './SoundtrackSheet';

/**
 * La bande originale dans la fiche d'un film : l'album, ses trois morceaux les
 * plus écoutés et leurs extraits, puis tous les titres en plein écran.
 *
 * Rien ne s'affiche tant que l'album n'est pas trouvé, ni quand il n'existe
 * pas : un bloc vide promettrait une musique absente.
 */
const SoundtrackBlock: React.FC<{
  tmdbId: number;
  /** Le titre affiché, souvent français : certains albums sortent sous lui. */
  title?: string;
  favorites?: number[];
  /** Absent : le film n'est pas dans la collection, on ne peut rien y ranger. */
  onToggleFavorite?: (trackId: number) => void;
  /** Pour l'ambiance de la liste complète : une image du film, ta note Son, ton avis. */
  backdrop?: string;
  sound?: number | null;
  review?: string;
}> = ({ tmdbId, title, favorites, onToggleFavorite, backdrop, sound, review }) => {
  const { t } = useLanguage();
  const [albums, setAlbums] = useState<SoundtrackAlbum[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const player = usePreviewPlayer();

  useEffect(() => {
    let alive = true;
    setAlbums(null);
    getSoundtrack(tmdbId, title)
      .then((found) => alive && setAlbums(found))
      .catch(() => alive && setAlbums([]));
    return () => {
      alive = false;
    };
  }, [tmdbId, title]);

  // La musique s'arrête avec la fiche.
  useEffect(() => () => stopPreview(), []);

  const album = albums?.[0];
  if (!album || album.tracks.length === 0) return null;

  const top = topTracks(album);
  const lead = top[0];
  const leadPlaying = !!lead && album.tracks.some((track) => track.id === player.trackId) && player.playing;

  return (
    <section className="mb-8" aria-labelledby="soundtrack-title">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 id="soundtrack-title" className="text-[10px] font-black uppercase tracking-widest text-stone-400">
          {t('soundtrack.title')}
        </h3>
        <span className="text-[10px] font-bold text-stone-400">{t('soundtrack.credit')}</span>
      </div>

      <div className="rounded-3xl border border-stone-200 bg-white p-3.5 space-y-3 dark:border-white/10 dark:bg-white/5">
        <div className="flex items-center gap-3.5">
          {album.cover && <img src={album.cover} alt="" className="w-[76px] h-[76px] shrink-0 rounded-[14px] object-cover" />}
          <div className="min-w-0 flex-1 space-y-0.5">
            <p title={album.title} className="text-base font-black leading-tight tracking-tight text-charcoal line-clamp-2 dark:text-white">{albumDisplayTitle(album)}</p>
            {album.artist && <p className="truncate text-[13px] font-extrabold text-forest dark:text-bitter-lime">{album.artist}</p>}
            <p className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">
              {t('soundtrack.meta', { n: String(album.trackCount || album.tracks.length), length: albumLength(album.duration) })}
            </p>
          </div>
          {lead && (
            <button
              type="button"
              onClick={() => {
                haptics.soft();
                const current = album.tracks.find((track) => track.id === player.trackId);
                togglePreview(current ?? lead);
              }}
              aria-label={t(leadPlaying ? 'soundtrack.pause' : 'soundtrack.play', { title: lead.title })}
              className="w-12 h-12 shrink-0 rounded-full bg-charcoal text-bitter-lime flex items-center justify-center active:scale-90 transition-transform dark:bg-bitter-lime dark:text-charcoal"
            >
              {leadPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            </button>
          )}
        </div>

        <div className="border-t border-stone-100 pt-1 dark:border-white/5">
          <p className="pt-2 pb-1 text-[10px] font-black uppercase tracking-[0.14em] text-stone-400">{t('soundtrack.top')}</p>
          <TrackList tracks={top} tone="light" />
          {album.tracks.length > top.length && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="min-h-11 py-2 text-xs font-extrabold text-forest underline underline-offset-[3px] dark:text-bitter-lime"
            >
              {t('soundtrack.seeAll', { n: String(album.tracks.length) })}
            </button>
          )}
        </div>

        <AlbumLinks album={album} tone="light" />
      </div>

      {showAll && albums && (
        <SoundtrackSheet
          albums={albums}
          filmTitle={title}
          backdrop={backdrop}
          sound={sound}
          review={review}
          favorites={favorites}
          onToggleFavorite={onToggleFavorite}
          onClose={() => setShowAll(false)}
        />
      )}
    </section>
  );
};

export default SoundtrackBlock;
