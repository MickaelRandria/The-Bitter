/**
 * Trajet jusqu'à une séance : où est le cinéma, combien de temps pour y aller,
 * et quand partir.
 *
 * Tout se passe sur le téléphone. La position de l'utilisateur n'est jamais
 * envoyée à notre base : elle ne sert qu'à interroger les calculs d'itinéraire
 * publics, le temps d'afficher l'écran — OpenStreetMap (FOSSGIS) pour la
 * voiture, le vélo et la marche, Transitous pour les transports en commun.
 *
 * Transitous est un service bénévole réservé aux projets libres et non
 * commerciaux (https://transitous.org/api/) : il exige un lien vers ses sources
 * à l'écran, et un contact avant toute hausse sensible du nombre de requêtes.
 */

export type TravelMode = 'transit' | 'car' | 'bike' | 'walk';
export const TRAVEL_MODES: TravelMode[] = ['transit', 'car', 'bike', 'walk'];

export interface LatLng {
  lat: number;
  lng: number;
}

export interface CinemaPlace extends LatLng {
  /** Ce que la carte a trouvé, affiché pour qu'on repère une mauvaise salle. */
  label: string;
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM = 'https://routing.openstreetmap.de';
const TRANSITOUS = 'https://api.transitous.org/api/v5/plan';
export const TRANSITOUS_SOURCES = 'https://transitous.org/sources/';
const TRANSITOUS_RENTALS = 'https://api.transitous.org/api/v1/rentals';
const TRANSITOUS_TRIP = 'https://api.transitous.org/api/v5/trip';
const OSRM_PROFILE: Record<Exclude<TravelMode, 'transit'>, string> = {
  car: 'routed-car',
  bike: 'routed-bike',
  walk: 'routed-foot',
};

/** Garer la voiture, attacher le vélo : le temps que l'itinéraire ne compte pas. */
export const MODE_EXTRA_MINUTES: Record<TravelMode, number> = { transit: 0, car: 5, bike: 2, walk: 0 };
/** Arriver un peu avant l'heure : billet, pop-corn, trouver sa place. */
export const ARRIVAL_MARGIN_MINUTES = 5;

const PLACE_CACHE_KEY = 'bitter_cinema_places_v1';
const MODE_KEY = 'bitter_route_mode_v1';
const GEO_CONSENT_KEY = 'bitter_route_geo_v1';

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Stockage indisponible : on recalculera la prochaine fois.
  }
};

export const readSavedMode = (): TravelMode | null => {
  const saved = readJson<string | null>(MODE_KEY, null);
  return TRAVEL_MODES.includes(saved as TravelMode) ? (saved as TravelMode) : null;
};
export const saveMode = (mode: TravelMode) => writeJson(MODE_KEY, mode);
export const hasGeoConsent = () => readJson<boolean>(GEO_CONSENT_KEY, false);
export const saveGeoConsent = () => writeJson(GEO_CONSENT_KEY, true);

const placeKey = (name?: string, address?: string) =>
  `${(name ?? '').trim().toLowerCase()}|${(address ?? '').trim().toLowerCase()}`;

const normalise = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Mots qui ne distinguent pas deux salles d'une même ville. */
const GENERIC_WORDS = new Set([
  'ugc', 'cine', 'cite', 'cinema', 'cinemas', 'pathe', 'gaumont', 'mk2', 'cgr', 'megarama',
  'kinepolis', 'le', 'la', 'les', 'de', 'du', 'des', 'et', 'l', 'd', 'salle', 'multiplexe',
]);
const words = (value: string) => normalise(value).split(/[^a-z0-9]+/).filter((w) => w.length > 1);

interface NominatimHit {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  category?: string;
  type?: string;
}

const search = async (params: Record<string, string>, signal?: AbortSignal): Promise<NominatimHit[]> => {
  const query = new URLSearchParams({ format: 'jsonv2', countrycodes: 'fr', 'accept-language': 'fr', ...params });
  const response = await fetch(`${NOMINATIM}?${query}`, { signal });
  if (!response.ok) throw new Error('geocoding-unavailable');
  return (await response.json()) as NominatimHit[];
};

const toPlace = (hit: NominatimHit): CinemaPlace => ({
  lat: Number(hit.lat),
  lng: Number(hit.lon),
  label: hit.display_name.split(',').slice(0, 3).join(',').trim(),
});

