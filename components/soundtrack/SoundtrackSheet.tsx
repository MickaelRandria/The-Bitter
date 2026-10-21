import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Pause, Play } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useDialog } from '../../utils/useDialog';
import { togglePreview, usePreviewPlayer } from '../../utils/previewPlayer';
import { reviewFragments } from '../../utils/soundScore';
import { albumDisplayTitle, albumLength, type SoundtrackAlbum } from '../../services/soundtrack';
import TrackList from './TrackList';
import AlbumLinks from './AlbumLinks';

/**
 * Tous les titres de la bande originale, en plein écran sombre.
 *
 * On y entre dans le film : son image, floue, teinte le haut de l'écran et
 * s'estompe à la pause ; la pochette respire pendant l'extrait ; le bloc « En
 * cours » déroule ton avis au rythme des 30 secondes. Deux albums (musique
 * composée, chansons) : deux onglets.
 */
const SoundtrackSheet: React.FC<{
  albums: SoundtrackAlbum[];
  /** Le titre du film, plus parlant que celui de l'album. */
  filmTitle?: string;
  /** Une image du film pour l'ambiance ; la pochette sert à défaut. */
  backdrop?: string;
  /** Ta note Son, si le film est noté. */
  sound?: number | null;
  /** Ton avis écrit, déroulé pendant l'extrait. */
  review?: string;
  favorites?: number[];
  onToggleFavorite?: (trackId: number) => void;
  onClose: () => void;
}> = ({ albums, filmTitle, backdrop, sound, review, favorites, onToggleFavorite, onClose }) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, t('soundtrack.title'));
  const [index, setIndex] = useState(0);
  const player = usePreviewPlayer();
  const album = albums[Math.min(index, albums.length - 1)];
  const current = albums.flatMap((a) => a.tracks).find((track) => track.id === player.trackId);
  const live = !!current && player.playing;
  const fragments = reviewFragments(review);
  const fragment = fragments.length
    ? fragments[Math.min(fragments.length - 1, Math.floor((player.position / (player.length || 30)) * fragments.length))]
    : null;
  const progress = current ? Math.min(100, (player.position / (player.length || 30)) * 100) : 0;
  const ambient = backdrop || album.cover;

  return createPortal(
    <div
      {...dialog.props}
      className="fixed inset-0 z-[230] flex flex-col overflow-hidden bg-[#0c0c0c] text-stone-100"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {ambient && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <img
            src={ambient}
            alt=""
            className="bo-ambient absolute left-0 top-0 h-[60%] w-full object-cover blur-[46px] saturate-[1.15] brightness-50 transition-opacity duration-1000"
            style={{ opacity: live ? 1 : 0.45, animationPlayState: live ? 'running' : 'paused' }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0c0c0c]/20 via-[#0c0c0c]/70 via-40% to-[#0c0c0c] to-[62%]" />
        </div>
      )}

      <div className="relative mx-auto flex w-full max-w-md flex-1 min-h-0 flex-col">
        <div className="flex items-center justify-between px-5 pt-5">
          <button
            type="button"
            onClick={onClose}
            aria-label={t('soundtrack.back')}
            className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform"
          >
            <ChevronLeft size={18} strokeWidth={2.5} />
          </button>
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-300">{t('soundtrack.title')}</span>
          <span className="w-11" aria-hidden="true" />
        </div>

        <div className="flex items-center gap-4 px-6 pt-4">
          {album.cover && (
            <div className="relative h-[124px] w-[124px] shrink-0">
              <img
                src={album.cover}
                alt=""
                aria-hidden="true"
                className="bo-glow absolute inset-1.5 h-[112px] w-[112px] rounded-[22px] object-cover blur-[22px]"
                style={{ animationPlayState: live ? 'running' : 'paused' }}
              />
              <img src={album.cover} alt="" className="relative h-[124px] w-[124px] rounded-[18px] object-cover shadow-[0_18px_34px_rgba(0,0,0,0.5)]" />
            </div>
          )}
          <div className="min-w-0 space-y-1">
            <p title={album.title} className="text-[22px] font-black leading-[1.05] tracking-[-0.03em] line-clamp-2">
              {filmTitle || albumDisplayTitle(album)}
            </p>
            {album.artist && <p className="truncate text-[13px] font-extrabold text-bitter-lime">{album.artist}</p>}
            <p className="text-[11px] font-semibold text-stone-400">
              {t('soundtrack.albumMeta', { n: String(album.trackCount || album.tracks.length), length: albumLength(album.duration) })}
            </p>
            {sound != null && (
              <span className="mt-1 inline-block rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.05em]">
                {t('soundtrack.yourSound', { n: String(sound).replace('.', ',') })}
              </span>
            )}
          </div>
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

        <div className="px-6 pt-4">
          <AlbumLinks album={album} tone="dark" />
        </div>

        {current && (
          <div className="mx-4 mt-4 space-y-2.5 rounded-[22px] border border-white/[0.08] bg-white/[0.07] px-4 py-3.5">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="flex h-3.5 w-3.5 items-end gap-[2px]">
                {[0, -0.3, -0.6].map((delay) => (
                  <span
                    key={delay}
                    className="bo-eq block h-full w-[3px] bg-bitter-lime"
                    style={{ animationDelay: `${delay}s`, animationPlayState: live ? 'running' : 'paused' }}
                  />
                ))}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-stone-400">
                  {t(live ? 'soundtrack.nowPlaying' : 'soundtrack.paused')}
                </p>
                <p className="truncate text-[17px] font-black tracking-[-0.02em]">{current.title}</p>
              </div>
              <button
                type="button"
                onClick={() => togglePreview(current)}
                aria-label={t(live ? 'soundtrack.pause' : 'soundtrack.play', { title: current.title })}
                className="w-12 h-12 shrink-0 rounded-full bg-bitter-lime text-charcoal flex items-center justify-center active:scale-90 transition-transform"
              >
                {live ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
              </button>
            </div>
            <div className="h-[3px] overflow-hidden rounded-full bg-white/10" aria-hidden="true">
              <div className="h-full bg-bitter-lime transition-[width] duration-200" style={{ width: `${progress}%` }} />
            </div>
            {fragment && (
              <p className="text-[12.5px] font-semibold leading-snug text-stone-400">
                {t('soundtrack.yourReview')} · <span className="text-stone-100">« {fragment} »</span>
              </p>
            )}
          </div>
        )}

        <div className="mt-2.5 flex-1 min-h-0 overflow-y-auto pl-4 pr-3">
          <TrackList
            tracks={album.tracks}
            tone="dark"
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
            showProgress={false}
          />
          <p className="px-2 pt-3 pb-5 text-[10.5px] font-semibold leading-snug text-stone-500">
            {t(onToggleFavorite ? 'soundtrack.sheetHint' : 'soundtrack.credit')}
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SoundtrackSheet;
