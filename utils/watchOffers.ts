/**
 * Où regarder un film ou une série en France, d'après TMDB (données JustWatch).
 *
 * TMDB range les offres en cinq rubriques : `flatrate` (abonnement), `free`,
 * `ads` (gratuit avec pub), `rent` et `buy`. La fiche ne lisait que la première.
 * Relevé le 30 septembre 2026 : Oppenheimer et Parasite n'y ont que des offres
 * de location ou d'achat, « Le Mécano de la General » est gratuit sur Arte, et
 * aucun des trois n'affichait la moindre plateforme.
 *
 * Une même plateforme figure souvent sous plusieurs rubriques (TF1+ en
 * abonnement et gratuit avec pub, presque tous les vidéoclubs en location et à
 * l'achat). Elle n'apparaît ici qu'une fois, avec l'offre la plus avantageuse
 * pour qui regarde.
 */

export interface TmdbProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

/** Une entrée de `watch/providers` → `results`, pour un pays. */
export interface TmdbCountryOffers {
  link?: string;
  flatrate?: TmdbProvider[];
  free?: TmdbProvider[];
  ads?: TmdbProvider[];
  rent?: TmdbProvider[];
  buy?: TmdbProvider[];
}

export type StreamingAccess = 'free' | 'ads' | 'subscription';
export type TransactionAccess = 'rent' | 'buy' | 'rentOrBuy';

export interface WatchOffer<Access> {
  id: number;
  name: string;
  logoPath: string;
  access: Access;
}

export interface WatchOffers {
  /** Ce qui se regarde sans payer le film : gratuit, gratuit avec pub, abonnement. */
  streaming: WatchOffer<StreamingAccess>[];
  /** Location ou achat, hors plateformes déjà présentes dans `streaming`. */
  transactional: WatchOffer<TransactionAccess>[];
}

/** Du plus au moins avantageux pour qui regarde. */
const STREAMING_RANK: Record<StreamingAccess, number> = { free: 0, ads: 1, subscription: 2 };

/**
 * Netflix, et son offre avec pub : TMDB en fait deux plateformes distinctes,
 * mais un abonné à l'une comme à l'autre ouvre le même titre.
 */
const NETFLIX_PROVIDER_IDS = new Set([8, 1796]);

export function groupWatchOffers(country: TmdbCountryOffers | null | undefined): WatchOffers {
  const streaming = new Map<number, WatchOffer<StreamingAccess>>();
  // L'abonnement d'abord : l'ordre d'affichage reste celui que la fiche avait.
  const streamingSources: [StreamingAccess, TmdbProvider[] | undefined][] = [
    ['subscription', country?.flatrate],
    ['free', country?.free],
    ['ads', country?.ads],
  ];
  for (const [access, providers] of streamingSources) {
    for (const p of providers ?? []) {
      const known = streaming.get(p.provider_id);
      if (!known) {
        streaming.set(p.provider_id, toOffer(p, access));
      } else if (STREAMING_RANK[access] < STREAMING_RANK[known.access]) {
        known.access = access;
      }
    }
  }

  const transactional = new Map<number, WatchOffer<TransactionAccess>>();
  const transactionalSources: ['rent' | 'buy', TmdbProvider[] | undefined][] = [
    ['rent', country?.rent],
    ['buy', country?.buy],
  ];
  for (const [access, providers] of transactionalSources) {
    for (const p of providers ?? []) {
      // Déjà incluse dans un abonnement ou gratuite : proposer de la louer n'aide personne.
      if (streaming.has(p.provider_id)) continue;
      const known = transactional.get(p.provider_id);
      if (!known) {
        transactional.set(p.provider_id, toOffer(p, access));
      } else if (known.access !== access) {
        known.access = 'rentOrBuy';
      }
    }
  }

  return { streaming: [...streaming.values()], transactional: [...transactional.values()] };
}

export const isNetflixProvider = (providerId: number): boolean =>
  NETFLIX_PROVIDER_IDS.has(providerId);

export const hasNetflix = (offers: WatchOffers): boolean =>
  offers.streaming.some((offer) => isNetflixProvider(offer.id));

function toOffer<Access>(provider: TmdbProvider, access: Access): WatchOffer<Access> {
  return {
    id: provider.provider_id,
    name: provider.provider_name,
    logoPath: provider.logo_path,
    access,
  };
}