const distanceKm = (a: LatLng, b: LatLng) => {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
};

/**
 * Retrouve un cinéma sur la carte. Les séances UGC ne gardent que la ville comme
 * adresse, et OpenStreetMap nomme souvent la salle « UGC » tout court : on liste
 * donc les cinémas de la ville, puis on départage par les mots propres à la salle
 * (« Gambetta »), géolocalisés à part quand ils ne figurent pas dans le nom.
 */
export async function locateCinema(
  name?: string,
  address?: string,
  signal?: AbortSignal
): Promise<CinemaPlace | null> {
  const key = placeKey(name, address);
  const cache = readJson<Record<string, CinemaPlace>>(PLACE_CACHE_KEY, {});
  if (cache[key]) return cache[key];

  const remember = (place: CinemaPlace | null) => {
    if (place) writeJson(PLACE_CACHE_KEY, { ...readJson(PLACE_CACHE_KEY, {}), [key]: place });
    return place;
  };
  const cleanAddress = (address ?? '').trim();
  const cleanName = (name ?? '').trim();

  // Une vraie adresse (avec un numéro) se géolocalise directement.
  if (/\d/.test(cleanAddress)) {
    const hits = await search({ q: cleanAddress, limit: '1' }, signal);
    if (hits[0]) return remember(toPlace(hits[0]));
  }

  const city = cleanAddress || cleanName.split(/\s+/).find((w) => w.length > 3) || '';
  if (cleanName && city) {
    // L'enseigne + la ville (« UGC Bordeaux ») : la recherche structurée par
    // ville, elle, rate les multiplexes rangés sous un nom d'enseigne.
    const brand = cleanName.split(/\s+/)[0];
    const hits = (await search({ q: `${brand} ${city}`, limit: '15' }, signal)).filter(
      (hit) => hit.category === 'amenity' && hit.type === 'cinema'
    );
    const nameWords = words(cleanName);
    const cityWords = new Set(words(city));
    const scored = hits.map((hit) => {
      const haystack = new Set(words(`${hit.name ?? ''} ${hit.display_name}`));
      return { hit, score: nameWords.filter((w) => haystack.has(w)).length };
    });
    const best = Math.max(0, ...scored.map((s) => s.score));
    const tied = scored.filter((s) => s.score === best && best > 0);
    if (tied.length === 1) return remember(toPlace(tied[0].hit));
    if (tied.length > 1) {
      const distinctive = nameWords.filter((w) => !GENERIC_WORDS.has(w) && !cityWords.has(w));
      if (distinctive.length) {
        const [anchor] = await search({ q: `${distinctive.join(' ')}, ${city}`, limit: '1' }, signal);
        if (anchor) {
          const point = toPlace(anchor);
          tied.sort((a, b) => distanceKm(point, toPlace(a.hit)) - distanceKm(point, toPlace(b.hit)));
        }
      }
      return remember(toPlace(tied[0].hit));
    }
  }

  if (cleanName) {
    const hits = await search({ q: [cleanName, cleanAddress].filter(Boolean).join(', '), limit: '1' }, signal);
    if (hits[0]) return remember(toPlace(hits[0]));
  }
  return null;
}

/** « Pas le bon endroit ? » : l'adresse tapée remplace celle trouvée, pour ce cinéma. */
export async function correctCinemaPlace(
  name: string | undefined,
  address: string | undefined,
  typed: string
): Promise<CinemaPlace | null> {
  const [hit] = await search({ q: typed.trim(), limit: '1' });
  if (!hit) return null;
  const place = toPlace(hit);
  writeJson(PLACE_CACHE_KEY, { ...readJson(PLACE_CACHE_KEY, {}), [placeKey(name, address)]: place });
  return place;
}

/** Un point de tracé au format des cartes : [longitude, latitude]. */
export type MapPoint = [number, number];

/** Polyligne encodée (Google), à la précision donnée : 6 pour OSRM et Transitous. */
export const decodePolyline = (encoded: string, precision = 6): MapPoint[] => {
  const factor = 10 ** precision;
  const points: MapPoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const axis of [0, 1]) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 31) << shift;
        shift += 5;
      } while (byte >= 32 && index < encoded.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    points.push([lng / factor, lat / factor]);
  }
  return points;
};

export interface RoadRoute {
  minutes: number;
  km: number;
  path: MapPoint[];
}

