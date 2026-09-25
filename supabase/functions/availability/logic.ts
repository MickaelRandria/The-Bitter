/**
 * Ce qui fait une nouvelle, film par film : module pur, sans réseau ni import,
 * testé tel quel par `tests/availability.test.mjs`.
 */

interface TmdbReleaseDate {
  type: number;
  release_date: string;
}

export interface TmdbMovie {
  release_dates?: { results?: { iso_3166_1: string; release_dates?: TmdbReleaseDate[] }[] };
  'watch/providers'?: { results?: Record<string, { flatrate?: { provider_name: string }[] } | undefined> };
}

/**
 * Date de sortie EN SALLE en France : type 3 (sortie nationale), à défaut
 * type 2 (sortie limitée). Pas la date « principale » de TMDB, souvent
 * américaine et décalée de plusieurs jours, parfois de plusieurs semaines.
 */
export const frenchTheatricalDate = (movie: TmdbMovie): string | null => {
  const fr = movie.release_dates?.results?.find((r) => r.iso_3166_1 === 'FR')?.release_dates ?? [];
  const pick = (type: number) =>
    fr
      .filter((d) => d.type === type && /^\d{4}-\d{2}-\d{2}/.test(d.release_date))
      .map((d) => d.release_date.slice(0, 10))
      .sort()[0] ?? null;
  return pick(3) ?? pick(2);
};

/** Plateformes d'abonnement en France (pas la location ni l'achat), triées. */
export const frenchStreaming = (movie: TmdbMovie): string[] => {
  const flatrate = movie['watch/providers']?.results?.FR?.flatrate ?? [];
  return [...new Set(flatrate.map((p) => p.provider_name).filter(Boolean))].sort();
};

/** Aujourd'hui à Paris, « aaaa-mm-jj » : le serveur tourne en UTC. */
export const parisToday = (now = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export interface Previous {
  /** Faux au premier passage : l'état de départ ne fait pas une nouvelle. */
  known: boolean;
  providers: string[];
}

export interface Decision {
  release: boolean;
  newProviders: string[];
}

/**
 * Sort aujourd'hui : on prévient, même au premier passage. Arrive sur une
 * plateforme : seulement par rapport à la veille, sinon le premier matin
 * annoncerait comme nouveaux des films disponibles depuis des mois.
 */
export const decide = (previous: Previous, releaseDate: string | null, providers: string[], today: string): Decision => ({
  release: releaseDate === today,
  newProviders: previous.known ? providers.filter((p) => !previous.providers.includes(p)) : [],
});
