import React, { useEffect, useRef } from 'react';
import { Map as MapLibreMap, Marker, setWorkerUrl, type GeoJSONSource, type LngLatBoundsLike, type StyleSpecification } from 'maplibre-gl';
// MapLibre cherche son worker à côté de son propre fichier, ce que Vite ne
// recopie pas : on le fait empaqueter à part et on lui donne son adresse.
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LatLng, MapPoint } from '../services/travel';

/**
 * Carte d'un trajet vers une séance, dans les couleurs de l'app.
 *
 * Fond OpenFreeMap (gratuit, sans clé) : on charge leur style « positron » et
 * on le repeint aux couleurs crème ou charbon. Chargé à la demande depuis
 * ScreeningRouteSheet : MapLibre pèse lourd et ne sert qu'ici.
 */

export interface RouteSegment {
  path: MapPoint[];
  /** Marche en pointillés ; le reste en trait plein. */
  walk: boolean;
  color: string;
}

export interface RouteVehicle {
  point: MapPoint;
  label: string;
  color: string;
  textColor: string;
}

setWorkerUrl(mapWorkerUrl);

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

const PALETTES = {
  light: {
    ground: '#F2EFE9',
    water: '#D6E3E7',
    park: '#E3E8D8',
    building: '#E9E5DD',
    road: '#FFFFFF',
    casing: '#E4DFD6',
    rail: '#D9D4CB',
    label: '#78716c',
    ink: '#1A1A1A',
    routeCasing: '#FFFFFF',
  },
  dark: {
    ground: '#141413',
    water: '#16252B',
    park: '#1A2119',
    building: '#1C1C1B',
    road: '#262624',
    casing: '#1E1E1D',
    rail: '#2A2A28',
    label: '#a8a29e',
    ink: '#FFFFFF',
    routeCasing: '#0c0c0c',
  },
};

const styles: Partial<Record<'light' | 'dark', Promise<StyleSpecification>>> = {};

/** Le style d'OpenFreeMap, repeint une fois par thème puis gardé en mémoire. */
const loadStyle = (theme: 'light' | 'dark') => {
  styles[theme] ??= fetch(STYLE_URL)
    .then((response) => {
      if (!response.ok) throw new Error('map-style-unavailable');
      return response.json() as Promise<StyleSpecification>;
    })
    .then((style) => {
      const c = PALETTES[theme];
      const layers = style.layers.flatMap((layer) => {
        const id = layer.id;
        if (layer.type === 'raster' || id.startsWith('boundary') || id.includes('shield') || id.startsWith('label_country')) {
          return [];
        }
        const paint = { ...(layer as { paint?: Record<string, unknown> }).paint };
        if (layer.type === 'background') paint['background-color'] = c.ground;
        else if (layer.type === 'fill') {
          if (id.startsWith('water')) paint['fill-color'] = c.water;
          else if (id === 'park' || id.startsWith('landcover')) paint['fill-color'] = c.park;
          else if (id === 'building') paint['fill-color'] = c.building;
          else paint['fill-color'] = c.ground;
          delete paint['fill-outline-color'];
        } else if (layer.type === 'line') {
          if (id.startsWith('waterway')) paint['line-color'] = c.water;
          else if (id.startsWith('railway')) paint['line-color'] = c.rail;
          else paint['line-color'] = id.includes('casing') ? c.casing : c.road;
        } else if (layer.type === 'symbol') {
          paint['text-color'] = c.label;
          paint['text-halo-color'] = c.ground;
          paint['text-halo-width'] = 1.2;
        }
        return [{ ...layer, paint } as typeof layer];
      });
      return { ...style, layers };
    });
  return styles[theme]!;
};

const pointsOf = (segments: RouteSegment[], extra: LatLng[]): MapPoint[] => [
  ...segments.flatMap((s) => s.path),
  ...extra.map((p): MapPoint => [p.lng, p.lat]),
];

const boundsOf = (points: MapPoint[]): LngLatBoundsLike | null => {
  if (!points.length) return null;
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
};

const segmentsData = (segments: RouteSegment[]): FeatureCollection => ({
  type: 'FeatureCollection',
  features: segments
    .filter((s) => s.path.length > 1)
    .map((s) => ({
      type: 'Feature',
      properties: { walk: s.walk, color: s.color },
      geometry: { type: 'LineString', coordinates: s.path },
    })),
});

const stopsData = (stops: Array<LatLng & { color: string }>): FeatureCollection => ({
  type: 'FeatureCollection',
  features: stops.map((s) => ({
    type: 'Feature',
    properties: { color: s.color },
    geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
  })),
});

const originMarker = () => {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText =
    'width:14px;height:14px;border-radius:999px;background:#1A1A1A;border:2.5px solid #fff;box-shadow:0 0 0 9px rgba(217,255,0,.45)';
  return el;
};

const cinemaMarker = (dark: boolean) => {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  const body = dark ? '#D9FF00' : '#1A1A1A';
  const ticket = dark ? '#111111' : '#D9FF00';
  el.innerHTML = `<svg width="34" height="40" viewBox="0 0 34 40"><path d="M6 0h22a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6h-6l-5 8-5-8H6a6 6 0 0 1-6-6V6a6 6 0 0 1 6-6z" fill="${body}"/><path d="M9 9h16v4a2 2 0 0 0 0 4v4H9v-4a2 2 0 0 0 0-4z" fill="${ticket}"/></svg>`;
  return el;
};

