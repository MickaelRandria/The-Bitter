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
    ground: '#F3F0EA',
    water: '#CFDFE4',
    waterLabel: '#7FA0AA',
    park: '#E6EADC',
    building: '#ECE8E1',
    minor: '#FFFFFF',
    major: '#FFFFFF',
    motorway: '#FBF7EF',
    rail: '#E6E1D8',
    label: '#8A837B',
    ink: '#1A1A1A',
    routeCasing: '#FFFFFF',
    glow: 0.18,
  },
  dark: {
    ground: '#121211',
    water: '#0F1E24',
    waterLabel: '#3E5C66',
    park: '#151A14',
    building: '#1A1A19',
    minor: '#1F1F1E',
    major: '#2B2B29',
    motorway: '#323230',
    rail: '#1B1B1A',
    label: '#6B6661',
    ink: '#FFFFFF',
    routeCasing: '#121211',
    glow: 0.4,
  },
};

/** Ce qui fait « carte routière » sans rien apprendre sur un trajet en ville. */
const DROPPED = /^(boundary|aeroway|airport|road_area_pier|road_pier|highway_path|label_state|label_country|label_city)|shield|casing|subtle|tunnel/;

const lineWidth = (stops: Array<[number, number]>) => ['interpolate', ['exponential', 1.5], ['zoom'], ...stops.flat()];

const styles: Partial<Record<'light' | 'dark', Promise<StyleSpecification>>> = {};

/**
 * Le style d'OpenFreeMap, épuré puis repeint une fois par thème : à plat, sans
 * contours ni sentiers, des routes hiérarchisées par l'épaisseur, et des noms
 * de lieux discrets en petites capitales, pour que le trajet reste le sujet.
 */
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
        if (layer.type === 'raster' || DROPPED.test(id)) return [];
        const paint: Record<string, unknown> = { ...(layer as { paint?: Record<string, unknown> }).paint };
        const layout: Record<string, unknown> = { ...(layer as { layout?: Record<string, unknown> }).layout };
        if (layer.type === 'background') paint['background-color'] = c.ground;
        else if (layer.type === 'fill') {
          delete paint['fill-outline-color'];
          if (id.startsWith('water')) paint['fill-color'] = c.water;
          else if (id === 'park' || id.startsWith('landcover')) paint['fill-color'] = c.park;
          else if (id === 'building') {
            paint['fill-color'] = c.building;
            paint['fill-opacity'] = ['interpolate', ['linear'], ['zoom'], 13, 0, 15, 1];
          } else paint['fill-color'] = c.ground;
        } else if (layer.type === 'line') {
          delete paint['line-dasharray'];
          paint['line-opacity'] = 1;
          if (id.startsWith('waterway')) paint['line-color'] = c.water;
          else if (id.startsWith('railway')) {
            if (id.includes('dashline')) return [];
            paint['line-color'] = c.rail;
            paint['line-width'] = lineWidth([[12, 0.5], [18, 3]]);
          } else if (id.includes('motorway')) {
            paint['line-color'] = c.motorway;
            paint['line-width'] = lineWidth([[8, 1], [12, 3], [18, 18]]);
          } else if (id.includes('major')) {
            paint['line-color'] = c.major;
            paint['line-width'] = lineWidth([[11, 1], [14, 3.5], [18, 16]]);
          } else {
            paint['line-color'] = c.minor;
            paint['line-width'] = lineWidth([[12, 0.6], [15, 2], [18, 9]]);
          }
        } else if (layer.type === 'symbol') {
          // Les noms en français d'abord : le style prend l'anglais (« Garonne River »).
          layout['text-field'] = ['coalesce', ['get', 'name:fr'], ['get', 'name'], ['get', 'name_en']];
          // Noms de rues : seulement de près, petits.
          if (id.startsWith('highway-name')) {
            if (id !== 'highway-name-major') return [];
            layout['text-size'] = 10;
            paint['text-color'] = c.label;
            paint['text-halo-color'] = c.ground;
            paint['text-halo-width'] = 1.5;
            return [{ ...layer, minzoom: 14.5, layout, paint } as typeof layer];
          }
          if (id.startsWith('water') || id.startsWith('waterway')) {
            paint['text-color'] = c.waterLabel;
            paint['text-halo-color'] = c.water;
            paint['text-halo-width'] = 1;
            layout['text-size'] = 11;
            layout['text-letter-spacing'] = 0.15;
          } else {
            // Villes, communes et quartiers : petites capitales espacées, sans le point noir.
            delete layout['icon-image'];
            delete layout['icon-size'];
            delete layout['icon-allow-overlap'];
            delete layout['icon-optional'];
            layout['text-font'] = ['Noto Sans Bold'];
            layout['text-transform'] = 'uppercase';
            layout['text-letter-spacing'] = 0.14;
            layout['text-size'] = id === 'label_city' || id === 'label_city_capital' ? 11 : id === 'label_other' ? 9 : 10;
            layout['text-anchor'] = 'center';
            layout['text-max-width'] = 8;
            paint['text-color'] = c.label;
            paint['text-halo-color'] = c.ground;
            paint['text-halo-width'] = 1.5;
            paint['text-halo-blur'] = 0;
          }
        }
        return [{ ...layer, paint, layout } as typeof layer];
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

const PULSE_STYLE_ID = 'bitter-route-pulse';
const originMarker = (dark: boolean) => {
  if (!document.getElementById(PULSE_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = PULSE_STYLE_ID;
    style.textContent =
      '@keyframes bitter-route-pulse{0%{transform:scale(.6);opacity:.7}100%{transform:scale(2.4);opacity:0}}' +
      '@media (prefers-reduced-motion:reduce){.bitter-route-pulse{animation:none!important;opacity:.35!important}}';
    document.head.appendChild(style);
  }
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:relative;width:18px;height:18px';
  const ring = dark ? '#121211' : '#FFFFFF';
  el.innerHTML =
    '<span class="bitter-route-pulse" style="position:absolute;inset:0;border-radius:999px;background:#D9FF00;animation:bitter-route-pulse 2s ease-out infinite"></span>' +
    `<span style="position:absolute;inset:0;border-radius:999px;background:#D9FF00;border:4px solid ${ring};box-shadow:0 2px 8px rgba(0,0,0,.25)"></span>`;
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
    if (bounds && map.current) map.current.fitBounds(bounds, { padding: p, maxZoom: 15.5, duration: animate ? 500 : 0 });
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
            id: 'route-glow',
            type: 'line',
            source: 'route',
            filter: ['!', ['get', 'walk']],
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': ['get', 'color'], 'line-width': 16, 'line-blur': 8, 'line-opacity': c.glow },
          });
          instance.addLayer({
            id: 'route-casing',
            type: 'line',
            source: 'route',
            filter: ['!', ['get', 'walk']],
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': c.routeCasing, 'line-width': 9 },
          });
          instance.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            filter: ['!', ['get', 'walk']],
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': ['get', 'color'], 'line-width': 5 },
          });
          instance.addLayer({
            id: 'route-walk',
            type: 'line',
            source: 'route',
            filter: ['get', 'walk'],
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': c.ink, 'line-width': 4.5, 'line-dasharray': [0, 1.8] },
          });
          instance.addLayer({
            id: 'stops',
            type: 'circle',
            source: 'stops',
            paint: {
              'circle-radius': 4.5,
              'circle-color': c.routeCasing,
              'circle-stroke-color': ['get', 'color'],
              'circle-stroke-width': 3,
            },
          });
          markers.push(new Marker({ element: originMarker(dark) }).setLngLat([origin.lng, origin.lat]).addTo(instance));
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
