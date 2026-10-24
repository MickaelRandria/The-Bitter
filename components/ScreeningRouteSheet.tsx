import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Bell,
  Bike,
  Car,
  ChevronDown,
  ChevronRight,
  Footprints,
  Loader2,
  Lock,
  Maximize2,
  Navigation,
  ParkingSquare,
  TrainFront,
  X,
} from 'lucide-react';
import { CinemaScreening } from '../types';
import { useDialog } from '../utils/useDialog';
import { useLanguage } from '../contexts/LanguageContext';
import { Companion, getCompanions, notifyRunningLate } from '../services/social';
import { getMovieDetailsForAdd } from '../services/tmdb';
import {
  BikeStation,
  CinemaPlace,
  LatLng,
  LiveTrip,
  MODE_EXTRA_MINUTES,
  ReturnOptions,
  RoadRoute,
  TRAILERS_MINUTES,
  TRANSITOUS_SOURCES,
  TRAVEL_MODES,
  TransitLeg,
  TransitTrip,
  TravelMode,
  bikeStationNear,
  correctCinemaPlace,
  currentPosition,
  departureFor,
  formatMinutes,
  hasGeoConsent,
  liveTrip,
  locateCinema,
  mapsLinks,
  readSavedMode,
  returnOptions,
  saveGeoConsent,
  saveMode,
  screeningExit,
  transitTrip,
  travelRoutes,
  vehicleAt,
} from '../services/travel';
import type { RouteSegment, RouteVehicle } from './RouteMap';

const RouteMap = lazy(() => import('./RouteMap'));

const MODE_ICON: Record<TravelMode, typeof Car> = { transit: TrainFront, car: Car, bike: Bike, walk: Footprints };

type Phase = 'intro' | 'locating' | 'ready' | 'denied' | 'failed';

/** Le direct ne sert qu'à l'approche : on suit le bus dans la demi-heure avant de monter. */
const LIVE_WINDOW_MS = 30 * 60_000;
const LIVE_REFRESH_MS = 45_000;

/**
 * « Quand partir ? » : ouvert depuis le rappel de séance ou la carte de la
 * séance. La position n'est lue qu'ici, avec l'accord de l'utilisateur, et
 * ne quitte pas le téléphone (voir services/travel).
 */
