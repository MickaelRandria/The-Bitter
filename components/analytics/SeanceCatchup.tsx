import React, { useState } from 'react';
import ActionSheet from '../ActionSheet';
import type { Movie } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';
import { haptics } from '../../utils/haptics';
import { resizeTmdbImage } from '../../utils/tmdbImage';
import { fmt1 } from '../../utils/verdict';
import { getDisplayWeightedRating } from '../../utils/rating';
import { APPROX_NOTE, MOMENTS, momentInstant, type Moment } from '../../utils/seance';
import { rememberCinema } from '../../services/cinemaMemory';
import CinemaNameInput from '../CinemaNameInput';
import { createScreening } from '../../services/screenings';

/**
 * « Complète tes séances » : les films vus au cinéma sans séance, un à la fois.
 * Un cinéma, un jour, un moment : la séance rejoint le calendrier, à l'heure
 * approximative (elle compte dans tes salles, pas dans tes habitudes).
 */
const SKIPPED_KEY = 'bitter_seance_catchup_skipped';

export const readSkipped = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(SKIPPED_KEY) || '[]'));
  } catch {
    return new Set();
  }
};

const skip = (id: string) => {
  try {
    const next = [...readSkipped(), id];
    localStorage.setItem(SKIPPED_KEY, JSON.stringify(next));
  } catch {
    // Sans stockage, le film reviendra à la prochaine visite.
  }
};

interface Props {
  films: Movie[];
  /** Tes cinémas connus, le favori en tête. */
  cinemas: string[];
  currentUserId: string;
  onDone: () => void;
  onClose: () => void;
}

export default function SeanceCatchup({ films, cinemas, currentUserId, onDone, onClose }: Props) {
  const { t, language } = useLanguage();
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB';
  const [index, setIndex] = useState(0);
  const [cinema, setCinema] = useState(cinemas[0] ?? '');
  const [other, setOther] = useState(!cinemas.length);
  const [day, setDay] = useState<'same' | 'before'>('same');
  const [moment, setMoment] = useState<Moment>('evening');
  const [saving, setSaving] = useState(false);
  const film = films[index];

  const next = () => {
    if (index >= films.length - 1) {
      onDone();
      onClose();
    } else setIndex(index + 1);
  };

  if (!film) return null;
  const watchedAt = film.dateWatched || film.dateAdded;
  const dayIso = (offset: number) => {
    const d = new Date(watchedAt - offset * 86_400_000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const save = async () => {
    if (!cinema.trim()) return;
    setSaving(true);
    haptics.medium();
    await createScreening(currentUserId, {
      title: film.title,
      tmdbId: film.tmdbId,
      posterUrl: film.posterUrl,
      startsAt: momentInstant(dayIso(day === 'same' ? 0 : 1), moment, Date.now()),
      cinemaName: cinema.trim(),
      notes: APPROX_NOTE,
      status: 'completed',
    });
    rememberCinema(cinema);
    setSaving(false);
    next();
  };

  const chip = (on: boolean) =>
    `inline-flex h-[38px] max-w-full items-center truncate rounded-full px-3.5 text-[12px] font-extrabold ${
      on ? 'bg-charcoal text-white dark:bg-white dark:text-charcoal' : 'border border-sand bg-white text-charcoal dark:border-white/10 dark:bg-white/[0.06] dark:text-white'
    }`;
  const label = 'text-[13px] font-black text-charcoal dark:text-white';

  return (
    <ActionSheet title={t('catchup.title')} onClose={onClose}>
      <div className="flex min-w-0 flex-col gap-5">
        <div className="-mt-2 flex items-center gap-3">
          <b className="text-[13px] font-black text-stone-500">{t('catchup.progress', { n: String(index + 1), total: String(films.length) })}</b>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sand dark:bg-white/10">
            <span className="block h-full rounded-full bg-forest dark:bg-bitter-lime" style={{ width: `${((index + 1) / films.length) * 100}%` }} />
          </span>
          <button
            type="button"
            onClick={() => {
              skip(film.id);
              next();
            }}
            className="text-[13px] font-black text-stone-500"
          >
            {t('catchup.skip')}
          </button>
        </div>

        <div className="flex items-center gap-3.5">
          {film.posterUrl ? (
            <img src={resizeTmdbImage(film.posterUrl, 'w154')} alt="" className="h-[105px] w-[70px] shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="h-[105px] w-[70px] shrink-0 rounded-xl bg-sand dark:bg-white/10" />
          )}
          <div className="min-w-0">
            <b className="block truncate text-[21px] font-black tracking-[-0.04em] text-charcoal dark:text-white">{film.title}</b>
            <small className="text-[12px] font-bold text-stone-500 dark:text-stone-400">
              {t('catchup.rated', {
                note: fmt1(getDisplayWeightedRating(film)),
                date: new Date(watchedAt).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }),
              })}
            </small>
          </div>
        </div>

        <section className="flex flex-col gap-2.5">
          <p className={label}>{t('seance.whichCinema')}</p>
          <div className="flex flex-wrap gap-1.5">
            {cinemas.slice(0, 4).map((c) => (
              <button key={c} type="button" onClick={() => { setOther(false); setCinema(c); }} className={chip(!other && cinema === c)}>
                {c}
              </button>
            ))}
            <button type="button" onClick={() => { setOther(true); setCinema(''); }} className={chip(other)}>
              {t('seance.otherCinema')}
            </button>
          </div>
          {other && <CinemaNameInput value={cinema} onChange={setCinema} />}
        </section>

        <section className="flex flex-col gap-2.5">
          <p className={label}>{t('catchup.whichDay')}</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setDay('same')} className={chip(day === 'same')}>{t('catchup.sameDay')}</button>
            <button type="button" onClick={() => setDay('before')} className={chip(day === 'before')}>{t('catchup.dayBefore')}</button>
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <p className={label}>{t('catchup.whichMoment')}</p>
          <div className="flex flex-wrap gap-1.5">
            {MOMENTS.map((m) => (
              <button key={m} type="button" onClick={() => setMoment(m)} className={chip(moment === m)}>
                {t(`seance.moment.${m}`)}
              </button>
            ))}
          </div>
        </section>

        <p className="text-[12px] font-semibold text-stone-500 dark:text-stone-400">{t('catchup.approxNote')}</p>

        <div className="flex gap-2.5 border-t border-sand pt-4 dark:border-white/10">
          <button type="button" onClick={onClose} className="h-[52px] rounded-full border border-sand px-5 text-[14px] font-black text-charcoal dark:border-white/15 dark:text-white">
            {t('catchup.later')}
          </button>
          <button
            type="button"
            onClick={() => {
              skip(film.id);
              next();
            }}
            className="h-[52px] rounded-full px-3 text-[13px] font-extrabold text-stone-500"
          >
            {t('seance.home')}
          </button>
          <button
            type="button"
            disabled={saving || !cinema.trim()}
            onClick={save}
            className="h-[52px] flex-1 rounded-full bg-bitter-lime text-[15px] font-black text-charcoal disabled:opacity-50"
          >
            {t('catchup.next')}
          </button>
        </div>
      </div>
    </ActionSheet>
  );
}
