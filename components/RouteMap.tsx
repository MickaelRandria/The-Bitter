import React, { useEffect, useRef } from 'react';
import {
  Map as MapLibreMap,
  Marker,
  setWorkerUrl,
  type GeoJSONSource,
  type LayerSpecification,
  type LngLatBoundsLike,
  type StyleSpecification,
} from 'maplibre-gl';
// MapLibre cherche son worker à côté de son propre fichier, ce que Vite ne
// recopie pas : on le fait empaqueter à part et on lui donne son adresse.
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LatLng, MapPoint } from '../services/travel';

/**
 * Carte d'un trajet vers une séance.
 *
 * Fond OpenFreeMap (gratuit, sans clé), dans ses styles complets : « liberty »
 * le jour, avec immeubles en relief et lieux, « dark » la nuit, complété du
 * même relief. Repeindre un style minimaliste donnait une carte « dessinée » ;
 * une vraie carte se reconnaît à ses détails. Chargé à la demande depuis
 * ScreeningRouteSheet : MapLibre pèse lourd et ne sert qu'ici.
 */

export interface RouteSegment {
  path: MapPoint[];
  /** Marche en pointillés ; le reste en trait plein. */
  walk: boolean;
  color: string;
  /** Le reste de la ligne, avant la montée ou après la descente : en retrait. */
  faded?: boolean;
}

export interface RouteVehicle {
  point: MapPoint;
  label: string;
  color: string;
  textColor: string;
}

/** Un nom posé sur la carte : arrêt de montée, de descente, terminus d'une ligne. */
export interface RouteLabel {
  point: MapPoint;
  text: string;
  /** Pastille de ligne devant le texte (terminus), sinon simple étiquette d'arrêt. */
  line?: { label: string; color: string; textColor: string };
}

setWorkerUrl(mapWorkerUrl);

const STYLE_URLS = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

const PALETTES = {
  light: { ink: '#1A1A1A', casing: '#FFFFFF', glow: 0.2, building: '#E4DED4', labelBg: '#FFFFFF', labelInk: '#1A1A1A' },
  dark: { ink: '#FFFFFF', casing: '#111111', glow: 0.45, building: '#232322', labelBg: '#1A1A19', labelInk: '#FFFFFF' },
};

/** Les noms en français d'abord : les styles prennent souvent l'anglais (« Garonne River »). */
const FRENCH_NAME = ['coalesce', ['get', 'name:fr'], ['get', 'name'], ['get', 'name_en']];

const styles: Partial<Record<'light' | 'dark', Promise<StyleSpecification>>> = {};

const loadStyle = (theme: 'light' | 'dark') => {
  styles[theme] ??= fetch(STYLE_URLS[theme])
    .then((response) => {
      if (!response.ok) throw new Error('map-style-unavailable');
      return response.json() as Promise<StyleSpecification>;
    })
    .then((style) => {
      const c = PALETTES[theme];
      const layers: LayerSpecification[] = style.layers.flatMap((layer) => {
        // Les frontières administratives n'ont rien à faire sur un trajet en ville.
        if (layer.id.startsWith('boundary')) return [];
        if (layer.type !== 'symbol') return [layer];
        const layout = { ...(layer.layout as Record<string, unknown> | undefined) };
        // Ne remplacer que les noms, jamais les numéros de route des panneaux.
        const field = JSON.stringify(layout['text-field'] ?? '');
        if (field.includes('name')) layout['text-field'] = FRENCH_NAME;
        const next = { ...layer, layout } as LayerSpecification;
        // Les lieux (cafés, boutiques…) seulement de près, pour ne pas noyer le trajet.
        if (layer.id.startsWith('poi')) return [{ ...next, minzoom: Math.max(layer.minzoom ?? 0, 16) } as LayerSpecification];
        return [next];
      });
      // Le style sombre n'a pas d'immeubles en relief : on lui donne ceux de liberty.
      if (!layers.some((l) => l.type === 'fill-extrusion')) {
        const firstSymbol = layers.findIndex((l) => l.type === 'symbol');
        layers.splice(firstSymbol < 0 ? layers.length : firstSymbol, 0, {
          id: 'building-3d',
          type: 'fill-extrusion',
          source: 'openmaptiles',
          'source-layer': 'building',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': c.building,
            'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, ['coalesce', ['get', 'render_height'], 0]],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.85,
          },
        } as LayerSpecification);
      }
      return { ...style, layers };
    });
  return styles[theme]!;
};

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
      properties: { walk: s.walk, color: s.color, faded: !!s.faded },
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
      '@keyframes bitter-route-pulse{0%{transform:scale(.7);opacity:.55}100%{transform:scale(2.6);opacity:0}}' +
      '@media (prefers-reduced-motion:reduce){.bitter-route-pulse{animation:none!important;opacity:.25!important}}';
    document.head.appendChild(style);
  }
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:relative;width:20px;height:20px';
  const ring = dark ? '#111111' : '#FFFFFF';
  el.innerHTML =
    '<span class="bitter-route-pulse" style="position:absolute;inset:0;border-radius:999px;background:#D9FF00;animation:bitter-route-pulse 2.2s ease-out infinite"></span>' +
    `<span style="position:absolute;inset:2px;border-radius:999px;background:#D9FF00;border:3.5px solid ${ring};box-shadow:0 1px 6px rgba(0,0,0,.35)"></span>`;
  return el;
};