/** Voiture, vélo, marche : durée, distance et tracé. Un mode injoignable reste absent. */
export async function travelRoutes(
  from: LatLng,
  to: LatLng,
  signal?: AbortSignal
): Promise<Partial<Record<Exclude<TravelMode, 'transit'>, RoadRoute>>> {
  const entries = await Promise.all(
    (Object.keys(OSRM_PROFILE) as Array<keyof typeof OSRM_PROFILE>).map(async (mode) => {
      try {
        const url = `${OSRM}/${OSRM_PROFILE[mode]}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=polyline6`;
        const response = await fetch(url, { signal });
        if (!response.ok) return null;
        const data = await response.json();
        const route = data?.routes?.[0];
        if (typeof route?.duration !== 'number') return null;
        return [
          mode,
          {
            minutes: Math.max(1, Math.round(route.duration / 60)),
            km: Math.round((route.distance ?? 0) / 100) / 10,
            path: typeof route.geometry === 'string' ? decodePolyline(route.geometry) : [],
          },
        ] as const;
      } catch {
        return null;
      }
    })
  );
  return Object.fromEntries(entries.filter((e): e is NonNullable<typeof e> => !!e));
}

export interface TransitLeg {
  /** WALK, BUS, TRAM, SUBWAY, RAIL… */
  mode: string;
  /** Numéro de ligne affiché (« G », « F »), absent pour la marche. */
  line?: string;
  color?: string;
  textColor?: string;
  headsign?: string;
  from: string;
  to: string;
  departAt: number;
  minutes: number;
  /** Retard annoncé par le réseau au départ de l'étape, en minutes (0 : à l'heure). */
  delayMin: number;
  /** Arrêts traversés sans descendre. */
  stops: number;
  /** Course du véhicule, pour le suivre en direct. */
  tripId?: string;
  path: MapPoint[];
  fromPoint?: LatLng;
  toPoint?: LatLng;
}

export interface LineAlert {
  line?: string;
  color?: string;
  header: string;
  description?: string;
}

export interface TransitTrip {
  departAt: number;
  arriveAt: number;
  minutes: number;
  /** Horaires corrigés par le temps réel du réseau. */
  realTime: boolean;
  legs: TransitLeg[];
  /** Perturbations des lignes empruntées, en cours pendant le trajet. */
  alerts: LineAlert[];
}

interface MotisLeg {
  mode: string;
  duration: number;
  startTime: string;
  endTime: string;
  realTime?: boolean;
  headsign?: string;
  displayName?: string;
  routeShortName?: string;
  routeColor?: string;
  routeTextColor?: string;
  tripId?: string;
  scheduledStartTime?: string;
  legGeometry?: { points: string; precision?: number };
  intermediateStops?: unknown[];
  from?: { name?: string; lat?: number; lon?: number };
  to?: { name?: string; lat?: number; lon?: number };
  alerts?: Array<{
    headerText?: string;
    descriptionText?: string;
    impactPeriod?: Array<{ start?: string; end?: string }>;
  }>;
}

interface MotisItinerary {
  duration: number;
  startTime: string;
  endTime: string;
  legs: MotisLeg[];
}

const plan = async (from: LatLng, to: LatLng, time: number, arriveBy: boolean, signal?: AbortSignal) => {
  const query = new URLSearchParams({
    fromPlace: `${from.lat},${from.lng}`,
    toPlace: `${to.lat},${to.lng}`,
    time: new Date(time).toISOString(),
    arriveBy: String(arriveBy),
    numItineraries: '4',
  });
  const response = await fetch(`${TRANSITOUS}?${query}`, { signal });
  if (!response.ok) throw new Error('transit-unavailable');
  const data = (await response.json()) as { itineraries?: MotisItinerary[] };
  return (data.itineraries ?? []).filter((it) => it.legs?.some((leg) => leg.mode !== 'WALK'));
};

/** Certains réseaux écrivent les directions en capitales : « ST AUBIN VILLEPREUX » → « St Aubin Villepreux ». */
const softenCaps = (value?: string) =>
  value && value === value.toUpperCase() && /[A-Z]/.test(value)
    ? value.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase())
    : value;

const toPoint = (place?: { lat?: number; lon?: number }): LatLng | undefined =>
  typeof place?.lat === 'number' && typeof place?.lon === 'number' ? { lat: place.lat, lng: place.lon } : undefined;

