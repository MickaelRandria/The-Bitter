import React, { useState } from 'react';
import { Clock3, Loader2, X } from 'lucide-react';
import { CinemaScreening } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { calendarDay } from '../utils/calendarAgenda';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { usePosterTint } from '../utils/posterTint';
import { btnPrimary, sectionLabel } from '../utils/ui';

/**
 * Sur l'accueil, juste après une séance : « Hope, à chaud ? ».
 *
 * Une carte aux couleurs de l'affiche, avec une note de 1 à 10 à toucher. La
 * note n'est enregistrée qu'au bouton « Garder 7/10 », pas au simple
 * toucher d'un chiffre : un pouce qui glisse ne doit pas noter un film. Le
 * bouton ouvre ensuite la notation par critères, la note déjà posée.
 *
 * La carte reste sombre dans les deux thèmes : c'est une affiche de cinéma.
 */

export type ScreeningPromptMode =
  /** Pas encore noté : la note à chaud. */
  | 'rate'
  /** Déjà noté avant la séance : il reste à confirmer que la note vaut pour elle. */
  | 'link'
  /** Titre libre, sans fiche film : on renvoie au calendrier. */
  | 'calendar';

const FALLBACK_TINT = '#1f2a1c';
const NOTES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function ScreeningPromptCard({
  screening,
  mode,
  busy = false,
  cancelling = false,
  cancelError = false,
  onQuickRate,
  onPrimary,
  onSnooze,
  onCancel,
}: {
  screening: CinemaScreening;
  mode: ScreeningPromptMode;
  busy?: boolean;
  cancelling?: boolean;
  cancelError?: boolean;
  onQuickRate: (note: number) => void;
  onPrimary: () => void;
  onSnooze: () => void;
  /** Absent : la séance n'était qu'à confirmer, « je n'y suis pas allé » n'a pas de sens. */
  onCancel?: () => void;
}) {
  const { t, language } = useLanguage();
  const [picked, setPicked] = useState<number | null>(null);
  const tint = usePosterTint(screening.posterUrl ? resizeTmdbImage(screening.posterUrl, 'w92') : undefined);
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB';
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
    .format(screening.startsAt)
    .replace(':', language === 'fr' ? ' h ' : ':');
  const evening = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/Paris' }).format(screening.startsAt)
  ) >= 18;
  const today = calendarDay(Date.now());
  const yesterday = calendarDay(Date.now() - 86_400_000);
  const day = calendarDay(screening.startsAt);
  const when =
    day === today
      ? t(evening ? 'lifecycle.tonight' : 'lifecycle.today')
      : day === yesterday
        ? t(evening ? 'lifecycle.yesterdayEvening' : 'lifecycle.yesterday')
        : new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'Europe/Paris' }).format(screening.startsAt);
  const details = [screening.cinemaName, screening.format].filter(Boolean).join(' · ');
  const heading = mode === 'rate' ? t('lifecycle.hotTitle', { title: screening.title }) : screening.title;
  const roundOnDark =
    'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white transition active:scale-95 disabled:opacity-50';

  return (
    <section
      aria-label={t('lifecycle.screeningTitle')}
      className="relative isolate overflow-hidden rounded-[28px] p-5 text-white"
      style={{ background: tint ?? FALLBACK_TINT }}
    >
      {screening.posterUrl && (
        <img
          src={resizeTmdbImage(screening.posterUrl, 'w342')}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-7 -top-5 -z-10 h-60 w-40 rotate-[8deg] rounded-[18px] object-cover opacity-55"
        />
      )}

      <div className="pr-16">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-bitter-lime">
          {when} · {time}
        </p>
        <h2
          className={`mt-1.5 font-black leading-[0.95] tracking-[-0.055em] ${heading.length > 22 ? 'text-[26px]' : 'text-[34px]'}`}
        >
          {heading}
        </h2>
        {details && <p className="mt-2 text-xs font-semibold leading-snug text-stone-300">{details}</p>}
      </div>

      {mode === 'rate' ? (
        <div className="mt-5">
          <p className={`${sectionLabel} !text-stone-300`}>{t('lifecycle.hotLabel')}</p>
          <div className="mt-2 grid grid-cols-10 gap-1" role="radiogroup" aria-label={t('lifecycle.hotLabel')}>
            {NOTES.map((note) => (
              <button
                key={note}
                type="button"
                role="radio"
                aria-checked={picked === note}
                onClick={() => setPicked(note)}
                className={`h-10 rounded-xl text-sm font-black tabular-nums transition active:scale-95 ${
                  picked === note ? 'bg-bitter-lime text-[#111]' : 'bg-white/10 text-white'
                }`}
              >
                {note}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-stone-400">{t('lifecycle.hotHint')}</p>
        </div>
      ) : (
        <p className="mt-4 text-sm leading-relaxed text-stone-300">
          {t(mode === 'link' ? 'lifecycle.linkBody' : 'lifecycle.screeningBody')}
        </p>
      )}

      {cancelError && (
        <p role="alert" className="mt-3 text-xs font-bold text-[#F08A24]">
          {t('lifecycle.cancelError')}
        </p>
      )}

      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => (mode === 'rate' && picked ? onQuickRate(picked) : onPrimary())}
          className={`${btnPrimary} min-w-0 flex-1 !px-4`}
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          <span className="truncate">
            {mode === 'link'
              ? t('lifecycle.linkAction')
              : mode === 'calendar'
                ? t('lifecycle.openCalendar')
                : picked
                  ? t('lifecycle.hotKeep', { n: picked })
                  : t('lifecycle.rate')}
          </span>
        </button>
        <button type="button" onClick={onSnooze} aria-label={t('lifecycle.later')} title={t('lifecycle.later')} className={roundOnDark}>
          <Clock3 size={18} />
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            aria-label={t('lifecycle.notAttended')}
            title={t('lifecycle.notAttended')}
            className={roundOnDark}
          >
            <X size={18} />
          </button>
        )}
      </div>
    </section>
  );
}
