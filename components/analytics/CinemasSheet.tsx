import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ActionSheet from '../ActionSheet';
import type { CinemaScreening, Movie, UserProfile } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';
import { haptics } from '../../utils/haptics';
import { resizeTmdbImage } from '../../utils/tmdbImage';
import { fmt1 } from '../../utils/verdict';
import { getDisplayWeightedRating } from '../../utils/rating';
import { formatCurrency } from '../../utils/cinemaSubscription';
import { cinemaStats } from '../../utils/cinemaStats';
import { cinemaCard, formatEffect, habitsOf, passReality, recordsOf, salleVsCanape } from '../../utils/cinemaDetail';

/**
 * « Tes salles » en grand : la vue d'ensemble (salle ou canapé, habitudes,
 * versions, pass, records, cinémas), puis la fiche d'un cinéma.
 */
interface Props {
  screenings: CinemaScreening[];
  /** Les films de la période : leurs notes. */
  movies: Movie[];
  userProfile: UserProfile | null;
  periodLabel: string;
  initialCinema?: string | null;
  onViewMovie?: (movie: Movie) => void;
  onClose: () => void;
}

const card = 'rounded-[22px] border border-sand bg-white p-4 dark:border-white/[0.08] dark:bg-[#1C1B19]';
const tile = 'rounded-[14px] bg-sand p-2.5 dark:bg-white/[0.06]';

const Head: React.FC<{ title: string; aside?: string }> = ({ title, aside }) => (
  <div className="flex items-baseline justify-between gap-3 px-1">
    <h3 className="text-[17px] font-black tracking-[-0.035em] text-charcoal dark:text-white">{title}</h3>
    {aside && <small className="text-[11px] font-extrabold text-stone-500 dark:text-stone-400">{aside}</small>}
  </div>
);