/**
 * Une alerte n'a sa place que si elle concerne CE trajet : en cours pendant le
 * trajet, et citant un des arrêts traversés. Les réseaux publient des alertes
 * de ligne sur des années (« travaux à l'autre bout de la ligne ») : sans ce
 * filtre, chaque trajet en afficherait trois sans rapport.
 */
const alertsOf = (legs: MotisLeg[], from: number, to: number): LineAlert[] => {
  const seen = new Set<string>();
  const alerts: LineAlert[] = [];
  for (const leg of legs) {
    if (leg.mode === 'WALK') continue;
    const stopNames = [leg.from?.name, leg.to?.name, ...(leg.intermediateStops ?? []).map((stop) => (stop as { name?: string }).name)]
      .map((name) => normalise(name ?? '').trim())
      .filter((name) => name.length >= 4);
    for (const alert of leg.alerts ?? []) {
      const header = (alert.headerText ?? '').trim();
      if (!header || seen.has(header)) continue;
      const text = normalise(`${header} ${alert.descriptionText ?? ''}`);
      if (!stopNames.some((name) => text.includes(name))) continue;
      const periods = alert.impactPeriod ?? [];
      const active =
        !periods.length ||
        periods.some((p) => (!p.start || Date.parse(p.start) <= to) && (!p.end || Date.parse(p.end) >= from));
      if (!active) continue;
      seen.add(header);
      alerts.push({
        line: leg.displayName || leg.routeShortName,
        color: leg.routeColor ? `#${leg.routeColor}` : undefined,
        header,
        description: alert.descriptionText?.trim() || undefined,
      });
    }
  }
  return alerts.slice(0, 3);
};

const toTrip = (it: MotisItinerary): TransitTrip => ({
  departAt: Date.parse(it.startTime),
  arriveAt: Date.parse(it.endTime),
  minutes: Math.max(1, Math.round(it.duration / 60)),
  realTime: it.legs.some((leg) => leg.realTime),
  legs: it.legs.map((leg) => ({
    mode: leg.mode,
    line: leg.mode === 'WALK' ? undefined : leg.displayName || leg.routeShortName,
    color: leg.routeColor ? `#${leg.routeColor}` : undefined,
    textColor: leg.routeTextColor ? `#${leg.routeTextColor}` : undefined,
    headsign: softenCaps(leg.headsign),
    from: leg.from?.name === 'START' ? '' : leg.from?.name ?? '',
    to: leg.to?.name === 'END' ? '' : leg.to?.name ?? '',
    departAt: Date.parse(leg.startTime),
    minutes: Math.max(1, Math.round(leg.duration / 60)),
    delayMin: leg.scheduledStartTime
      ? Math.max(0, Math.round((Date.parse(leg.startTime) - Date.parse(leg.scheduledStartTime)) / 60_000))
      : 0,
    stops: leg.intermediateStops?.length ?? 0,
    tripId: leg.mode === 'WALK' ? undefined : leg.tripId,
    path: leg.legGeometry?.points ? decodePolyline(leg.legGeometry.points, leg.legGeometry.precision ?? 6) : [],
    fromPoint: toPoint(leg.from),
    toPoint: toPoint(leg.to),
  })),
  alerts: alertsOf(it.legs, Date.parse(it.startTime), Date.parse(it.endTime)),
});

/**
 * Le trajet en transports qui part le plus tard tout en arrivant avant la
 * séance (marge comprise). Plus aucun ne le permet : le premier qui part
 * maintenant, et `late` le signale. Null : pas de transports utiles (trop près,
 * réseau non couvert).
 */
export async function transitTrip(
  from: LatLng,
  to: LatLng,
  startsAt: number,
  now = Date.now(),
  signal?: AbortSignal
): Promise<{ trip: TransitTrip; late: boolean } | null> {
  const target = startsAt - ARRIVAL_MARGIN_MINUTES * 60_000;
  if (target > now) {
    const onTime = (await plan(from, to, target, true, signal))
      .map(toTrip)
      .filter((trip) => trip.departAt >= now - 60_000 && trip.arriveAt <= target + 60_000)
      .sort((a, b) => b.departAt - a.departAt);
    if (onTime[0]) return { trip: onTime[0], late: false };
  }
  const next = (await plan(from, to, now, false, signal)).map(toTrip).sort((a, b) => a.arriveAt - b.arriveAt);
  return next[0] ? { trip: next[0], late: true } : null;
}

