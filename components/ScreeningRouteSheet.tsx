import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Bike, Car, Footprints, Loader2, Lock, Navigation, TrainFront, X } from 'lucide-react';
import { CinemaScreening } from '../types';
import { useDialog } from '../utils/useDialog';
import { useLanguage } from '../contexts/LanguageContext';
import { Companion, getCompanions, notifyRunningLate } from '../services/social';
import {
  CinemaPlace,
  LatLng,
  MODE_EXTRA_MINUTES,
  TRANSITOUS_SOURCES,
  TRAVEL_MODES,
  TransitTrip,
  TravelMode,
  correctCinemaPlace,
  formatMinutes,
  currentPosition,
  departureFor,
  hasGeoConsent,
  locateCinema,
  mapsLinks,
  readSavedMode,
  saveGeoConsent,
  saveMode,
  transitTrip,
  travelMinutes,
} from '../services/travel';

const MODE_ICON: Record<TravelMode, typeof Car> = { transit: TrainFront, car: Car, bike: Bike, walk: Footprints };

type Phase = 'intro' | 'locating' | 'ready' | 'denied' | 'failed';

/**
 * « Quand partir ? » : ouvert depuis le rappel de séance ou la carte de la
 * séance. La position n'est lue qu'ici, avec l'accord de l'utilisateur, et
 * ne quitte pas le téléphone (voir services/travel).
 */