export default function ScreeningRouteSheet({
  screening,
  runtime,
  onClose,
  onToast,
}: {
  screening: CinemaScreening;
  /** Durée du film en minutes, quand l'app la connaît déjà. */
  runtime?: number;
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
  const [dark] = useState(() => document.documentElement.classList.contains('dark'));

  const [phase, setPhase] = useState<Phase>(() => (hasGeoConsent() ? 'locating' : 'intro'));
  const [place, setPlace] = useState<CinemaPlace | null>(null);
  const [placeMissing, setPlaceMissing] = useState(false);
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [routes, setRoutes] = useState<Partial<Record<TravelMode, RoadRoute>>>({});
  const [mode, setMode] = useState<TravelMode | null>(readSavedMode);
  const [now, setNow] = useState(Date.now());
  /** undefined : en cours ; null : pas de transports utiles. */
  const [transit, setTransit] = useState<{ trip: TransitTrip; late: boolean } | null | undefined>(undefined);
  const [transitTick, setTransitTick] = useState(0);
  const [tab, setTab] = useState<'go' | 'back'>('go');
  const [details, setDetails] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [live, setLive] = useState<LiveTrip | null>(null);
  const [filmMinutes, setFilmMinutes] = useState<number | undefined>(runtime || undefined);
  /** undefined : pas encore demandé ; null : échec. */
  const [back, setBack] = useState<ReturnOptions | null | undefined>(undefined);
  const [bikeBack, setBikeBack] = useState<BikeStation | null>(null);
  const [fixing, setFixing] = useState(false);
  const [typed, setTyped] = useState('');
  const [fixBusy, setFixBusy] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
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
      travelRoutes(origin, place, controller.signal),
      transitTrip(origin, place, screening.startsAt, Date.now(), controller.signal).catch(() => null),
    ]).then(([found, bus]) => {
      if (controller.signal.aborted) return;
      setRoutes(found);
      setTransit(bus);
      setPhase(Object.keys(found).length || bus ? 'ready' : 'failed');
      // Sans choix enregistré : à pied si c'est court, sinon les transports, sinon la voiture.
      setMode((current) => current ?? ((found.walk?.minutes ?? 99) <= 20 ? 'walk' : bus ? 'transit' : 'car'));
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
    setDetails(false);
  };

  const active = mode ?? 'car';
  const links = mapsLinks(screening.cinemaName, screening.cinemaAddress, place, active);
  const road = active === 'transit' ? undefined : routes[active];
  const plan = useMemo(() => {
    if (active === 'transit') {
      if (!transit) return null;
      const late = transit.late || transit.trip.departAt < now;
      return { leaveAt: transit.trip.departAt, arriveAt: transit.trip.arriveAt, late };
    }
    return road ? departureFor(screening.startsAt, road.minutes, active, now) : null;
  }, [road, active, screening.startsAt, now, transit]);
  const leaveIn = plan && !plan.late ? Math.round((plan.leaveAt - now) / 60_000) : 0;
  const started = screening.startsAt <= now;

  // ─── Le bus à prendre, suivi en direct ────────────────────────────────────
  const boarding: TransitLeg | undefined =
    active === 'transit' ? transit?.trip.legs.find((leg) => leg.mode !== 'WALK') : undefined;
  const followLive =
    !!boarding?.tripId && boarding.departAt - now < LIVE_WINDOW_MS && boarding.departAt - now > -2 * 60_000;
  useEffect(() => {
    if (!followLive || !boarding?.tripId) {
      setLive(null);
      return;
    }
    const tripId = boarding.tripId;
    let controller = new AbortController();
    const load = () => {
      controller.abort();
      controller = new AbortController();
      liveTrip(tripId, controller.signal)
        .then((found) => setLive(found))
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, LIVE_REFRESH_MS);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [followLive, boarding?.tripId]);
  const vehicle = live ? vehicleAt(live, now) : null;
  const boardingStop = useMemo(() => {
    if (!live || !boarding) return -1;
    // Une course peut passer deux fois au même arrêt (lignes en boucle) : on
    // retient le passage à l'heure de la montée, pas le premier venu.
    let best = -1;
    let gap = Infinity;
    live.stops.forEach((stop, index) => {
      if (stop.name !== boarding.from) return;
      const distance = Math.abs(stop.departAt - boarding.departAt);
      if (distance < gap) {
        gap = distance;
        best = index;
      }
    });
    return best;
  }, [live, boarding]);
  const stopsAway = vehicle && boardingStop >= 0 ? boardingStop - vehicle.nextStop + 1 : null;
  const mapVehicle: RouteVehicle | null =
    vehicle && boarding && stopsAway != null && stopsAway >= 0
      ? { point: vehicle.point, label: boarding.line ?? '', color: boarding.color ?? '#1A1A1A', textColor: boarding.textColor ?? '#FFFFFF' }
      : null;
  const delay = boarding?.delayMin ?? 0;

  // ─── Le tracé à dessiner ─────────────────────────────────────────────────
  const routeColor = dark ? '#D9FF00' : '#1A1A1A';
  const legSegments = (legs: TransitLeg[]): RouteSegment[] =>
    legs.map((leg) => ({
      walk: leg.mode === 'WALK',
      color: leg.color ?? routeColor,
      path:
        leg.path.length > 1
          ? leg.path
          : leg.fromPoint && leg.toPoint
            ? [
                [leg.fromPoint.lng, leg.fromPoint.lat],
                [leg.toPoint.lng, leg.toPoint.lat],
              ]
            : [],
    }));
  const legStops = (legs: TransitLeg[]) =>
    legs
      .filter((leg) => leg.mode !== 'WALK')
      .flatMap((leg) =>
        [leg.fromPoint, leg.toPoint].filter((p): p is LatLng => !!p).map((p) => ({ ...p, color: leg.color ?? routeColor }))
      );
  const segments: RouteSegment[] = useMemo(() => {
    if (active === 'transit') return legSegments(transit?.trip.legs ?? []);
    return road ? [{ walk: active === 'walk', color: routeColor, path: road.path }] : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, transit, road, routeColor]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stops = useMemo(() => (active === 'transit' ? legStops(transit?.trip.legs ?? []) : []), [active, transit, routeColor]);

  // ─── Le retour, calculé à la première ouverture de l'onglet ──────────────
  const exitAt = screeningExit(screening.startsAt, filmMinutes);
  useEffect(() => {
    if (tab !== 'back' || filmMinutes || !screening.tmdbId) return;
    let cancelled = false;
    getMovieDetailsForAdd(screening.tmdbId).then((details) => {
      if (!cancelled && details?.runtime) setFilmMinutes(details.runtime);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, filmMinutes, screening.tmdbId]);
  useEffect(() => {
    if (tab !== 'back' || back !== undefined || !origin || !place || !exitAt) return;
    const controller = new AbortController();
    Promise.all([
      returnOptions(place, origin, exitAt, controller.signal).catch(() => null),
      bikeStationNear(place, controller.signal).catch(() => null),
    ]).then(([options, station]) => {
      if (controller.signal.aborted) return;
      setBack(options);
      setBikeBack(station);
    });
    return () => controller.abort();
  }, [tab, back, origin, place, exitAt]);

  const backSegments: RouteSegment[] = useMemo(() => {
    if (back?.trips[0]) return legSegments(back.trips[0].legs);
    return routes.walk ? [{ walk: true, color: routeColor, path: [...routes.walk.path].reverse() }] : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [back, routes.walk, routeColor]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const backStops = useMemo(() => (back?.trips[0] ? legStops(back.trips[0].legs) : []), [back, routeColor]);
  const mapSegments = tab === 'go' ? segments : backSegments;
  const mapStops = tab === 'go' ? stops : backStops;

  // ─── Prévenir d'un retard ────────────────────────────────────────────────
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
    setBack(undefined);
    setFixing(false);
    setTyped('');
  };

  const pill =
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-xs font-black uppercase tracking-[.1em] transition active:scale-95';
  const lineBadge = (leg: TransitLeg, extra = '') => (
    <span
      className={`inline-block min-w-7 rounded-md px-1.5 py-0.5 text-center text-xs font-black ${extra}`}
      style={{ background: leg.color ?? '#1A1A1A', color: leg.textColor ?? '#FFFFFF' }}
    >
      {leg.line}
    </span>
  );
  const chevron = <ChevronRight size={12} strokeWidth={3} className="shrink-0 text-stone-400" />;

  /** Les étapes en une ligne de pastilles : 🚶 4 min › G 19 h 59 › 🚶 4 min. */
  const strip = (
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto whitespace-nowrap pr-4 text-xs font-extrabold [mask-image:linear-gradient(to_right,black_88%,transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {active === 'transit' && transit
        ? transit.trip.legs.map((leg, index) => (
            <React.Fragment key={index}>
              {index > 0 && chevron}
              {leg.line ? (
                <span className="inline-flex items-center gap-1.5">
                  {lineBadge(leg)}
                  <span className="tabular-nums">{clock(leg.departAt)}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Footprints size={14} />
                  {formatMinutes(leg.minutes)}
                </span>
              )}
            </React.Fragment>
          ))
        : road && (
            <>
              <span className="inline-flex items-center gap-1">
                {React.createElement(MODE_ICON[active], { size: 14 })}
                {formatMinutes(road.minutes)} · {road.km.toLocaleString(locale)} km
              </span>
              {MODE_EXTRA_MINUTES[active] > 0 && (
                <>
                  {chevron}
                  <span className="inline-flex items-center gap-1">
                    {active === 'car' ? <ParkingSquare size={14} /> : <Lock size={14} />}
                    {formatMinutes(MODE_EXTRA_MINUTES[active])}
                  </span>
                </>
              )}
            </>
          )}
    </div>
  );

  const credit = (
    <p className="text-center text-[10px] text-stone-400">
      {active === 'transit' && transit && (
        <>
          {t('route.creditTransit')}{' '}
          <a href={TRANSITOUS_SOURCES} target="_blank" rel="noreferrer" className="underline">Transitous</a>
          {' · '}
        </>
      )}
      {t('route.mapCredit')}{' '}
      <a href="https://openfreemap.org" target="_blank" rel="noreferrer" className="underline">OpenFreeMap</a>,{' '}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">© OpenStreetMap</a>
    </p>
  );

  const goButton = (
    <a href={active === 'car' ? links.waze : links.google} target="_blank" rel="noreferrer" className={`${pill} bg-bitter-lime text-[#111]`}>
      {t('route.openWith', { app: active === 'car' ? 'Waze' : 'Google Maps' })}
    </a>
  );

  const map = (interactive: boolean, padding?: { top: number; bottom: number; left: number; right: number }) =>
    origin && place ? (
      <Suspense fallback={<div className="h-full w-full animate-pulse bg-sand dark:bg-white/5" />}>
        <RouteMap
          origin={origin}
          destination={place}
          segments={mapSegments}
          stops={mapStops}
          vehicle={tab === 'go' ? mapVehicle : null}
          dark={dark}
          interactive={interactive}
          padding={padding}
          onError={() => setMapFailed(true)}
        />
      </Suspense>
    ) : null;

  const hero = (
    <div className="rounded-[26px] bg-charcoal p-5 text-cream dark:border dark:border-white/10 dark:bg-black">
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
          <p className="mt-1 flex items-baseline gap-3">
            <span className="text-[56px] font-black leading-[0.95] tracking-[-0.06em] text-bitter-lime tabular-nums">
              {clock(plan.leaveAt)}
            </span>
            {delay > 0 && (
              <span className="text-base font-extrabold text-stone-500 line-through tabular-nums">
                {clock(plan.leaveAt - delay * 60_000)}
              </span>
            )}
          </p>
          <p className="mt-2 text-[13px] font-semibold text-stone-300">
            {leaveIn <= 0 ? t('route.now') : t('route.inTime', { time: formatMinutes(leaveIn) })} ·{' '}
            {t('route.arriveMargin', { time: clock(plan.arriveAt) })}
          </p>
          {delay > 0 && <p className="mt-1 text-xs font-semibold text-stone-300">{t('route.delayed', { n: delay })}</p>}
        </>
      )}
    </div>
  );

  const backHero = (
    <div className="rounded-[26px] bg-charcoal p-5 text-cream dark:border dark:border-white/10 dark:bg-black">
      {exitAt ? (
        <>
          <p className="text-[10px] font-black uppercase tracking-[.16em] text-stone-400">{t('route.exitLabel')}</p>
          <p className="mt-1 text-[56px] font-black leading-[0.95] tracking-[-0.06em] text-bitter-lime tabular-nums">{clock(exitAt)}</p>
          {filmMinutes && (
            <p className="mt-2 text-xs font-medium leading-relaxed text-stone-300">
              {t('route.exitFormula', { start: clock(screening.startsAt), trailers: TRAILERS_MINUTES, runtime: formatMinutes(filmMinutes) })}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm font-semibold text-stone-300">
          {screening.tmdbId && !filmMinutes ? t('route.backLoading') : t('route.exitUnknown')}
        </p>
      )}
    </div>
  );

  /** La carte en tête de feuille, à fond perdu, qui se fond dans le fond de la feuille. */
  const mapHeader = (
    <div className="relative -mx-5 -mt-5 h-[400px] overflow-hidden rounded-t-[2.5rem] bg-sand dark:bg-[#121211]">
      {!mapFailed && map(false, { top: 130, bottom: 124, left: 44, right: 64 })}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-cream/90 to-transparent dark:from-[#161616]/90" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-cream via-cream/70 to-transparent dark:from-[#161616] dark:via-[#161616]/70" />
      <div className="absolute inset-x-4 top-4 flex items-start gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full bg-cream/85 py-1.5 pl-1.5 pr-4 shadow-sm backdrop-blur-md dark:bg-[#1A1A19]/85">
          <div className="h-10 w-7 shrink-0 overflow-hidden rounded-md bg-forest">
            {screening.posterUrl && <img src={screening.posterUrl} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-black tracking-tight">{screening.title}</h2>
            <p className="truncate text-[11px] font-semibold text-stone-500 dark:text-stone-400">
              {[clock(screening.startsAt), screening.cinemaName].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream/85 shadow-sm backdrop-blur-md dark:bg-[#1A1A19]/85"
        >
          <X size={18} />
        </button>
      </div>
      {tab === 'go' && stopsAway != null && stopsAway >= 0 && boarding && (
        <div className="absolute left-4 top-[72px] flex items-center gap-2 rounded-full bg-charcoal py-1.5 pl-1.5 pr-3 text-[11px] font-extrabold text-cream shadow-lg">
          {lineBadge(boarding, 'rounded-full')}
          {stopsAway === 0 ? t('route.liveHere') : t(stopsAway === 1 ? 'route.liveAwayOne' : 'route.liveAway', { n: stopsAway })}
          <span className="inline-flex items-center gap-1 text-bitter-lime">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-bitter-lime" />
            {t('route.live')}
          </span>
        </div>
      )}
      {!mapFailed && (
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          aria-label={t('route.expandMap')}
          className="absolute right-4 top-[68px] flex h-11 w-11 items-center justify-center rounded-2xl bg-cream/85 text-charcoal shadow-sm backdrop-blur-md dark:bg-[#1A1A19]/85 dark:text-white"
        >
          <Maximize2 size={18} />
        </button>
      )}
    </div>
  );

  return createPortal(
    <div
      {...dialog.props}
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-t-[2.5rem] bg-cream p-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] text-charcoal dark:bg-[#161616] dark:text-white"
      >
        {phase === 'ready' && (
          <>
            {mapHeader}
            <div className="relative -mt-24 mx-1">{tab === 'go' ? hero : backHero}</div>
          </>
        )}
        {phase !== 'ready' && (
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
        )}

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
          <div className="mt-3 grid grid-cols-2 rounded-full bg-sand p-1 dark:bg-white/10" role="tablist">
            {(['go', 'back'] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`min-h-10 rounded-full text-[11px] font-black uppercase tracking-[.08em] transition ${
                  tab === key ? 'bg-charcoal text-cream dark:bg-white dark:text-charcoal' : 'text-stone-500 dark:text-stone-400'
                }`}
              >
                {key === 'go' ? t('route.tabGo') : t('route.tabBack')}
                {key === 'go' && plan && !plan.late && <span className="normal-case tracking-normal"> · {clock(plan.leaveAt)}</span>}
                {key === 'back' && exitAt && <span className="normal-case tracking-normal"> · {clock(exitAt)}</span>}
              </button>
            ))}
          </div>
        )}

        {phase === 'ready' && tab === 'go' && (
          <section className="mt-4 flex flex-col gap-4">

            <div className="grid grid-cols-4 gap-2">
              {TRAVEL_MODES.map((key) => {
                const Icon = MODE_ICON[key];
                const value = key === 'transit' ? undefined : routes[key]?.minutes;
                const on = key === active;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    aria-label={t(`route.mode.${key}`)}
                    onClick={() => pick(key)}
                    className={`flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-[16px] transition active:scale-95 ${
                      on ? 'bg-charcoal text-cream dark:bg-white dark:text-charcoal' : 'bg-sand text-charcoal dark:bg-white/10 dark:text-white'
                    }`}
                  >
                    <Icon size={18} />
                    <span className="text-xs font-black tabular-nums">
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

            {(transit || road) && (active !== 'transit' || transit) && (
              <button
                type="button"
                onClick={() => active === 'transit' && setDetails((open) => !open)}
                aria-expanded={active === 'transit' ? details : undefined}
                className="flex min-h-[52px] items-center gap-2 rounded-[18px] bg-white px-3 text-left dark:bg-[#1A1A19]"
              >
                {strip}
                {active === 'transit' && (
                  <span className="ml-auto flex shrink-0 items-center gap-1 pl-2 text-[11px] font-extrabold text-forest dark:text-bitter-lime">
                    {details ? t('route.hideDetails') : t('route.details')}
                    <ChevronDown size={14} strokeWidth={3} className={`transition ${details ? 'rotate-180' : ''}`} />
                  </span>
                )}
              </button>
            )}

            {active === 'transit' && transit && details && (
              <ol className="grid grid-cols-[62px_18px_minmax(0,1fr)] gap-x-2.5 rounded-[22px] bg-white p-4 dark:bg-[#1A1A19]">
                {transit.trip.legs.map((leg, index) => (
                  <li key={index} className="contents">
                    <p className="whitespace-nowrap pt-px text-[13px] font-black tabular-nums">{clock(leg.departAt)}</p>
                    <div className="flex flex-col items-center">
                      <span
                        className="h-3.5 w-3.5 rounded-full border-[3px] bg-white"
                        style={{ borderColor: leg.line ? leg.color ?? '#1A1A1A' : routeColor }}
                      />
                      {leg.line ? (
                        <span className="my-1 w-1.5 flex-1 rounded" style={{ background: leg.color ?? '#1A1A1A' }} />
                      ) : (
                        <span className="my-1 flex-1 border-l-[3px] border-dotted border-charcoal dark:border-white" />
                      )}
                    </div>
                    <div className="pb-4">
                      {leg.line ? (
                        <>
                          <p className="flex items-center gap-1.5 text-sm font-extrabold">
                            {lineBadge(leg)}
                            {t('route.legRide', { headsign: leg.headsign ?? leg.to })}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                            {t('route.legBoard', { time: clock(leg.departAt), from: leg.from })}
                            {leg.stops > 0 && ` · ${t('route.stopsCount', { n: leg.stops })}`}
                            {leg.to && (
                              <>
                                <br />
                                {t('route.legAlight', { to: leg.to })} · {formatMinutes(leg.minutes)}
                              </>
                            )}
                          </p>
                          {delay > 0 && leg === boarding && (
                            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[#EEF5CC] px-2.5 py-1 text-[11px] font-extrabold text-forest dark:bg-bitter-lime/15 dark:text-bitter-lime">
                              <span className="h-1.5 w-1.5 rounded-full bg-current" />
                              {t('route.liveDelay', { time: clock(leg.departAt - delay * 60_000), n: delay })}
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-extrabold">{leg.to ? t('route.legWalkTo', { to: leg.to }) : t('route.legWalkEnd')}</p>
                          <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{formatMinutes(leg.minutes)}</p>
                        </>
                      )}
                    </div>
                  </li>
                ))}
                <li className="contents">
                  <p className="whitespace-nowrap text-[13px] font-black tabular-nums">{clock(transit.trip.arriveAt)}</p>
                  <div className="flex justify-center">
                    <span className="flex h-4 w-4 items-center justify-center rounded-[5px] bg-charcoal dark:bg-bitter-lime">
                      <span className="h-1.5 w-2 rounded-[1px] bg-bitter-lime dark:bg-charcoal" />
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-extrabold">{screening.cinemaName ?? t('route.cinema')}</p>
                    <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{t('route.arriveBefore', { time: clock(screening.startsAt) })}</p>
                  </div>
                </li>
              </ol>
            )}

            {active === 'transit' &&
              transit?.trip.alerts.map((alert) => (
                <details key={alert.header} className="rounded-[18px] bg-[#FFF4E6] px-4 py-3 dark:bg-[#F08A24]/15">
                  <summary className="flex cursor-pointer list-none items-start gap-2.5">
                    <AlertTriangle size={17} className="mt-0.5 shrink-0 text-[#9A4A00] dark:text-[#F08A24]" />
                    <span className="min-w-0 text-[13px] font-extrabold">
                      {alert.line && <span className="mr-1">{t('route.alertLine', { line: alert.line })}</span>}
                      {alert.header}
                    </span>
                  </summary>
                  {alert.description && (
                    <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-stone-600 dark:text-stone-300">{alert.description}</p>
                  )}
                </details>
              ))}

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

        {phase === 'ready' && tab === 'back' && (
          <section className="mt-4 flex flex-col gap-4">

            {exitAt && (
              <>
                <p className="text-[10px] font-black uppercase tracking-[.15em] text-stone-500 dark:text-stone-400">{t('route.backTo')}</p>
                {back === undefined ? (
                  <div className="flex items-center gap-2 py-6 text-sm font-bold text-stone-500">
                    <Loader2 size={16} className="animate-spin" />
                    {t('route.backLoading')}
                  </div>
                ) : (
                  <div className="flex flex-col rounded-[22px] bg-white px-4 py-1.5 dark:bg-[#1A1A19]">
                    {back?.noTransit ? (
                      <div className="flex items-start gap-3 border-b border-stone-100 py-3 dark:border-white/5">
                        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#F08A24]" />
                        <p className="text-[13px] font-extrabold text-[#9A4A00] dark:text-[#F08A24]">{t('route.noTransit')}</p>
                      </div>
                    ) : back?.trips[0] ? (
                      (() => {
                        const first = back.trips[0];
                        const ride = first.legs.find((leg) => leg.line);
                        return (
                          <div className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-stone-100 py-3 dark:border-white/5">
                            <span className="justify-self-center">{ride ? lineBadge(ride) : <TrainFront size={18} />}</span>
                            <div className="min-w-0">
                              <p className="text-[13px] font-extrabold">
                                {back.trips.length > 1
                                  ? t('route.backNext', { first: clock(first.departAt), second: clock(back.trips[1].departAt) })
                                  : clock(first.departAt)}
                              </p>
                              {ride?.from && <p className="mt-0.5 truncate text-[11px] text-stone-500 dark:text-stone-400">{ride.from}</p>}
                            </div>
                            <span className="text-xs font-black tabular-nums">{formatMinutes(first.minutes)}</span>
                          </div>
                        );
                      })()
                    ) : null}
                    {bikeBack && (
                      <div className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-stone-100 py-3 dark:border-white/5">
                        <Bike size={19} className="justify-self-center" />
                        <div className="min-w-0">
                          <p className="text-[13px] font-extrabold">{t('route.bikeShare')}</p>
                          <p className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
                            {t(bikeBack.available === 1 ? 'route.bikeStationOne' : 'route.bikeStation', { n: bikeBack.available, name: bikeBack.name, m: bikeBack.meters })}
                          </p>
                        </div>
                        {routes.bike && <span className="text-xs font-black tabular-nums">{formatMinutes(routes.bike.minutes)}</span>}
                      </div>
                    )}
                    {routes.walk && (
                      <div className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2.5 py-3">
                        <Footprints size={19} className="justify-self-center" />
                        <div className="min-w-0">
                          <p className="text-[13px] font-extrabold">{t('route.mode.walk')}</p>
                          <p className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">{routes.walk.km.toLocaleString(locale)} km</p>
                        </div>
                        <span className="text-xs font-black tabular-nums">{formatMinutes(routes.walk.minutes)}</span>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">{t('route.backNote')}</p>
              </>
            )}
          </section>
        )}

        {phase !== 'intro' && (
          <footer className="mt-5 flex flex-col gap-3">
            {phase === 'ready' && tab === 'go' && goButton}
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
            {credit}
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

      {fullscreen && phase === 'ready' && (
        <div className="fixed inset-0 z-[210] bg-sand dark:bg-[#141413]" onClick={(event) => event.stopPropagation()}>
          <div className="absolute inset-0">{map(true, { top: 110, bottom: 300, left: 40, right: 40 })}</div>
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            aria-label={t('route.closeMap')}
            className="absolute left-4 top-[calc(env(safe-area-inset-top,0px)+16px)] flex h-11 w-11 items-center justify-center rounded-full bg-cream text-charcoal shadow-lg dark:bg-[#1A1A19] dark:text-white"
          >
            <X size={20} />
          </button>
          {stopsAway != null && stopsAway >= 0 && boarding && (
            <div className="absolute right-4 top-[calc(env(safe-area-inset-top,0px)+20px)] flex items-center gap-2 rounded-full bg-charcoal py-1.5 pl-1.5 pr-3 text-[11px] font-extrabold text-cream shadow-lg">
              {lineBadge(boarding, 'rounded-full')}
              {stopsAway === 0 ? t('route.liveHere') : t(stopsAway === 1 ? 'route.liveAwayOne' : 'route.liveAway', { n: stopsAway })}
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 rounded-t-[30px] bg-cream p-4 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] text-charcoal shadow-[0_-8px_30px_rgba(0,0,0,0.12)] dark:bg-[#161616] dark:text-white">
            {plan && !started && (
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-2xl font-black tracking-[-0.045em]">
                  {plan.late ? (
                    t('route.arrival', { time: clock(plan.arriveAt) })
                  ) : (
                    <>
                      {t('route.leaveBefore')}{' '}
                      <span className="rounded-lg bg-bitter-lime px-1.5 text-[#111] tabular-nums">{clock(plan.leaveAt)}</span>
                    </>
                  )}
                </p>
                {!plan.late && (
                  <p className="whitespace-nowrap text-xs font-bold text-stone-500 dark:text-stone-400">
                    {leaveIn <= 0 ? t('route.now') : t('route.inTime', { time: formatMinutes(leaveIn) })}
                  </p>
                )}
              </div>
            )}
            {strip}
            {goButton}
            {credit}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