/** Le cinéma : l'affiche du film dans une épingle, comme une vignette de lieu. */
const cinemaMarker = (dark: boolean, posterUrl?: string) => {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  const frame = dark ? '#D9FF00' : '#1A1A1A';
  el.style.cssText = 'display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 4px 10px rgba(0,0,0,.35))';
  const card = document.createElement('div');
  card.style.cssText = `width:34px;height:48px;border-radius:8px;border:3px solid ${frame};background:${frame};overflow:hidden`;
  if (posterUrl) {
    const img = document.createElement('img');
    img.src = posterUrl;
    img.alt = '';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
    card.appendChild(img);
  } else {
    card.innerHTML = `<svg width="28" height="42" viewBox="0 0 28 42"><path d="M6 16h16v4a2 2 0 0 0 0 4v4H6v-4a2 2 0 0 0 0-4z" fill="${dark ? '#111' : '#D9FF00'}"/></svg>`;
  }
  const tip = document.createElement('div');
  tip.style.cssText = `width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid ${frame};margin-top:-1px`;
  el.append(card, tip);
  return el;
};

const vehicleMarker = () => {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText =
    'min-width:26px;height:22px;padding:0 6px;border-radius:7px;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font:900 11px Inter,system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.35)';
  return el;
};

const labelMarker = (label: RouteLabel, dark: boolean) => {
  const c = PALETTES[dark ? 'dark' : 'light'];
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = `display:flex;align-items:center;gap:5px;max-width:150px;padding:3px 8px 3px ${label.line ? '3px' : '8px'};border-radius:999px;background:${c.labelBg};color:${c.labelInk};font:700 10.5px Inter,system-ui,sans-serif;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.2);pointer-events:none`;
  if (label.line) {
    const badge = document.createElement('span');
    badge.textContent = label.line.label;
    badge.style.cssText = `padding:1px 6px;border-radius:999px;background:${label.line.color};color:${label.line.textColor};font-weight:900`;
    el.appendChild(badge);
  }
  const text = document.createElement('span');
  text.textContent = label.text;
  text.style.cssText = 'overflow:hidden;text-overflow:ellipsis';
  el.appendChild(text);
  return el;
};