export default function ScreeningRouteSheet({
  screening,
  onClose,
  onToast,
}: {
  screening: CinemaScreening;
  onClose: () => void;
  onToast?: (message: string) => void;
}) {
  const { t, language } = useLanguage();
  const dialog = useDialog(onClose, t('route.title'));
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB';
  const clock = (value: number) =>
    new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
      .format(value)
      .replace(':', language === 'fr' ? ' h ' : ':');

  const [phase, setPhase] = useState<Phase>(() => (hasGeoConsent() ? 'locating' : 'intro'));
  const [place, setPlace] = useState<CinemaPlace | null>(null);
  const [placeMissing, setPlaceMissing] = useState(false);
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [minutes, setMinutes] = useState<Partial<Record<TravelMode, number>>>({});
  const [mode, setMode] = useState<TravelMode | null>(readSavedMode);
  const [now, setNow] = useState(Date.now());
  /** undefined : en cours ; null : pas de transports utiles. */
  const [transit, setTransit] = useState<{ trip: TransitTrip; late: boolean } | null | undefined>(undefined);
  const [transitTick, setTransitTick] = useState(0);
  const [fixing, setFixing] = useState(false);
  const [typed, setTyped] = useState('');
  const [fixBusy, setFixBusy] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(timer);
  }, []);

  // Le cinéma se cherche tout de suite : le lien vers l'appli de cartes en a besoin, position ou non.
  useEffect(() => {
    const controller = new AbortController();
    locateCinema(screening.cinemaName, screening.cinemaAddress, controller.signal)
      .then((found) => {
        setPlace(found);
        setPlaceMissing(!found);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPlaceMissing(true);
      });
    return () => controller.abort();
  }, [screening.cinemaName, screening.cinemaAddress]);

  // Cinéma introuvable sur la carte : on ne fera pas mieux que l'appli de cartes.
  useEffect(() => {
    if (origin && placeMissing) setPhase('failed');
  }, [origin, placeMissing]);

  useEffect(() => {
    if (phase !== 'locating') return;
    let cancelled = false;
    currentPosition()
      .then((position) => {
        if (cancelled) return;
        saveGeoConsent();
        setOrigin(position);
      })
      .catch((error: GeolocationPositionError | Error) => {
        if (cancelled) return;
        setPhase('code' in error && error.code === 1 ? 'denied' : 'failed');
      });
    return () => {
      cancelled = true;
    };
  }, [phase]);

  useEffect(() => {
    if (!origin || !place) return;
    const controller = new AbortController();
    Promise.all([
      travelMinutes(origin, place, controller.signal),
      transitTrip(origin, place, screening.startsAt, Date.now(), controller.signal).catch(() => null),
    ]).then(([found, bus]) => {
      if (controller.signal.aborted) return;
      setMinutes(found);
      setTransit(bus);
      setPhase(Object.keys(found).length || bus ? 'ready' : 'failed');
      // Sans choix enregistré : à pied si c'est court, sinon les transports, sinon la voiture.
      setMode((current) => current ?? ((found.walk ?? 99) <= 20 ? 'walk' : bus ? 'transit' : 'car'));
    });
    return () => controller.abort();
  }, [origin, place, screening.startsAt, transitTick]);

  // Le bus conseillé est passé : on cherche le suivant.
  useEffect(() => {
    if (transit && !transit.late && now > transit.trip.departAt + 60_000) setTransitTick((n) => n + 1);
  }, [now, transit]);

  const pick = (next: TravelMode) => {
    setMode(next);
    saveMode(next);
  };

  const active = mode ?? 'car';
  const links = mapsLinks(screening.cinemaName, screening.cinemaAddress, place, active);
  const duration = minutes[active];
  const plan = useMemo(() => {
    if (active === 'transit') {
      if (!transit) return null;
      const late = transit.late || transit.trip.departAt < now;
      return { leaveAt: transit.trip.departAt, arriveAt: transit.trip.arriveAt, late };
    }
    return duration != null ? departureFor(screening.startsAt, duration, active, now) : null;
  }, [duration, active, screening.startsAt, now, transit]);
  const leaveIn = plan && !plan.late ? Math.round((plan.leaveAt - now) / 60_000) : 0;
  const started = screening.startsAt <= now;

  const [people, setPeople] = useState<Companion[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [notified, setNotified] = useState(0);
  const loadPeople = async () => {
    const result = await getCompanions();
    if (result.error) {
      onToast?.(result.error);
      return;
    }
    setPeople(result.data ?? []);
  };
  const sendLate = async () => {
    if (!plan || !picked.length) return;
    setSending(true);
    const result = await notifyRunningLate(screening.id, picked, plan.arriveAt);
    setSending(false);
    if (result.error) onToast?.(result.error);
    else setNotified(result.data ?? picked.length);
  };

  const shareLate = async () => {
    if (!plan) return;
    const text = t('route.lateMessage', { time: clock(plan.arriveAt), title: screening.title });
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        onToast?.(t('route.copied'));
      }
    } catch {
      // Partage annulé : rien à signaler.
    }
  };

  const fixPlace = async () => {
    if (!typed.trim()) return;
    setFixBusy(true);
    const corrected = await correctCinemaPlace(screening.cinemaName, screening.cinemaAddress, typed).catch(() => null);
    setFixBusy(false);
    if (!corrected) {
      onToast?.(t('route.fixNotFound'));
      return;
    }
    setPlace(corrected);
    setFixing(false);
    setTyped('');
  };

  const pill =
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-xs font-black uppercase tracking-[.1em] transition active:scale-95';

  return createPortal(
    <div
      {...dialog.props}
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[2.5rem] bg-cream p-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] text-charcoal dark:bg-[#161616] dark:text-white"
      >
        <header className="flex items-center gap-3">
          <div className="h-[45px] w-[30px] shrink-0 overflow-hidden rounded-md bg-forest">
            {screening.posterUrl && <img src={screening.posterUrl} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-black tracking-tight">{screening.title}</h2>
            <p className="truncate text-[11px] font-semibold text-stone-500 dark:text-stone-400">
              {[clock(screening.startsAt), screening.cinemaName].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sand dark:bg-white/10"
          >
            <X size={18} />
          </button>
        </header>

        {phase === 'intro' && (
          <section className="mt-6 flex flex-col gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-bitter-lime text-[#111]">
              <Navigation size={26} />
            </div>
            <div>
              <h3 className="text-[26px] font-black leading-[1.05] tracking-[-0.04em]">{t('route.introTitle')}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">{t('route.introBody')}</p>
            </div>
            <div className="flex gap-2.5 rounded-[18px] bg-sand p-3.5 dark:bg-white/5">
              <Lock size={18} className="mt-0.5 shrink-0 text-forest dark:text-bitter-lime" />
              <p className="text-xs leading-relaxed text-stone-600 dark:text-stone-300">
                <b className="text-charcoal dark:text-white">{t('route.privacyStrong')}</b> {t('route.privacyBody')}
              </p>
            </div>
            <button type="button" onClick={() => setPhase('locating')} className={`${pill} bg-bitter-lime text-[#111]`}>
              {t('route.useLocation')}
            </button>
            <a href={links.google} target="_blank" rel="noreferrer" className="py-2 text-center text-[13px] font-bold text-stone-500">
              {t('route.justOpen')}
            </a>
          </section>
        )}

        {phase === 'locating' && (
          <div className="flex flex-col items-center gap-3 py-16 text-sm font-bold text-stone-500">
            <Loader2 className="animate-spin text-forest dark:text-bitter-lime" />
            {t('route.locating')}
          </div>
        )}

        {(phase === 'denied' || phase === 'failed') && (
          <section className="mt-6 flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-300">
              {t(phase === 'denied' ? 'route.denied' : 'route.failed')}
            </p>
            {phase === 'failed' && (
              <button type="button" onClick={() => setPhase('locating')} className={`${pill} border border-stone-300 dark:border-white/15`}>
                {t('route.retry')}
              </button>
            )}
            <a href={links.google} target="_blank" rel="noreferrer" className={`${pill} bg-bitter-lime text-[#111]`}>
              {t('route.openWith', { app: 'Google Maps' })}
            </a>
          </section>
        )}

        {phase === 'ready' && (
          <section className="mt-5 flex flex-col gap-4">
            <div className="rounded-[28px] bg-charcoal p-5 text-cream dark:bg-black">
              {started ? (
                <p className="text-2xl font-black tracking-tight">{t('route.started')}</p>
              ) : !plan ? (
                <>
                  <p className="text-[10px] font-black uppercase tracking-[.16em] text-stone-400">{t(`route.mode.${active}`)}</p>
                  <p className="mt-1 text-[26px] font-black leading-tight tracking-[-0.04em]">
                    {active === 'transit' && transit === undefined ? t('route.transitLoading') : t('route.transitBody')}
                  </p>
                </>
              ) : plan.late ? (
                <>
                  <p className="text-[10px] font-black uppercase tracking-[.16em] text-[#F08A24]">{t('route.leaveNow')}</p>
                  <p className="mt-1 whitespace-nowrap text-[34px] font-black leading-none tracking-[-0.05em] tabular-nums">
                    {t('route.arrival', { time: clock(plan.arriveAt) })}
                  </p>
                  <p className="mt-2 text-[13px] font-medium leading-snug text-stone-300">
                    {plan.arriveAt > screening.startsAt
                      ? t('route.lateBy', { n: formatMinutes(Math.round((plan.arriveAt - screening.startsAt) / 60_000)) })
                      : t('route.justInTime')}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[10px] font-black uppercase tracking-[.16em] text-stone-400">{t('route.leaveBefore')}</p>
                  <p className="mt-1 text-[64px] font-black leading-[0.95] tracking-[-0.06em] text-bitter-lime tabular-nums">
                    {clock(plan.leaveAt)}
                  </p>
                  <p className="mt-2 text-[13px] font-semibold text-stone-300">
                    {leaveIn <= 0 ? t('route.now') : t('route.inMinutes', { n: leaveIn })} ·{' '}
                    {t('route.arriveMargin', { time: clock(plan.arriveAt) })}
                  </p>
                </>
              )}
            </div>

            <div className="grid grid-cols-4 gap-2">
              {TRAVEL_MODES.map((key) => {
                const Icon = MODE_ICON[key];
                const value = minutes[key];
                const on = key === active;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    aria-label={t(`route.mode.${key}`)}
                    onClick={() => pick(key)}
                    className={`flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-[18px] transition active:scale-95 ${
                      on ? 'bg-charcoal text-cream dark:bg-white dark:text-charcoal' : 'bg-sand text-charcoal dark:bg-white/10 dark:text-white'
                    }`}
                  >
                    <Icon size={20} />
                    <span className="text-[13px] font-black tabular-nums">
                      {key === 'transit'
                        ? transit
                          ? formatMinutes(transit.trip.minutes)
                          : transit === null
                            ? t('route.seeMaps')
                            : '…'
                        : value != null
                          ? formatMinutes(value + MODE_EXTRA_MINUTES[key])
                          : '—'}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
              {active === 'car'
                ? t('route.carNote')
                : active === 'bike'
                  ? t('route.bikeNote')
                  : active === 'walk'
                    ? t('route.walkNote')
                    : transit
                      ? t(transit.trip.realTime ? 'route.transitRealtime' : 'route.transitScheduled')
                      : t('route.transitNote')}
            </p>

            {active === 'transit' && transit && (
              <ol className="flex flex-col gap-3 rounded-[22px] bg-white p-4 dark:bg-[#1A1A19]">
                {transit.trip.legs.map((leg, index) => (
                  <li key={index} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
                    {leg.line ? (
                      <span
                        className="min-w-8 rounded-md px-1.5 py-0.5 text-center text-xs font-black"
                        style={{ background: leg.color ?? '#1A1A1A', color: leg.textColor ?? '#FFFFFF' }}
                      >
                        {leg.line}
                      </span>
                    ) : (
                      <Footprints size={16} className="mx-2 mt-0.5 text-stone-500" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[13px] font-extrabold">
                        {leg.line
                          ? t('route.legRide', { headsign: leg.headsign ?? leg.to })
                          : leg.to
                            ? t('route.legWalkTo', { to: leg.to })
                            : t('route.legWalkEnd')}
                      </p>
                      {leg.line && (
                        <p className="mt-0.5 text-[11px] font-medium text-stone-500 dark:text-stone-400">
                          {t('route.legBoard', { time: clock(leg.departAt), from: leg.from })}
                          {leg.to ? ` · ${t('route.legAlight', { to: leg.to })}` : ''}
                        </p>
                      )}
                    </div>
                    <span className="text-xs font-extrabold tabular-nums">{formatMinutes(leg.minutes)}</span>
                  </li>
                ))}
              </ol>
            )}

            {plan?.late && !started && (
              <div className="flex flex-col gap-2 rounded-[22px] bg-sand p-4 dark:bg-white/5">
                <p className="text-[10px] font-black uppercase tracking-[.15em] text-stone-500 dark:text-stone-400">
                  {t('route.tellSomeone')}
                </p>
                {notified ? (
                  <p className="text-sm font-bold">{t('route.notified', { n: notified })}</p>
                ) : people === null ? (
                  <button type="button" onClick={loadPeople} className={`${pill} bg-charcoal text-cream dark:bg-white dark:text-charcoal`}>
                    <Bell size={15} />
                    {t('route.notifyBitter')}
                  </button>
                ) : people.length === 0 ? (
                  <p className="text-xs text-stone-500 dark:text-stone-400">{t('route.noPeople')}</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {people.map((person) => {
                        const on = picked.includes(person.profile_id);
                        return (
                          <button
                            key={person.profile_id}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              setPicked((current) =>
                                on ? current.filter((id) => id !== person.profile_id) : [...current, person.profile_id]
                              )
                            }
                            className={`inline-flex min-h-10 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs font-bold transition active:scale-95 ${
                              on ? 'bg-charcoal text-cream dark:bg-white dark:text-charcoal' : 'bg-white text-charcoal dark:bg-white/10 dark:text-white'
                            }`}
                          >
                            <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[#7FB8FF] text-[11px] font-black text-[#111]">
                              {person.avatar_url ? <img src={person.avatar_url} alt="" className="h-full w-full object-cover" /> : person.first_name.slice(0, 1)}
                            </span>
                            {person.first_name}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      disabled={!picked.length || sending}
                      onClick={sendLate}
                      className={`${pill} bg-charcoal text-cream disabled:opacity-40 dark:bg-white dark:text-charcoal`}
                    >
                      {sending ? <Loader2 size={15} className="animate-spin" /> : <Bell size={15} />}
                      {t('route.sendTo', { n: picked.length })}
                    </button>
                  </>
                )}
                <button type="button" onClick={shareLate} className="py-2 text-center text-[13px] font-bold text-stone-600 dark:text-stone-300">
                  {t('route.byMessage')}
                </button>
              </div>
            )}
          </section>
        )}

        {phase !== 'intro' && (
          <footer className="mt-5 flex flex-col gap-3">
            {phase === 'ready' && (
              <a href={active === 'car' ? links.waze : links.google} target="_blank" rel="noreferrer" className={`${pill} bg-bitter-lime text-[#111]`}>
                {t('route.openWith', { app: active === 'car' ? 'Waze' : 'Google Maps' })}
              </a>
            )}
            <p className="text-center text-xs font-semibold text-stone-500 dark:text-stone-400">
              {t('route.or')}{' '}
              <a href={links.apple} target="_blank" rel="noreferrer" className="font-black text-forest dark:text-bitter-lime">Plans</a>
              {active === 'car' ? (
                <>
                  ,{' '}
                  <a href={links.google} target="_blank" rel="noreferrer" className="font-black text-forest dark:text-bitter-lime">Google Maps</a>
                </>
              ) : (
                <>
                  ,{' '}
                  <a href={links.waze} target="_blank" rel="noreferrer" className="font-black text-forest dark:text-bitter-lime">Waze</a>
                </>
              )}
              {links.citymapper && (
                <>
                  ,{' '}
                  <a href={links.citymapper} target="_blank" rel="noreferrer" className="font-black text-forest dark:text-bitter-lime">Citymapper</a>
                </>
              )}
            </p>
            <p className="text-center text-[10px] text-stone-400">
              {active === 'transit' && transit && (
                <>
                  {t('route.creditTransit')}{' '}
                  <a href={TRANSITOUS_SOURCES} target="_blank" rel="noreferrer" className="underline">Transitous</a>
                  {' · '}
                </>
              )}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">
                © OpenStreetMap
              </a>
            </p>
            {place && (
              <div className="rounded-2xl border border-stone-200 p-3 text-[11px] text-stone-500 dark:border-white/10 dark:text-stone-400">
                {fixing ? (
                  <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void fixPlace();
                    }}
                  >
                    <label className="sr-only" htmlFor="route-fix">{t('route.fixLabel')}</label>
                    <input
                      id="route-fix"
                      value={typed}
                      onChange={(event) => setTyped(event.target.value)}
                      placeholder={t('route.fixPlaceholder')}
                      className="min-h-11 min-w-0 flex-1 rounded-xl bg-sand px-3 text-sm text-charcoal outline-none dark:bg-white/10 dark:text-white"
                    />
                    <button type="submit" disabled={fixBusy} className="rounded-xl bg-charcoal px-3 text-xs font-black text-cream disabled:opacity-50 dark:bg-white dark:text-charcoal">
                      {fixBusy ? <Loader2 size={14} className="animate-spin" /> : t('route.fixSave')}
                    </button>
                  </form>
                ) : (
                  <p>
                    {t('route.placeFound', { place: place.label })}{' '}
                    <button type="button" onClick={() => setFixing(true)} className="font-black text-forest underline dark:text-bitter-lime">
                      {t('route.fix')}
                    </button>
                  </p>
                )}
              </div>
            )}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}
