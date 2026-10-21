import React from 'react';
import { Heart, Pause, Play } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { haptics } from '../../utils/haptics';
import { togglePreview, usePreviewPlayer } from '../../utils/previewPlayer';
import { trackLength, type SoundtrackTrack } from '../../services/soundtrack';

/**
 * Les morceaux d'un album, chacun avec son extrait et, si on peut aimer, un
 * cœur. Partagée par la liste complète (sombre) et la notation (claire).
 */
const TrackList: React.FC<{
  tracks: SoundtrackTrack[];
  tone: 'light' | 'dark';
  favorites?: number[];
  onToggleFavorite?: (trackId: number) => void;
  /** Numérote les morceaux : la liste complète oui, l'aperçu « les plus écoutés » aussi. */
  numbered?: boolean;
  /** Faux quand l'écran montre déjà l'avancée ailleurs (le bloc « En cours »). */
  showProgress?: boolean;
}> = ({ tracks, tone, favorites = [], onToggleFavorite, numbered = true, showProgress = true }) => {
  const { t } = useLanguage();
  const player = usePreviewPlayer();
  const dark = tone === 'dark';

  return (
    <ul className={dark ? 'divide-y divide-white/[0.06]' : 'divide-y divide-stone-100 dark:divide-white/5'}>
      {tracks.map((track, index) => {
        const current = player.trackId === track.id;
        const playing = current && player.playing;
        const liked = favorites.includes(track.id);
        const progress = current ? Math.min(100, (player.position / (player.length || 30)) * 100) : 0;
        return (
          <li key={track.id} className={current ? (dark ? 'bg-white/[0.04]' : 'bg-[#F2F7D9] dark:bg-bitter-lime/10') : undefined}>
            <div className="flex items-center gap-1 pr-1">
              <button
                type="button"
                onClick={() => {
                  haptics.soft();
                  togglePreview(track);
                }}
                aria-label={t(playing ? 'soundtrack.pause' : 'soundtrack.play', { title: track.title })}
                className={`w-11 h-11 shrink-0 flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 ${
                  dark
                    ? current ? 'text-bitter-lime focus-visible:ring-bitter-lime' : 'text-stone-100 focus-visible:ring-white'
                    : current ? 'text-forest dark:text-bitter-lime focus-visible:ring-forest' : 'text-charcoal dark:text-white focus-visible:ring-forest'
                }`}
              >
                {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
              </button>
              {numbered && (
                <span className={`w-5 shrink-0 text-right text-[11px] font-extrabold tabular-nums ${dark ? 'text-stone-500' : 'text-stone-400'}`}>
                  {index + 1}
                </span>
              )}
              <span
                className={`flex-1 min-w-0 truncate pl-2 text-[13.5px] font-extrabold ${
                  current ? (dark ? 'text-bitter-lime' : 'text-forest dark:text-bitter-lime') : dark ? 'text-stone-100' : 'text-charcoal dark:text-white'
                }`}
              >
                {track.title}
              </span>
              <span className={`shrink-0 pl-2 text-[11px] font-bold tabular-nums ${dark ? 'text-stone-500' : 'text-stone-400'}`}>
                {current && player.failed ? t('soundtrack.failed') : trackLength(track.duration)}
              </span>
              {onToggleFavorite && (
                <button
                  type="button"
                  onClick={() => {
                    haptics.soft();
                    onToggleFavorite(track.id);
                  }}
                  aria-pressed={liked}
                  aria-label={t(liked ? 'soundtrack.unlike' : 'soundtrack.like', { title: track.title })}
                  className={`w-11 h-11 shrink-0 flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest ${
                    liked ? (dark ? 'text-bitter-lime' : 'text-forest dark:text-bitter-lime') : 'text-stone-400'
                  }`}
                >
                  <Heart size={16} fill={liked ? 'currentColor' : 'none'} strokeWidth={2.2} />
                </button>
              )}
            </div>
            {current && showProgress && (
              <div className="flex items-center gap-2 pb-2.5 pl-11 pr-4" aria-hidden="true">
                <div className={`h-[3px] flex-1 overflow-hidden rounded-full ${dark ? 'bg-white/10' : 'bg-stone-200 dark:bg-white/10'}`}>
                  <div
                    className={`h-full rounded-full transition-[width] duration-200 ${dark ? 'bg-bitter-lime' : 'bg-forest dark:bg-bitter-lime'}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className={`text-[10px] font-extrabold tabular-nums ${dark ? 'text-stone-400' : 'text-forest dark:text-bitter-lime'}`}>
                  {trackLength(Math.floor(player.position))} / {trackLength(Math.round(player.length || 30))}
                </span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default TrackList;