export default function CinemasSheet({ screenings, movies, userProfile, periodLabel, initialCinema, onViewMovie, onClose }: Props) {
  const { t, language } = useLanguage();
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB';
  const [cinema, setCinema] = useState<string | null>(initialCinema ?? null);

  const watched = useMemo(() => movies.filter((m) => m.status === 'watched'), [movies]);
  const byTmdb = useMemo(() => {
    const map = new Map<number, Movie>();
    for (const m of watched) if (m.tmdbId != null) map.set(m.tmdbId, m);
    return map;
  }, [watched]);
  const ratingOf = (id: number) => {
    const m = byTmdb.get(id);
    return m ? getDisplayWeightedRating(m) : undefined;
  };
  const report = useMemo(() => cinemaStats(screenings, ratingOf), [screenings, byTmdb]);
  const versus = useMemo(() => salleVsCanape(watched.map((m) => ({ tmdbId: m.tmdbId, score: getDisplayWeightedRating(m) })), screenings), [watched, screenings]);
  const habits = useMemo(() => habitsOf(screenings), [screenings]);
  const effect = useMemo(() => formatEffect(screenings, ratingOf), [screenings, byTmdb]);
  const sub = userProfile?.cinemaSubscription;
  const pass = useMemo(() => (sub?.active ? passReality(screenings, sub) : null), [screenings, sub]);
  const records = useMemo(() => recordsOf(screenings), [screenings]);

  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'narrow' }).toUpperCase());
  const weekdayLong = (i: number) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'long' });
  const day = (ts: number, withWeekday = true) =>
    new Date(ts).toLocaleDateString(locale, { ...(withWeekday ? { weekday: 'short' } : null), day: 'numeric', month: 'short' });
  const time = (ts: number) => new Date(ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const maxDay = Math.max(1, ...habits.byWeekday);
  const open = (name: string) => {
    haptics.soft();
    setCinema(name);
  };

  if (cinema) {
    const fiche = cinemaCard(cinema, screenings, ratingOf);
    const totalFormats = fiche.formats.reduce((a, f) => a + f.count, 0);
    return (
      <ActionSheet title={cinema} subtitle={fiche.address} onClose={onClose}>
        <div className="flex flex-col gap-6">
          <button type="button" onClick={() => setCinema(null)} className="-mt-3 flex items-center gap-1 self-start text-[12px] font-extrabold text-stone-500 dark:text-stone-400">
            <ChevronLeft size={14} /> {t('salles.title')}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <div className={`${card} p-3`}>
              <b className="block text-[22px] font-black tracking-[-0.05em] text-charcoal dark:text-white">{fiche.count}</b>
              <small className="text-[10px] font-extrabold text-stone-500 dark:text-stone-400">{t('activity.sessions')}</small>
            </div>
            <div className={`${card} p-3`}>
              <b className="block text-[22px] font-black tracking-[-0.05em] text-forest dark:text-bitter-lime">{fiche.average != null ? fmt1(fiche.average) : '–'}</b>
              <small className="text-[10px] font-extrabold text-stone-500 dark:text-stone-400">{t('salles.yourAverage')}</small>
            </div>
          </div>
          {fiche.first && fiche.last && (
            <p className="-mt-3 text-[12px] font-bold text-stone-500 dark:text-stone-400">
              {t('salles.visits', { first: day(fiche.first, false), last: day(fiche.last, false) })}
            </p>
          )}
          <section className="flex flex-col gap-2.5">
            <Head title={t('salles.seenHere')} aside={t('gouts.films', { n: String(fiche.count) })} />
            <ul className={`${card} px-4 py-1`}>
              {fiche.screenings.map((s) => {
                const movie = s.tmdbId != null ? byTmdb.get(s.tmdbId) : undefined;
                return (
                  <li key={s.id} className="border-t border-sand first:border-t-0 dark:border-white/10">
                    <button
                      type="button"
                      disabled={!movie}
                      onClick={() => movie && onViewMovie?.(movie)}
                      className="flex w-full items-center gap-3 py-2.5 text-left disabled:cursor-default"
                    >
                      {s.posterUrl ? (
                        <img src={resizeTmdbImage(s.posterUrl, 'w92')} alt="" className="h-[54px] w-9 rounded-md object-cover" />
                      ) : (
                        <span className="h-[54px] w-9 rounded-md bg-sand dark:bg-white/10" />
                      )}
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-[13px] font-black text-charcoal dark:text-white">{s.title}</b>
                        <small className="text-[11px] font-bold text-stone-500 dark:text-stone-400">
                          {[day(s.startsAt), s.format].filter(Boolean).join(' · ')}
                        </small>
                      </span>
                      {movie && <b className="text-[15px] font-black text-charcoal dark:text-white">{fmt1(getDisplayWeightedRating(movie))}</b>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
          {fiche.formats.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <Head title={t('salles.versionsHere')} />
              <div className="flex flex-wrap gap-1.5">
                {fiche.formats.map((f, i) => (
                  <span key={f.label} className={`rounded-full px-2.5 py-1.5 text-[11px] font-black ${i === 0 ? 'bg-bitter-lime text-charcoal' : 'bg-sand text-charcoal dark:bg-white/10 dark:text-white'}`}>
                    {f.label} <span className="opacity-60">{Math.round((f.count / totalFormats) * 100)} %</span>
                  </span>
                ))}
              </div>
            </section>
          )}
          {fiche.count > 1 && (
            <p className="text-[12px] font-bold text-stone-500 dark:text-stone-400">
              {t('salles.togetherHere', { n: String(fiche.together), alone: String(fiche.count - fiche.together) })}
            </p>
          )}
        </div>
      </ActionSheet>
    );
  }

  return (
    <ActionSheet
      title={t('salles.title')}
      subtitle={t('salles.subtitle', { period: periodLabel, n: String(report.sessions), cinemas: String(report.cinemas.length) })}
      onClose={onClose}
    >
      <div className="flex flex-col gap-6">
        {versus && (
          <section className={card}>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl bg-charcoal p-3 text-white dark:bg-white dark:text-charcoal">
                <small className="text-[10px] font-black uppercase tracking-[0.12em] text-bitter-lime dark:text-forest">{t('salles.atCinema')}</small>
                <b className="mt-1 block text-[32px] font-black tracking-[-0.06em]">{fmt1(versus.salle)}</b>
              </div>
              <div className="rounded-2xl bg-sand p-3 dark:bg-white/[0.06]">
                <small className="text-[10px] font-black uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">{t('salles.atHome')}</small>
                <b className="mt-1 block text-[32px] font-black tracking-[-0.06em] text-charcoal dark:text-white">{fmt1(versus.canape)}</b>
              </div>
            </div>
            <p className="mt-2.5 text-[11px] font-semibold leading-snug text-stone-500 dark:text-stone-400">{t('salles.versusNote')}</p>
          </section>
        )}

        <section className="flex flex-col gap-2.5">
          <Head title={t('salles.habits')} />
          <div className={`${card} flex flex-col gap-3.5`}>
            <div className="flex h-[88px] items-end gap-2" aria-hidden="true">
              {habits.byWeekday.map((n, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                  <span
                    className={`w-full rounded-md ${i === habits.topWeekday ? 'bg-bitter-lime ring-[1.5px] ring-inset ring-charcoal dark:ring-0' : 'bg-stone-300 dark:bg-white/15'}`}
                    style={{ height: `${Math.max(4, (n / maxDay) * 64)}px` }}
                  />
                  <b className="text-[10px] font-black text-charcoal dark:text-white">{weekdays[i]}</b>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className={tile}>
                <b className="block text-[14px] font-black capitalize text-charcoal dark:text-white">{weekdayLong(habits.topWeekday)}</b>
                <small className="text-[10px] font-extrabold text-stone-500 dark:text-stone-400">{t('salles.yourDay')}</small>
              </div>
              <div className={tile}>
                <b className="block text-[14px] font-black text-charcoal dark:text-white">{t('salles.slot', { from: String(habits.topSlot), to: String((habits.topSlot + 2) % 24) })}</b>
                <small className="text-[10px] font-extrabold text-stone-500 dark:text-stone-400">{t('salles.yourSlot')}</small>
              </div>
              <div className={tile}>
                <b className="block text-[14px] font-black text-charcoal dark:text-white">{habits.together}/{report.sessions}</b>
                <small className="text-[10px] font-extrabold text-stone-500 dark:text-stone-400">{t('salles.together')}</small>
              </div>
            </div>
            {habits.everyDays != null && (
              <p className="text-[12px] font-bold text-stone-500 dark:text-stone-400">{t('salles.every', { n: String(habits.everyDays) })}</p>
            )}
          </div>
        </section>

        {effect.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <Head title={t('salles.versionEffect')} aside={t('salles.yourAverageShort')} />
            <ul className={`${card} flex flex-col gap-2.5`}>
              {effect.map((f, i) => (
                <li key={f.label} className="grid grid-cols-[6rem_1fr_2.2rem] items-center gap-2.5">
                  <span className="text-[12px] font-extrabold text-charcoal dark:text-white">
                    {f.label} · {f.count}
                  </span>
                  <span aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-sand dark:bg-white/[0.08]">
                    <span
                      className={`block h-full rounded-full ${i === 0 ? 'bg-forest dark:bg-bitter-lime' : i === effect.length - 1 && effect.length > 1 ? 'bg-[#C2630F] dark:bg-[#F08A24]' : 'bg-charcoal dark:bg-[#F4F1EA]'}`}
                      style={{ width: `${f.average * 10}%` }}
                    />
                  </span>
                  <b className="text-right text-[12px] font-black text-charcoal dark:text-white">{fmt1(f.average)}</b>
                </li>
              ))}
            </ul>
          </section>
        )}

        {pass && sub && (
          <section className="flex flex-col gap-2.5">
            <Head title={t('salles.pass')} aside={sub.name} />
            <div className={`${card} grid grid-cols-3 gap-2`}>
              <div className={tile}>
                <b className="block text-[15px] font-black text-charcoal dark:text-white">{formatCurrency(pass.perSession, language)}</b>
                <small className="text-[10px] font-extrabold leading-tight text-stone-500 dark:text-stone-400">{t('salles.perSession')}</small>
              </div>
              <div className="rounded-[14px] bg-bitter-lime p-2.5 text-charcoal">
                <b className="block text-[15px] font-black">
                  {pass.saved >= 0 ? '+' : '−'}
                  {formatCurrency(Math.abs(pass.saved), language)}
                </b>
                <small className="text-[10px] font-extrabold leading-tight">{t(pass.saved >= 0 ? 'salles.saved' : 'salles.lost')}</small>
              </div>
              <div className={tile}>
                <b className="block text-[15px] font-black capitalize text-charcoal dark:text-white">{pass.bestMonth.toLocaleDateString(locale, { month: 'long' })}</b>
                <small className="text-[10px] font-extrabold leading-tight text-stone-500 dark:text-stone-400">{t('salles.bestMonth')}</small>
              </div>
            </div>
          </section>
        )}

        {records && report.sessions > 2 && (
          <section className="flex flex-col gap-2.5">
            <Head title={t('salles.records')} />
            <ul className={`${card} py-1`}>
              {[
                [t('salles.latest'), `${records.latest.title} · ${day(records.latest.startsAt)}, ${time(records.latest.startsAt)}`],
                [t('salles.streak'), t('salles.streakValue', { n: String(records.streakWeeks) })],
                [t('salles.first'), `${records.first.title} · ${day(records.first.startsAt, false)}`],
              ].map(([k, v], i) => (
                <li key={k} className={`py-2.5 ${i ? 'border-t border-sand dark:border-white/10' : ''}`}>
                  <small className="text-[10px] font-black uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">{k}</small>
                  <b className="mt-0.5 block text-[13px] font-black text-charcoal dark:text-white">{v}</b>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-2.5">
          <Head title={t('salles.cinemas')} aside={t('salles.tapHint')} />
          <ul className={`${card} py-1`}>
            {report.cinemas.map((c, i) => (
              <li key={c.name} className={i ? 'border-t border-sand dark:border-white/10' : ''}>
                <button type="button" onClick={() => open(c.name)} className="flex w-full items-center gap-3 py-2.5 text-left">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sand text-[13px] font-black text-charcoal dark:bg-white/10 dark:text-white">
                    {c.name[0]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[14px] font-black text-charcoal dark:text-white">{c.name}</b>
                    <small className="text-[11px] font-bold text-stone-500 dark:text-stone-400">
                      {t('salles.cinemaLine', { n: String(c.count) })}
                      {c.average != null ? ` · ${fmt1(c.average)}` : ''}
                    </small>
                  </span>
                  <ChevronRight size={16} className="text-stone-400" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </ActionSheet>
  );
}
