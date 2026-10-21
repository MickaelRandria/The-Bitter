import React, { useEffect, useState } from 'react';
import { ChevronDown, Music } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { haptics } from '../../utils/haptics';
import { stopPreview } from '../../utils/previewPlayer';
import { getSoundtrack, type SoundtrackAlbum } from '../../services/soundtrack';
import { readSoundtrack, toggleFavorite, withVerdict, type SoundtrackVerdict } from '../../utils/soundtrackTags';
import TrackList from './TrackList';

const VERDICTS: SoundtrackVerdict[] = ['unnoticed', 'good', 'memorable'];

/**
 * La bande originale, sous le critère Sonore de la notation.
 *
 * Facultatif et sans effet sur la note : un verdict en un toucher, puis, pour
 * qui veut, tous les titres à réécouter et un cœur sur celui qui est resté.
 * L'avis vit dans les tags du film (utils/soundtrackTags).
 */
const SoundtrackRatingPanel: React.FC<{
  tmdbId: number;
  title?: string;
  tags?: string[];
  onTagsChange: (tags: string[]) => void;
}> = ({ tmdbId, title, tags, onTagsChange }) => {
  const { t } = useLanguage();
  const [albums, setAlbums] = useState<SoundtrackAlbum[] | null>(null);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const opinion = readSoundtrack(tags);

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

  useEffect(() => () => stopPreview(), []);

  const album = albums?.[Math.min(index, (albums?.length ?? 1) - 1)];
  if (!albums || !album || album.tracks.length === 0) return null;
  const count = album.tracks.length;

  return (
    <div className="mt-4 space-y-3 border-t border-dashed border-stone-300 pt-4 dark:border-white/15">
      <div className="flex items-center gap-2.5">
        {albums[0].cover && <img src={albums[0].cover} alt="" className="w-9 h-9 shrink-0 rounded-[9px] object-cover" />}
        <div className="min-w-0">
          <p className="text-[13px] font-black text-charcoal dark:text-white">
            {albums[0].artist ? t('soundtrack.question', { artist: albums[0].artist }) : t('soundtrack.questionNoArtist')}
          </p>
          <p className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">{t('soundtrack.optional')}</p>
        </div>
      </div>

      <div role="radiogroup" aria-label={t('soundtrack.verdictLabel')} className="grid grid-cols-3 gap-1.5">
        {VERDICTS.map((verdict) => {
          const on = opinion.verdict === verdict;
          return (
            <button
              key={verdict}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                haptics.soft();
                onTagsChange(withVerdict(tags, on ? null : verdict));
              }}
              className={`h-11 rounded-xl border-[1.5px] text-[11.5px] font-black transition-colors ${
                on
                  ? 'border-forest bg-forest text-white dark:border-bitter-lime dark:bg-bitter-lime dark:text-charcoal'
                  : 'border-stone-200 bg-white text-charcoal dark:border-white/10 dark:bg-[#161616] dark:text-white'
              }`}
            >
              {t(`soundtrack.verdict.${verdict}`)}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => {
          haptics.soft();
          setOpen((value) => !value);
        }}
        aria-expanded={open}
        className="flex h-11 w-full items-center gap-2.5 rounded-xl bg-stone-100 px-3 text-left text-charcoal dark:bg-white/5 dark:text-white"
      >
        <Music size={16} className="shrink-0 text-forest dark:text-bitter-lime" />
        <span className="flex-1 text-[13px] font-extrabold">
          {t(open ? 'soundtrack.hide' : 'soundtrack.listen', { n: String(count) })}
        </span>
        <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400">{t('soundtrack.previews')}</span>
        <ChevronDown size={15} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-1.5">
          {albums.length > 1 && (
            <div role="tablist" className="flex rounded-full bg-stone-100 p-1 dark:bg-white/5">
              {albums.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  onClick={() => setIndex(i)}
                  className={`flex-1 h-9 rounded-full text-[11px] font-black ${
                    i === index ? 'bg-white text-charcoal shadow-sm dark:bg-[#222] dark:text-white' : 'text-stone-500'
                  }`}
                >
                  {t(a.kind === 'songs' ? 'soundtrack.songs' : 'soundtrack.score')}
                </button>
              ))}
            </div>
          )}
          {opinion.verdict === 'memorable' && (
            <p className="text-[11px] font-bold text-forest dark:text-bitter-lime">{t('soundtrack.heartHint')}</p>
          )}
          <div className="max-h-60 overflow-y-auto rounded-2xl border border-stone-100 bg-white dark:border-white/10 dark:bg-[#161616]">
            <TrackList
              tracks={album.tracks}
              tone="light"
              numbered={false}
              favorites={opinion.favorites}
              onToggleFavorite={(trackId) => onTagsChange(toggleFavorite(tags, trackId))}
            />
          </div>
          <p className="text-[10px] font-semibold leading-snug text-stone-500 dark:text-stone-400">{t('soundtrack.credit')}</p>
        </div>
      )}
    </div>
  );
};

export default SoundtrackRatingPanel;
