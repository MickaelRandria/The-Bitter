import React, { useEffect, useState } from 'react';
import { Check, Film, Loader2 } from 'lucide-react';
import type { CinemaShowtime, CinemaSubscription, CinemaViewingPaymentType, FavoriteCinema } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { fetchCinemaProgramme } from '../services/cinemaDirectory';
import { guessMoment, momentInstant, momentOf, MOMENTS, pickShowtime, sameTitle, type Moment } from '../utils/seance';
import { knownCinemas } from '../services/cinemaMemory';
import { normalizeName } from '../utils/cinemaNames';
import CinemaNameInput from './CinemaNameInput';

/**
 * « Ta séance », dans la notation d'un film encore en salle : devinée (ton
 * cinéma, la séance du programme la plus probable), à confirmer d'un appui,
 * corrigeable sur place. Ignorée, elle est reposée après l'enregistrement.
 */
export type SeanceState = 'ask' | 'editing' | 'confirmed' | 'home';

export interface SeanceChoice {
  state: SeanceState;
  cinemaName?: string;
  startsAt?: number;
  /** Heure tirée d'un moment (« Soirée »), pas du programme. */
  approximate: boolean;
  version?: string;
  payment?: CinemaViewingPaymentType;
}

interface Props {
  title: string;
  runtime?: number;
  favoriteCinema?: FavoriteCinema;
  subscription?: CinemaSubscription;
  value: SeanceChoice;
  onChange: (choice: SeanceChoice) => void;
  /** Dans la fenêtre d'après l'enregistrement : la question est déjà posée au-dessus. */
  compact?: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** jj/mm/aaaa, le jour tel qu'UGC l'attend. */
const ugcDay = (ts: number) => {
  const d = new Date(ts);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/** La première devinette : la séance du programme si on la trouve, sinon un moment. */
export function initialSeance(subscription?: CinemaSubscription, favoriteCinema?: FavoriteCinema, now = Date.now()): SeanceChoice {
  const guess = guessMoment(now);
  return {
    state: 'ask',
    cinemaName: favoriteCinema?.name,
    startsAt: favoriteCinema ? momentInstant(guess.day, guess.moment, now) : undefined,
    approximate: true,
    payment: subscription?.active ? 'subscription' : 'paid',
  };
}

export default function SeanceCard({ title, runtime, favoriteCinema, subscription, value, onChange, compact = false }: Props) {
  const { t, language } = useLanguage();
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB';
  const [showtimes, setShowtimes] = useState<Record<'today' | 'yesterday', CinemaShowtime[]> | null>(null);
  const [day, setDay] = useState<'today' | 'yesterday' | 'other'>(() =>
    value.startsAt != null
      ? new Date(value.startsAt).toDateString() === new Date().toDateString()
        ? 'today'
        : 'yesterday'
      : guessMoment(Date.now()).day
  );
  const [otherDay, setOtherDay] = useState('');
  const [otherCinema, setOtherCinema] = useState(false);

  // Le programme de ton cinéma, aujourd'hui et hier : la vraie séance, si le film y est.
  useEffect(() => {
    if (!favoriteCinema) return;
    let alive = true;
    const now = Date.now();
    Promise.all([fetchCinemaProgramme(favoriteCinema.id, ugcDay(now)), fetchCinemaProgramme(favoriteCinema.id, ugcDay(now - 86_400_000))]).then(([today, yesterday]) => {
      if (!alive) return;
      // Pour un jour passé, le serveur peut répondre avec un autre jour : on garde le bon.
      const of = (res: typeof today, day: number) =>
        (res.data?.films.find((f) => sameTitle(f.title, title))?.showtimes ?? []).filter(
          (s) => new Date(s.startsAt).toDateString() === new Date(day).toDateString()
        );
      const found = { today: of(today, now), yesterday: of(yesterday, now - 86_400_000) };
      setShowtimes(found);
      const best = pickShowtime([...found.today, ...found.yesterday], now, runtime);
      // Tant qu'on n'a pas répondu, la devinette se précise d'elle-même.
      if (best && value.state === 'ask') {
        onChange({ ...value, startsAt: best.startsAt, approximate: false, version: best.version });
        setDay(new Date(best.startsAt).getDate() === new Date(now).getDate() ? 'today' : 'yesterday');
      }
    });
    return () => {
      alive = false;
    };
    // Une seule lecture par film : la devinette ne doit pas tourner en boucle.
  }, [favoriteCinema?.id, title]);

  const set = (patch: Partial<SeanceChoice>) => onChange({ ...value, ...patch });
  const when = value.startsAt
    ? `${new Date(value.startsAt).toDateString() === new Date().toDateString() ? t('seance.today') : t('seance.yesterdayLower')} ${
        value.approximate ? t(`seance.momentLower.${momentOf(value.startsAt)}`) : new Date(value.startsAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
      }`
    : '';
  const summary = [value.cinemaName, when, value.payment === 'subscription' ? t('seance.pass') : ''].filter(Boolean).join(' · ');

  const chip = (on: boolean) =>
    `inline-flex h-[38px] items-center rounded-full px-3.5 text-[12px] font-extrabold transition-colors ${
      on ? 'bg-charcoal text-white dark:bg-white dark:text-charcoal' : 'border border-sand bg-white text-charcoal dark:border-white/10 dark:bg-white/[0.06] dark:text-white'
    }`;
  const card = 'rounded-[24px] border border-sand bg-white dark:border-white/10 dark:bg-[#1E1E1E]';

  if (value.state === 'confirmed' || value.state === 'home') {
    return (
      <div className={`${card} flex items-center gap-3 px-4 py-3.5`}>
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-bitter-lime text-charcoal">
          <Check size={17} strokeWidth={3} />
        </span>
        <span className="min-w-0 flex-1">
          <small className="block text-[10px] font-black uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">{t('seance.title')}</small>
          <b className="line-clamp-2 block text-[14px] font-black leading-snug text-charcoal dark:text-white">{value.state === 'home' ? t('seance.atHome') : summary}</b>
        </span>
        <button type="button" onClick={() => set({ state: 'editing' })} className="shrink-0 text-[12px] font-black text-forest dark:text-bitter-lime">
          {t('seance.edit')}
        </button>
      </div>
    );
  }

  if (value.state === 'editing') {
    const list = day === 'other' ? [] : showtimes?.[day] ?? [];
    const pickMoment = (moment: Moment) => {
      haptics.soft();
      const base = day === 'other' ? otherDay || new Date().toISOString().slice(0, 10) : day;
      set({ startsAt: momentInstant(base, moment, Date.now()), approximate: true, version: undefined });
    };
    return (
      <div className={`${card} flex flex-col gap-3 p-4`}>
        <div className="flex items-baseline justify-between">
          <b className="text-[15px] font-black text-charcoal dark:text-white">{t('seance.title')}</b>
          <button
            type="button"
            onClick={() => set({ state: value.cinemaName && value.startsAt ? 'confirmed' : 'ask' })}
            className="text-[12px] font-black text-forest dark:text-bitter-lime"
          >
            {t('seance.done')}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={chip(true)}>{t('seance.cinema')}</button>
          <button type="button" onClick={() => onChange({ ...value, state: 'home' })} className={chip(false)}>
            {t('seance.home')}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[favoriteCinema?.name, ...knownCinemas()]
            .filter((n, i, all): n is string => !!n && all.findIndex((x) => x && normalizeName(x) === normalizeName(n)) === i)
            .slice(0, 4)
            .map((name) => (
              <button key={name} type="button" onClick={() => { setOtherCinema(false); set({ cinemaName: name }); }} className={`${chip(!otherCinema && value.cinemaName === name)} max-w-full truncate`}>
                {name}
              </button>
            ))}
          <button type="button" onClick={() => { setOtherCinema(true); set({ cinemaName: '' }); }} className={chip(otherCinema || !favoriteCinema)}>
            {t('seance.otherCinema')}
          </button>
        </div>
        {(otherCinema || !favoriteCinema) && <CinemaNameInput value={value.cinemaName ?? ''} onChange={(name) => set({ cinemaName: name })} />}
        <div className="flex flex-wrap gap-1.5">
          {(['today', 'yesterday', 'other'] as const).map((d) => (
            <button key={d} type="button" onClick={() => setDay(d)} className={chip(day === d)}>
              {t(`seance.day.${d}`)}
            </button>
          ))}
        </div>
        {day === 'other' && (
          <input
            type="date"
            value={otherDay}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(event) => setOtherDay(event.target.value)}
            className="h-11 rounded-2xl border border-sand bg-cream px-3.5 text-[13px] font-semibold text-charcoal outline-none dark:border-white/10 dark:bg-[#121212] dark:text-white"
          />
        )}
        {!otherCinema && favoriteCinema && day !== 'other' && showtimes == null && (
          <span className="flex items-center gap-2 text-[12px] font-bold text-stone-500"><Loader2 size={14} className="animate-spin" /> {t('seance.loading')}</span>
        )}
        {!otherCinema && value.cinemaName === favoriteCinema?.name && list.length > 0 && (
          <div className="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-1.5">
            {list.map((s) => {
              const on = !value.approximate && value.startsAt === s.startsAt;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { haptics.soft(); set({ startsAt: s.startsAt, approximate: false, version: s.version }); }}
                  className={`flex h-[50px] min-w-0 flex-col items-center justify-center rounded-[14px] ${on ? 'bg-bitter-lime text-charcoal' : 'border border-sand bg-white text-charcoal dark:border-white/10 dark:bg-white/[0.06] dark:text-white'}`}
                >
                  <b className="text-[15px] font-black">{new Date(s.startsAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</b>
                  {s.version && <small className="max-w-full truncate px-1 text-[9px] font-extrabold opacity-70">{s.version}</small>}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {MOMENTS.map((m) => (
            <button key={m} type="button" onClick={() => pickMoment(m)} className={chip(!!value.approximate && !!value.startsAt && momentOf(value.startsAt) === m)}>
              {t(`seance.moment.${m}`)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {subscription?.active && (
            <button type="button" onClick={() => set({ payment: 'subscription' })} className={chip(value.payment === 'subscription')}>
              {t('seance.passNamed', { name: subscription.name })}
            </button>
          )}
          <button type="button" onClick={() => set({ payment: 'paid' })} className={chip(value.payment === 'paid')}>{t('viewing.paid')}</button>
          <button type="button" onClick={() => set({ payment: 'invitation' })} className={chip(value.payment === 'invitation')}>{t('viewing.invitation')}</button>
        </div>
      </div>
    );
  }

  // À confirmer.
  return (
    <div className={`${compact ? '' : 'border-2 border-dashed border-forest dark:border-bitter-lime'} flex flex-col gap-3 rounded-[24px] bg-white px-4 py-3.5 dark:bg-[#1E1E1E]`}>
      {!compact && (
        <div className="flex items-center gap-3">
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-[#12307E] text-white dark:bg-[#3D63D9]">
            <Film size={19} />
          </span>
          <span className="min-w-0">
            <small className="block text-[10px] font-black uppercase tracking-[0.16em] text-forest dark:text-bitter-lime">{t('seance.inTheaters')}</small>
            <b className="block text-[14px] font-black leading-snug text-charcoal dark:text-white">
              {value.cinemaName && value.startsAt ? t('seance.question', { where: value.cinemaName, when }) : t('seance.questionShort')}
            </b>
          </span>
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            haptics.medium();
            onChange({ ...value, state: value.cinemaName && value.startsAt ? 'confirmed' : 'editing' });
          }}
          className="h-[42px] flex-1 rounded-full bg-bitter-lime text-[13px] font-black text-charcoal active:scale-[0.98]"
        >
          {t('seance.yes')}
        </button>
        <button type="button" onClick={() => set({ state: 'editing' })} className="h-[42px] shrink-0 whitespace-nowrap rounded-full border border-sand px-4 text-[13px] font-black text-charcoal dark:border-white/15 dark:text-white">
          {t('seance.other')}
        </button>
        <button type="button" onClick={() => onChange({ ...value, state: 'home' })} className="h-[42px] shrink-0 whitespace-nowrap px-1 text-[12px] font-extrabold text-stone-500 dark:text-stone-400">
          {t('seance.home')}
        </button>
      </div>
    </div>
  );
}

