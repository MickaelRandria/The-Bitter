/**
 * Trajet jusqu'à une séance : où est le cinéma, combien de temps pour y aller,
 * et quand partir.
 *
 * Tout se passe sur le téléphone. La position de l'utilisateur n'est jamais
 * envoyée à notre base : elle ne sert qu'à interroger le calcul d'itinéraire
 * public d'OpenStreetMap (FOSSGIS), le temps d'afficher l'écran.
 *
 * Les transports en commun n'ont pas de service public gratuit : pour eux,
 * l'écran renvoie vers l'appli de cartes, qui connaît les horaires.
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

/** Durées en minutes, mode par mode. Un mode injoignable reste absent. */
export async function travelMinutes(
  from: LatLng,
  to: LatLng,
  signal?: AbortSignal
): Promise<Partial<Record<TravelMode, number>>> {
  const entries = await Promise.all(
    (Object.keys(OSRM_PROFILE) as Array<keyof typeof OSRM_PROFILE>).map(async (mode) => {
      try {
        const url = `${OSRM}/${OSRM_PROFILE[mode]}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
        const response = await fetch(url, { signal });
        if (!response.ok) return null;
        const data = await response.json();
        const seconds = data?.routes?.[0]?.duration;
        return typeof seconds === 'number' ? ([mode, Math.max(1, Math.round(seconds / 60))] as const) : null;
      } catch {
        return null;
      }
    })
  );
  return Object.fromEntries(entries.filter((e): e is NonNullable<typeof e> => !!e));
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
