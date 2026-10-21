import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Pause, Play } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useDialog } from '../../utils/useDialog';
import { togglePreview, usePreviewPlayer } from '../../utils/previewPlayer';
import { albumDisplayTitle, albumLength, type SoundtrackAlbum } from '../../services/soundtrack';
import TrackList from './TrackList';
import AlbumLinks from './AlbumLinks';

/**
 * Tous les titres de la bande originale, en plein écran sombre : l'album passe
 * au premier plan. Deux albums (musique composée, chansons) : deux onglets.
 */
const SoundtrackSheet: React.FC<{
  albums: SoundtrackAlbum[];
  favorites?: number[];
  onToggleFavorite?: (trackId: number) => void;
  onClose: () => void;
}> = ({ albums, favorites, onToggleFavorite, onClose }) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, t('soundtrack.title'));
  const [index, setIndex] = useState(0);
  const player = usePreviewPlayer();
  const album = albums[Math.min(index, albums.length - 1)];
  const current = albums.flatMap((a) => a.tracks).find((track) => track.id === player.trackId);

  return createPortal(
    <div
      {...dialog.props}
      className="fixed inset-0 z-[230] flex flex-col bg-[#111] text-stone-100"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex w-full max-w-md flex-1 min-h-0 flex-col">
        <div className="flex items-center justify-between px-5 pt-5">
          <button
            type="button"
            onClick={onClose}
            aria-label={t('soundtrack.back')}
            className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform"
          >
            <ChevronLeft size={18} strokeWidth={2.5} />
          </button>
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-400">{t('soundtrack.title')}</span>
          <span className="w-11" aria-hidden="true" />
        </div>

        {albums.length > 1 && (
          <div role="tablist" aria-label={t('soundtrack.title')} className="mx-6 mt-4 flex rounded-full bg-white/10 p-1">
            {albums.map((a, i) => (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                onClick={() => setIndex(i)}
                className={`flex-1 h-9 rounded-full text-[11px] font-black ${i === index ? 'bg-white text-charcoal' : 'text-stone-300'}`}
              >
                {t(a.kind === 'songs' ? 'soundtrack.songs' : 'soundtrack.score')}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-4 px-6 pt-4">
          {album.cover && (
            <img src={album.cover} alt="" className="w-[120px] h-[120px] shrink-0 rounded-[18px] object-cover shadow-2xl" />
          )}
          <div className="min-w-0 space-y-1">
            <p title={album.title} className="text-xl font-black leading-tight tracking-tight line-clamp-3">{albumDisplayTitle(album)}</p>
            {album.artist && <p className="text-[13px] font-extrabold text-bitter-lime truncate">{album.artist}</p>}
            <p className="text-[11px] font-semibold text-stone-400">
              {t('soundtrack.meta', { n: String(album.trackCount || album.tracks.length), length: albumLength(album.duration) })}
            </p>
          </div>
        </div>

        <div className="px-6 pt-4">
          <AlbumLinks album={album} tone="dark" />
        </div>

        <div className="mt-3 flex-1 min-h-0 overflow-y-auto pl-4 pr-3">
          <TrackList tracks={album.tracks} tone="dark" favorites={favorites} onToggleFavorite={onToggleFavorite} />
          <p className="px-2 pt-3 pb-5 text-[10.5px] font-semibold leading-snug text-stone-500">
            {t(onToggleFavorite ? 'soundtrack.sheetHint' : 'soundtrack.credit')}
          </p>
        </div>

        {current && (
          <div className="mx-3 mb-3 flex items-center gap-3 rounded-[20px] border border-white/10 bg-[#1F1F1F] p-2.5">
            {album.cover && <img src={album.cover} alt="" className="w-11 h-11 rounded-[10px] object-cover" />}
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-black">{current.title}</p>
              <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                <div
                  className="h-full bg-bitter-lime transition-[width] duration-200"
                  style={{ width: `${Math.min(100, (player.position / (player.length || 30)) * 100)}%` }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => togglePreview(current)}
              aria-label={t(player.playing ? 'soundtrack.pause' : 'soundtrack.play', { title: current.title })}
              className="w-11 h-11 shrink-0 rounded-full bg-bitter-lime text-charcoal flex items-center justify-center"
            >
              {player.playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default SoundtrackSheet;