/** Les bandes-annonces et publicités avant le film, en moyenne. */
export const TRAILERS_MINUTES = 15;

/**
 * Heure de sortie de la salle. L'heure de fin donnée par UGC (« 22:55 ») passe
 * avant tout ; sinon début + bandes-annonces + durée du film. Null sans durée.
 */
export function screeningExit(startsAt: number, runtimeMinutes?: number, endTime?: string): number | null {
  const match = endTime?.match(/^(\d{1,2})[:h](\d{2})/);
  if (match) {
    const start = new Date(startsAt);
    const end = new Date(startsAt);
    end.setHours(Number(match[1]), Number(match[2]), 0, 0);
    if (end.getTime() < start.getTime()) end.setDate(end.getDate() + 1);
    return end.getTime();
  }
  if (!runtimeMinutes) return null;
  return startsAt + (TRAILERS_MINUTES + runtimeMinutes) * 60_000;
}

export interface ReturnOptions {
  /** Les prochains départs en transports après la sortie (trois au plus). */
  trips: TransitTrip[];
  /** Plus rien dans l'heure qui suit la sortie : le réseau dort. */
  noTransit: boolean;
}

/** Au-delà, on ne parle plus du même soir : les premiers bus du matin ne comptent pas. */
const RETURN_WINDOW_MINUTES = 75;

export async function returnOptions(
  cinema: LatLng,
  home: LatLng,
  exitAt: number,
  signal?: AbortSignal
): Promise<ReturnOptions> {
  const trips = (await plan(cinema, home, exitAt, false, signal))
    .map(toTrip)
    .filter((trip) => trip.departAt >= exitAt - 2 * 60_000)
    .sort((a, b) => a.departAt - b.departAt);
  const tonight = trips.filter((trip) => trip.departAt <= exitAt + RETURN_WINDOW_MINUTES * 60_000);
  return { trips: tonight.slice(0, 3), noTransit: tonight.length === 0 };
}

export interface BikeStation {
  name: string;
  available: number;
  meters: number;
}

/** La station de vélos en libre-service la plus proche (300 m au plus), avec des vélos. */
export async function bikeStationNear(point: LatLng, signal?: AbortSignal): Promise<BikeStation | null> {
  const d = 0.004;
  const query = new URLSearchParams({
    min: `${point.lat - d},${point.lng - d}`,
    max: `${point.lat + d},${point.lng + d}`,
  });
  const response = await fetch(`${TRANSITOUS_RENTALS}?${query}`, { signal });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    stations?: Array<{ name?: string; lat: number; lon: number; numVehiclesAvailable?: number; formFactors?: string[] }>;
  };
  const stations = (data.stations ?? [])
    .filter((s) => s.formFactors?.includes('BICYCLE') && (s.numVehiclesAvailable ?? 0) > 0)
    .map((s) => ({
      name: s.name ?? '',
      available: s.numVehiclesAvailable ?? 0,
      meters: Math.round(distanceKm(point, { lat: s.lat, lng: s.lon }) * 1000),
    }))
    .filter((s) => s.meters <= 300)
    .sort((a, b) => a.meters - b.meters);
  return stations[0] ?? null;
}

export interface LiveTrip {
  path: MapPoint[];
  /** Chaque arrêt de la course, avec sa position sur le tracé et ses horaires temps réel. */
  stops: Array<{ name: string; index: number; arriveAt: number; departAt: number }>;
}

interface MotisStop {
  name?: string;
  lat?: number;
  lon?: number;
  arrival?: string;
  departure?: string;
}

