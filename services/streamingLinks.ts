/**
 * Le lien qui ouvre un titre directement dans Netflix.
 *
 * TMDB dit sur quelles plateformes un titre est disponible, jamais à quelle
 * adresse : son champ `link` renvoie vers sa propre page « où regarder ».
 * Wikidata relie l'identifiant TMDB d'une œuvre à son identifiant Netflix
 * (propriété P1874). `netflix.com/title/{id}` est une adresse que l'app Netflix
 * revendique sur Android (App Links vérifiés) comme sur iOS (liens universels) :
 * elle s'ouvre sur le titre quand elle est installée, le site sinon.
 *
 * Wikidata ne dit pas si le titre est au catalogue français. C'est TMDB qui en
 * décide : on ne cherche le lien que pour un titre qu'il voit sur Netflix en
 * France.
 *
 * Couverture mesurée le 24 septembre 2026 sur les 60 titres les plus populaires
 * en France : 77 % des films, 87 % des séries. Pour les autres, pas de bouton.
 */

const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
/** Identifiant TMDB d'un film (P4947) ou d'une série (P4983). */
const TMDB_PROPERTY = { movie: 'P4947', tv: 'P4983' } as const;
const NETFLIX_ID_PROPERTY = 'P1874';

/** Une promesse par titre : rouvrir la même fiche ne relance pas la requête. */
const lookups = new Map<string, Promise<string | null>>();

export function getNetflixUrl(mediaType: 'movie' | 'tv', tmdbId: number): Promise<string | null> {
  const key = `${mediaType}:${tmdbId}`;
  let lookup = lookups.get(key);
  if (!lookup) {
    lookup = fetchNetflixId(mediaType, tmdbId).then(
      (id) => (id ? `https://www.netflix.com/title/${id}` : null),
      () => {
        // Wikidata injoignable : la fiche reste sans bouton, et on retentera à la prochaine ouverture.
        lookups.delete(key);
        return null;
      }
    );
    lookups.set(key, lookup);
  }
  return lookup;
}

async function fetchNetflixId(mediaType: 'movie' | 'tv', tmdbId: number): Promise<string | null> {
  if (!Number.isInteger(tmdbId)) return null;
  const query = `SELECT ?id WHERE { ?item wdt:${TMDB_PROPERTY[mediaType]} "${tmdbId}"; wdt:${NETFLIX_ID_PROPERTY} ?id. } LIMIT 1`;
  const response = await fetch(
    `${WIKIDATA_SPARQL}?format=json&query=${encodeURIComponent(query)}`,
    {
      // Un navigateur ne peut pas choisir son User-Agent : Wikimedia demande celui-ci à la place.
      headers: { 'Api-User-Agent': 'TheBitter/1.0 (https://thebitter.watch)' },
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!response.ok) throw new Error(`Wikidata ${response.status}`);
  const data = await response.json();
  const id = data?.results?.bindings?.[0]?.id?.value;
  return typeof id === 'string' && /^\d+$/.test(id) ? id : null;
}
