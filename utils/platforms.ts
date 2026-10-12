/**
 * Les plateformes de streaming qu'on peut déclarer dans son profil.
 *
 * Les identifiants (`netflix`, `prime`, `disney`, `canal`) sont ceux que
 * l'inscription enregistre depuis le début dans `profiles.streaming_platforms` :
 * ils ne changent pas. Les autres s'y ajoutent.
 *
 * `providers` : les identifiants TMDB de la plateforme en France, relevés sur
 * `watch/providers/movie?watch_region=FR` le 12 octobre 2026. Une même
 * plateforme y figure parfois deux fois (Netflix et son offre avec pub).
 *
 * `color` et `mark` habillent les cartes : la couleur de la marque en fond et
 * son nom en filigrane. Pas de logo officiel, seulement le nom.
 */
export interface Platform {
  id: string;
  name: string;
  providers: number[];
  color: string;
  mark: string;
}

export const PLATFORMS: Platform[] = [
  { id: 'netflix', name: 'Netflix', providers: [8, 1796], color: '#B20710', mark: 'NETFLIX' },
  { id: 'canal', name: 'Canal+', providers: [381], color: '#151515', mark: 'CANAL+' },
  { id: 'prime', name: 'Prime Video', providers: [119, 2100], color: '#0F79AF', mark: 'prime' },
  { id: 'disney', name: 'Disney+', providers: [337], color: '#0E2A8C', mark: 'Disney+' },
  { id: 'apple', name: 'Apple TV+', providers: [350], color: '#1C1C1E', mark: 'tv+' },
  { id: 'max', name: 'HBO Max', providers: [1899], color: '#2B1C8F', mark: 'max' },
  { id: 'paramount', name: 'Paramount+', providers: [531, 2303], color: '#0057D9', mark: 'P+' },
  { id: 'mubi', name: 'MUBI', providers: [11], color: '#1B1B1B', mark: 'MUBI' },
  { id: 'crunchyroll', name: 'Crunchyroll', providers: [283], color: '#D9590F', mark: 'crunchy' },
];

const BY_ID = new Map(PLATFORMS.map((p) => [p.id, p]));
const BY_PROVIDER = new Map(PLATFORMS.flatMap((p) => p.providers.map((id) => [id, p] as const)));

export const platformById = (id: string): Platform | undefined => BY_ID.get(id);

/** La plateforme d'une offre TMDB, si elle fait partie de la liste. */
export const platformOfProvider = (providerId: number): Platform | undefined => BY_PROVIDER.get(providerId);

/** Les plateformes déclarées, dans l'ordre de la liste, sans identifiant inconnu. */
export const myPlatforms = (ids: string[] | undefined): Platform[] =>
  PLATFORMS.filter((p) => ids?.includes(p.id));

/** Les identifiants TMDB à passer à `with_watch_providers`, séparés par « | » (ou). */
export const providerQuery = (ids: string[] | undefined): string =>
  myPlatforms(ids)
    .flatMap((p) => p.providers)
    .join('|');

/** Vrai si l'offre TMDB appartient à une des plateformes déclarées. */
export const isMyProvider = (providerId: number, ids: string[] | undefined): boolean => {
  const platform = platformOfProvider(providerId);
  return !!platform && !!ids?.includes(platform.id);
};