const nearestIndex = (path: MapPoint[], point: LatLng, from = 0) => {
  let best = from;
  let bestDistance = Infinity;
  for (let i = from; i < path.length; i++) {
    const dx = path[i][0] - point.lng;
    const dy = path[i][1] - point.lat;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
};

/** Toute la course d'un bus ou d'un tram, pour le placer sur la carte. Une requête légère. */
export async function liveTrip(tripId: string, signal?: AbortSignal): Promise<LiveTrip | null> {
  const response = await fetch(`${TRANSITOUS_TRIP}?${new URLSearchParams({ tripId })}`, { signal });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    legs?: Array<{ from?: MotisStop; to?: MotisStop; intermediateStops?: MotisStop[]; legGeometry?: { points: string; precision?: number } }>;
  };
  const leg = data.legs?.[0];
  if (!leg?.legGeometry?.points) return null;
  const path = decodePolyline(leg.legGeometry.points, leg.legGeometry.precision ?? 6);
  const raw = [leg.from, ...(leg.intermediateStops ?? []), leg.to].filter((s): s is MotisStop => !!s);
  const stops: LiveTrip['stops'] = [];
  let cursor = 0;
  for (const stop of raw) {
    if (typeof stop.lat !== 'number' || typeof stop.lon !== 'number') continue;
    cursor = nearestIndex(path, { lat: stop.lat, lng: stop.lon }, cursor);
    const arriveAt = Date.parse(stop.arrival ?? stop.departure ?? '');
    const departAt = Date.parse(stop.departure ?? stop.arrival ?? '');
    if (!Number.isFinite(arriveAt) || !Number.isFinite(departAt)) continue;
    stops.push({ name: stop.name ?? '', index: cursor, arriveAt, departAt });
  }
  return stops.length >= 2 ? { path, stops } : null;
}

/**
 * Où est le véhicule à l'instant `now` : entre deux arrêts, on avance le long du
 * tracé au prorata du temps. Null avant le départ du terminus ou après l'arrivée.
 */
export function vehicleAt(trip: LiveTrip, now = Date.now()): { point: MapPoint; nextStop: number } | null {
  const { stops, path } = trip;
  if (now < stops[0].departAt || now > stops[stops.length - 1].arriveAt) return null;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (now <= a.departAt) return { point: path[a.index], nextStop: i + 1 };
    if (now < b.arriveAt) {
      const ratio = (now - a.departAt) / Math.max(1, b.arriveAt - a.departAt);
      const span = b.index - a.index;
      const exact = a.index + ratio * span;
      const lower = Math.floor(exact);
      const upper = Math.min(path.length - 1, lower + 1);
      const t = exact - lower;
      const point: MapPoint = [
        path[lower][0] + (path[upper][0] - path[lower][0]) * t,
        path[lower][1] + (path[upper][1] - path[lower][1]) * t,
      ];
      return { point, nextStop: i + 1 };
    }
  }
  const last = stops[stops.length - 1];
  return { point: path[last.index], nextStop: stops.length - 1 };
}

/** « 45 min », « 1 h », « 1 h 05 ». */
export const formatMinutes = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} h ${String(rest).padStart(2, '0')}` : `${minutes / 60} h`;
};

export const currentPosition = () =>
  new Promise<LatLng>((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('geolocation-unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) => reject(error),
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 120_000 }
    );
  });

export interface DeparturePlan {
  /** Heure à laquelle partir pour arriver avec la marge. */
  leaveAt: number;
  /** Heure d'arrivée si l'on part maintenant (en retard) ou à l'heure prévue. */
  arriveAt: number;
  late: boolean;
}

export function departureFor(startsAt: number, minutes: number, mode: TravelMode, now = Date.now()): DeparturePlan {
  const trip = (minutes + MODE_EXTRA_MINUTES[mode]) * 60_000;
  const leaveAt = startsAt - trip - ARRIVAL_MARGIN_MINUTES * 60_000;
  if (leaveAt >= now) return { leaveAt, arriveAt: leaveAt + trip, late: false };
  return { leaveAt: now, arriveAt: now + trip, late: true };
}

const GOOGLE_MODE: Record<TravelMode, string> = { transit: 'transit', car: 'driving', bike: 'bicycling', walk: 'walking' };

/** Liens vers les applis de cartes : la destination est le nom du cinéma, qu'elles connaissent mieux que nous. */
export function mapsLinks(name: string | undefined, address: string | undefined, place: LatLng | null, mode: TravelMode) {
  const destination = [name, address].filter(Boolean).join(', ');
  const q = encodeURIComponent(destination || (place ? `${place.lat},${place.lng}` : ''));
  const apple = mode === 'transit' ? 'r' : mode === 'walk' ? 'w' : 'd';
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=${GOOGLE_MODE[mode]}`,
    apple: `https://maps.apple.com/?daddr=${q}&dirflg=${apple}`,
    waze: place
      ? `https://waze.com/ul?ll=${place.lat},${place.lng}&navigate=yes`
      : `https://waze.com/ul?q=${q}&navigate=yes`,
    citymapper: place
      ? `https://citymapper.com/directions?endcoord=${place.lat},${place.lng}&endname=${encodeURIComponent(name ?? '')}`
      : null,
  };
}