const vehicleMarker = () => {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText =
    'min-width:26px;height:22px;padding:0 6px;border-radius:7px;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font:900 11px Inter,system-ui,sans-serif;box-shadow:0 0 0 8px rgba(0,0,0,.08)';
  return el;
};

export default function RouteMap({
  origin,
  destination,
  segments,
  stops = [],
  vehicle,
  dark,
  interactive = false,
  padding = { top: 96, bottom: 64, left: 40, right: 40 },
  onError,
}: {
  origin: LatLng;
  destination: LatLng;
  segments: RouteSegment[];
  stops?: Array<LatLng & { color: string }>;
  vehicle?: RouteVehicle | null;
  dark: boolean;
  interactive?: boolean;
  padding?: { top: number; bottom: number; left: number; right: number };
  onError?: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const ready = useRef(false);
  const vehicleRef = useRef<{ marker: Marker; el: HTMLDivElement } | null>(null);
  const latest = useRef({ segments, stops, origin, destination, padding, vehicle });
  latest.current = { segments, stops, origin, destination, padding, vehicle };

  const fit = (animate: boolean) => {
    const { segments: s, origin: o, destination: d, padding: p, vehicle: v } = latest.current;
    // Le véhicule suivi entre dans le cadre : on veut le voir arriver.
    const bounds = boundsOf([...pointsOf(s, [o, d]), ...(v ? [v.point] : [])]);
    if (bounds && map.current) map.current.fitBounds(bounds, { padding: p, maxZoom: 16, duration: animate ? 500 : 0 });
  };

  // Création de la carte, une fois par thème.
  useEffect(() => {
    if (!container.current) return;
    let cancelled = false;
    const markers: Marker[] = [];
    loadStyle(dark ? 'dark' : 'light')
      .then((style) => {
        if (cancelled || !container.current) return;
        const instance = new MapLibreMap({
          container: container.current,
          style,
          interactive,
          attributionControl: false,
          center: [origin.lng, origin.lat],
          zoom: 13,
        });
        map.current = instance;
        instance.on('error', (event) => {
          // Une tuile manquante n'empêche pas la carte : seul le style compte.
          if (!ready.current) console.warn('[Carte]', event.error);
        });
        instance.on('load', () => {
          const c = PALETTES[dark ? 'dark' : 'light'];
          const { segments: s, stops: st } = latest.current;
          instance.addSource('route', { type: 'geojson', data: segmentsData(s) });
          instance.addSource('stops', { type: 'geojson', data: stopsData(st) });
          instance.addLayer({
            id: 'route-casing',
            type: 'line',
            source: 'route',
            filter: ['!', ['get', 'walk']],
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': c.routeCasing, 'line-width': 10 },
          });
          instance.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            filter: ['!', ['get', 'walk']],
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': ['get', 'color'], 'line-width': 5.5 },
          });
          instance.addLayer({
            id: 'route-walk',
            type: 'line',
            source: 'route',
            filter: ['get', 'walk'],
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': c.ink, 'line-width': 3.5, 'line-dasharray': [0.1, 2.2] },
          });
          instance.addLayer({
            id: 'stops',
            type: 'circle',
            source: 'stops',
            paint: {
              'circle-radius': 5,
              'circle-color': '#FFFFFF',
              'circle-stroke-color': ['get', 'color'],
              'circle-stroke-width': 3,
            },
          });
          markers.push(new Marker({ element: originMarker() }).setLngLat([origin.lng, origin.lat]).addTo(instance));
          markers.push(
            new Marker({ element: cinemaMarker(dark), anchor: 'bottom' })
              .setLngLat([destination.lng, destination.lat])
              .addTo(instance)
          );
          ready.current = true;
          fit(false);
        });
      })
      .catch(() => onError?.());
    return () => {
      cancelled = true;
      ready.current = false;
      markers.forEach((m) => m.remove());
      vehicleRef.current?.marker.remove();
      vehicleRef.current = null;
      map.current?.remove();
      map.current = null;
    };
    // La carte est recréée au changement de thème ou de mode d'interaction ; le reste se met à jour en place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark, interactive]);

  // Nouveau mode de transport : nouveau tracé, et on recadre.
  useEffect(() => {
    if (!ready.current || !map.current) return;
    (map.current.getSource('route') as GeoJSONSource | undefined)?.setData(segmentsData(segments));
    (map.current.getSource('stops') as GeoJSONSource | undefined)?.setData(stopsData(stops));
    fit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, stops]);

  // Le véhicule suivi en direct.
  useEffect(() => {
    if (!map.current) return;
    if (!vehicle) {
      vehicleRef.current?.marker.remove();
      vehicleRef.current = null;
      return;
    }
    if (!vehicleRef.current) {
      const el = vehicleMarker();
      vehicleRef.current = { el, marker: new Marker({ element: el }).setLngLat(vehicle.point).addTo(map.current) };
      if (ready.current) fit(true);
    }
    const { el, marker } = vehicleRef.current;
    el.textContent = vehicle.label;
    el.style.background = vehicle.color;
    el.style.color = vehicle.textColor;
    marker.setLngLat(vehicle.point);
  }, [vehicle]);

  return <div ref={container} className="h-full w-full" />;
}