export default function RouteMap({
  origin,
  destination,
  segments,
  stops = [],
  labels = [],
  vehicle,
  posterUrl,
  dark,
  interactive = false,
  padding = { top: 96, bottom: 64, left: 40, right: 40 },
  onError,
}: {
  origin: LatLng;
  destination: LatLng;
  segments: RouteSegment[];
  stops?: Array<LatLng & { color: string }>;
  labels?: RouteLabel[];
  vehicle?: RouteVehicle | null;
  posterUrl?: string;
  dark: boolean;
  interactive?: boolean;
  padding?: { top: number; bottom: number; left: number; right: number };
  onError?: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const ready = useRef(false);
  const vehicleRef = useRef<{ marker: Marker; el: HTMLDivElement } | null>(null);
  const labelMarkers = useRef<Marker[]>([]);
  const latest = useRef({ segments, stops, labels, origin, destination, padding, vehicle });
  latest.current = { segments, stops, labels, origin, destination, padding, vehicle };

  const fit = (animate: boolean) => {
    const { segments: s, origin: o, destination: d, padding: p, vehicle: v } = latest.current;
    // En aperçu, on cadre le trajet emprunté ; en plein écran, les lignes entières,
    // pour voir d'où vient le bus et où il va. Le véhicule suivi en fait partie.
    const points: MapPoint[] = [
      ...s.filter((seg) => interactive || !seg.faded).flatMap((seg) => seg.path),
      [o.lng, o.lat],
      [d.lng, d.lat],
      ...(v ? [v.point] : []),
    ];
    const bounds = boundsOf(points);
    if (bounds && map.current) map.current.fitBounds(bounds, { padding: p, maxZoom: 15.5, duration: animate ? 500 : 0 });
  };

  const drawLabels = () => {
    labelMarkers.current.forEach((m) => m.remove());
    labelMarkers.current = [];
    if (!map.current) return;
    for (const label of latest.current.labels) {
      labelMarkers.current.push(
        new Marker({ element: labelMarker(label, dark), anchor: 'left', offset: [9, 0] }).setLngLat(label.point).addTo(map.current)
      );
    }
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
          // Plein écran : légère inclinaison, pour que les immeubles prennent du relief en zoomant.
          pitch: interactive ? 35 : 0,
          maxPitch: 60,
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
          const solid = ['all', ['!', ['get', 'walk']], ['!', ['get', 'faded']]] as const;
          // Le reste de la ligne, avant la montée et après la descente : présent, mais en retrait.
          instance.addLayer({
            id: 'route-faded',
            type: 'line',
            source: 'route',
            filter: ['get', 'faded'],
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': ['get', 'color'], 'line-width': 4.5, 'line-opacity': dark ? 0.6 : 0.4 },
          });
          instance.addLayer({
            id: 'route-glow',
            type: 'line',
            source: 'route',
            filter: solid as never,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': ['get', 'color'], 'line-width': 14, 'line-blur': 6, 'line-opacity': c.glow },
          });
          instance.addLayer({
            id: 'route-casing',
            type: 'line',
            source: 'route',
            filter: solid as never,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': c.casing, 'line-width': 9 },
          });
          instance.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            filter: solid as never,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': ['get', 'color'], 'line-width': 5.5 },
          });
          instance.addLayer({
            id: 'route-walk',
            type: 'line',
            source: 'route',
            filter: ['all', ['get', 'walk'], ['!', ['get', 'faded']]],
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': c.ink, 'line-width': 4.5, 'line-dasharray': [0, 1.8] },
          });
          instance.addLayer({
            id: 'stops',
            type: 'circle',
            source: 'stops',
            paint: {
              'circle-radius': 5,
              'circle-color': c.casing,
              'circle-stroke-color': ['get', 'color'],
              'circle-stroke-width': 3,
            },
          });
          markers.push(new Marker({ element: originMarker(dark) }).setLngLat([origin.lng, origin.lat]).addTo(instance));
          markers.push(
            new Marker({ element: cinemaMarker(dark, posterUrl), anchor: 'bottom' })
              .setLngLat([destination.lng, destination.lat])
              .addTo(instance)
          );
          ready.current = true;
          drawLabels();
          fit(false);
        });
      })
      .catch(() => onError?.());
    return () => {
      cancelled = true;
      ready.current = false;
      markers.forEach((m) => m.remove());
      labelMarkers.current.forEach((m) => m.remove());
      labelMarkers.current = [];
      vehicleRef.current?.marker.remove();
      vehicleRef.current = null;
      map.current?.remove();
      map.current = null;
    };
    // La carte est recréée au changement de thème ou de mode d'interaction ; le reste se met à jour en place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark, interactive]);

  // Nouveau mode de transport ou ligne complète arrivée : nouveau tracé, et on recadre.
  useEffect(() => {
    if (!ready.current || !map.current) return;
    (map.current.getSource('route') as GeoJSONSource | undefined)?.setData(segmentsData(segments));
    (map.current.getSource('stops') as GeoJSONSource | undefined)?.setData(stopsData(stops));
    drawLabels();
    fit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, stops, labels]);

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
