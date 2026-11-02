import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Share2 } from 'lucide-react';
import ActionSheet from './ActionSheet';
import type { CinemaScreening } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { ensureStoryFonts, loadImage } from '../utils/photoStoryRender';
import { monthScreenings, type MonthShareOptions, type MonthShareVariant } from '../utils/monthShare';
import { drawMonthShare } from '../utils/monthShareRender';
import { shareImage } from '../utils/shareImage';

interface Props {
  /** AAAA-MM */
  month: string;
  screenings: CinemaScreening[];
  firstName?: string;
  onClose: () => void;
  onToast?: (message: string) => void;
}

/**
 * « Partager mon mois » : une image des séances du mois, à envoyer à ses
 * proches. Deux formats (calendrier, programme), les cinémas et les séances
 * passées au choix ; l'aperçu est l'image exacte qui part.
 */
export default function MonthShareSheet({ month, screenings, firstName, onClose, onToast }: Props) {
  const { t, language } = useLanguage();
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  const [options, setOptions] = useState<MonthShareOptions>({ variant: 'calendar', showCinema: true, includePast: false });
  const [preview, setPreview] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const posters = useRef(new Map<string, HTMLImageElement | null>());
  const now = useMemo(() => Date.now(), []);

  const list = useMemo(() => monthScreenings(screenings, month, options.includePast, now), [screenings, month, options.includePast, now]);
  const [y, m] = month.split('-').map(Number);
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'long' }).replace(/^./, (c) => c.toUpperCase());
  const name = firstName?.trim() || '';

  useEffect(() => {
    let alive = true;
    (async () => {
      setPreview(null);
      await ensureStoryFonts(monthLabel);
      const missing = list.filter((s) => s.posterUrl && !posters.current.has(s.posterUrl));
      await Promise.all(
        missing.map(async (s) => posters.current.set(s.posterUrl!, await loadImage(resizeTmdbImage(s.posterUrl!, 'w342') ?? s.posterUrl!)))
      );
      if (!alive) return;
      const cinemas = new Set(list.map((s) => s.cinemaName).filter(Boolean)).size;
      const weekday = (ts: number) => new Date(ts).toLocaleDateString(locale, { weekday: 'short' }).replace('.', '');
      const weekdays = Array.from({ length: 7 }, (_, i) =>
        new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'narrow' }).toUpperCase()
      );
      const canvas = drawMonthShare(
        {
          month,
          monthLabel,
          firstName: name,
          screenings: list,
          posters: posters.current,
          language,
          now,
          labels: {
            kicker: name ? t('monthShare.kickerName', { name }) : t('monthShare.kicker'),
            count: t(list.length > 1 ? 'monthShare.countMany' : 'monthShare.countOne', { n: String(list.length) }),
            next: t('monthShare.next'),
            weekdays,
            weekdayOf: weekday,
            pending: t('monthShare.pending'),
            more: (n) => t('monthShare.more', { n: String(n) }),
            programmeKicker: name ? t('monthShare.programmeName', { name }) : t('monthShare.programme'),
            programmeSub: [
              t(list.length > 1 ? 'monthShare.countMany' : 'monthShare.countOne', { n: String(list.length) }),
              options.showCinema && cinemas > 1 ? t('monthShare.cinemas', { n: String(cinemas) }) : '',
            ]
              .filter(Boolean)
              .join(' · '),
            invite: t('monthShare.invite'),
          },
        },
        options
      );
      setPreview(canvas.toDataURL('image/png'));
    })().catch(() => alive && setPreview(null));
    return () => {
      alive = false;
    };
    // `t` change à chaque rendu (non mémoïsé) : la langue suffit à redessiner.
  }, [list, options, month, monthLabel, name, language, locale, now]);

  const share = async () => {
    if (!preview) return;
    haptics.medium();
    setSharing(true);
    try {
      const outcome = await shareImage(preview, `mes-seances-${month}.png`, {
        title: t('monthShare.shareTitle', { month: monthLabel }),
        text: t('monthShare.shareText'),
      });
      if (outcome === 'downloaded') onToast?.(t('monthShare.downloaded'));
      if (outcome !== 'cancelled') onClose();
    } catch {
      onToast?.(t('monthShare.error'));
    } finally {
      setSharing(false);
    }
  };

  const toggle = (key: 'showCinema' | 'includePast') => {
    haptics.soft();
    setOptions((o) => ({ ...o, [key]: !o[key] }));
  };

  return (
    <ActionSheet title={t('monthShare.title')} onClose={onClose}>
      <div role="radiogroup" aria-label={t('monthShare.format')} className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-stone-100 p-1 dark:bg-white/5">
        {(['calendar', 'programme'] as MonthShareVariant[]).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={options.variant === v}
            onClick={() => {
              haptics.soft();
              setOptions((o) => ({ ...o, variant: v }));
            }}
            className={`min-h-11 rounded-xl text-xs font-black ${options.variant === v ? 'bg-white text-charcoal shadow-sm dark:bg-[#2a2a2a] dark:text-white' : 'text-stone-500'}`}
          >
            {t(v === 'calendar' ? 'monthShare.calendar' : 'monthShare.programmeTab')}
          </button>
        ))}
      </div>

      <div className="mx-auto mb-4 aspect-[9/16] w-[62%] overflow-hidden rounded-[22px] bg-stone-100 shadow-[0_14px_30px_rgba(26,26,26,0.18)] dark:bg-white/5">
        {preview ? (
          <img src={preview} alt={t('monthShare.previewAlt', { month: monthLabel })} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-stone-400">
            <Loader2 className="animate-spin" size={22} />
          </div>
        )}
      </div>

      {!list.length && <p className="mb-3 text-center text-[12px] font-semibold text-stone-500">{t('monthShare.empty')}</p>}

      <div className="mb-4 rounded-2xl border border-sand bg-white px-4 dark:border-white/10 dark:bg-white/5">
        {(['showCinema', 'includePast'] as const).map((key, i) => (
          <label key={key} className={`flex min-h-12 items-center justify-between gap-3 ${i ? 'border-t border-sand dark:border-white/10' : ''}`}>
            <span className="text-[13px] font-extrabold">{t(key === 'showCinema' ? 'monthShare.showCinema' : 'monthShare.includePast')}</span>
            <input type="checkbox" checked={options[key]} onChange={() => toggle(key)} className="h-5 w-5 accent-forest" />
          </label>
        ))}
      </div>

      <button
        type="button"
        onClick={share}
        disabled={!preview || sharing || !list.length}
        className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-full bg-bitter-lime text-[15px] font-black text-charcoal disabled:opacity-50"
      >
        {sharing ? <Loader2 className="animate-spin" size={18} /> : <Share2 size={18} />}
        {t('monthShare.share')}
      </button>
    </ActionSheet>
  );
}
