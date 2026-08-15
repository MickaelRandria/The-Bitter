import { UserProfile, Movie } from '../types';
import { TMDB_API_KEY, TMDB_BASE_URL, TMDB_GENRE_MAP } from '../constants';
import { supabase } from './supabase';
import { currentCriterionLabel } from '../config/ratingProfiles';

export interface AISearchResult {
  text: string;
  sources: { title: string; uri: string }[];
}

/**
 * ✅ Nettoyage SIMPLE : garde tout sauf les astérisques
 */
const cleanAIResponse = (text: string): string => {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>') // ** → <b>
    .replace(/\*([^*]+)\*/g, '$1') // * → supprime
    .trim();
};

/**
 * Appelle le relais qui détient la clé Mistral.
 *
 * L'application ne parle jamais à Mistral directement : la clé serait alors dans
 * le fichier JavaScript téléchargé par le navigateur, donc lisible par tout le
 * monde, et facturée à celui qui la possède. Elle vit dans les secrets de la
 * Edge Function, qui exige en retour une vraie session — d'où le message clair
 * quand personne n'est connecté, plutôt qu'un échec muet.
 */
const callAI = async <T>(payload: Record<string, unknown>): Promise<T> => {
  if (!supabase) throw new Error("L'assistant n'est pas disponible hors connexion.");

  const { data, error } = await supabase.functions.invoke('ai', { body: payload });

  if (error) {
    // `invoke` ne remonte pas le corps des réponses d'erreur, seulement le
    // statut. Le lire nous-mêmes est ce qui permet de distinguer « connecte-toi »
    // de « quota atteint » de « le service est tombé », trois situations qui
    // n'appellent pas du tout la même réaction.
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === 'function') {
      const detail = await response.json().catch(() => null);
      if (detail?.message) throw new Error(detail.message);
    }
    if (import.meta.env.DEV) console.error('[IA] Appel du relais échoué :', error);
    throw new Error("L'assistant est momentanément injoignable.");
  }

  if (!data) throw new Error("L'assistant n'a rien répondu.");
  return data as T;
};

const askAI = async (payload: Record<string, unknown>): Promise<string> => {
  const { text } = await callAI<{ text?: string }>(payload);
  if (!text) throw new Error("L'assistant n'a rien répondu.");
  return text;
};

/** Une note posée sur un critère, telle que l'écran de notation la produit. */
export interface ReviewCriterion {
  label: string;
  value: number;
}

/**
 * Décrit la note pour le modèle.
 *
 * Les critères sont triés du plus haut au plus bas parce que c'est ce qui rend
 * la note lisible d'un coup : le modèle doit repérer sur quoi la personne a
 * quelque chose à dire, et l'écart entre le premier et le dernier critère est
 * précisément ce qui le lui dit.
 */
const describeRating = (
  title: string,
  year: number | undefined,
  criteria: ReviewCriterion[],
  rating?: number
): string => {
  const sorted = [...criteria].filter((c) => Number.isFinite(c.value)).sort((a, b) => b.value - a.value);
  const lines = sorted.map((c) => `- ${c.label} : ${c.value}/10`).join('\n');
  return `FILM : ${title}${year ? ` (${year})` : ''}
NOTE GLOBALE : ${rating != null ? `${rating.toFixed(1)}/10` : 'non calculée'}
SES NOTES PAR CRITÈRE, de la plus haute à la plus basse :
${lines}`;
};

/**
 * Trois amorces de phrase, à partir de la note qui vient d'être posée.
 *
 * Elles existent contre la page blanche : sur 90 films notés dans l'application,
 * un seul avait un avis écrit. Le champ vide n'était pas un manque d'envie mais
 * un manque de première phrase.
 *
 * Aucune amorce ne porte de jugement — c'est la contrainte tenue côté serveur.
 * Elles disent de quoi parler, jamais quoi en penser.
 */
export const getReviewStarters = async (
  title: string,
  criteria: ReviewCriterion[],
  rating?: number,
  year?: number
): Promise<string[]> => {
  try {
    if (!title.trim() || criteria.length === 0) return [];
    const { starters } = await callAI<{ starters?: string[] }>({
      action: 'review-starters',
      context: describeRating(title, year, criteria, rating),
      text: 'Donne-moi trois amorces.',
    });
    return Array.isArray(starters) ? starters.filter((s) => typeof s === 'string' && s.trim()) : [];
  } catch (error: any) {
    // Silencieux par choix : les amorces sont un coup de pouce, pas une étape.
    // Faire surgir une erreur là où l'utilisateur allait simplement écrire
    // transformerait une aide absente en incident.
    if (import.meta.env.DEV) console.error('[IA] Amorces indisponibles :', error?.message);
    return [];
  }
};

/**
 * Prolonge l'avis en cours d'une seule phrase.
 *
 * Une seule, et jamais la dernière : c'est ce qui garde l'auteur aux commandes.
 * Le serveur tronque à la première ponctuation forte, parce qu'un modèle à qui
 * l'on demande une phrase en rend parfois deux.
 */
export const continueReview = async (
  title: string,
  criteria: ReviewCriterion[],
  currentText: string,
  rating?: number,
  year?: number
): Promise<string> => {
  const written = currentText.trim();
  if (!written) return '';

  const { text } = await callAI<{ text?: string }>({
    action: 'review-continue',
    context: `${describeRating(title, year, criteria, rating)}

CE QU'IL A ÉCRIT JUSQU'ICI :
${written}`,
    text: written,
  });

  return (text || '').trim();
};

/** Une observation du portrait, et le chiffre qui la soutient. */
export interface TasteTrait {
  text: string;
  figure: string;
}

/**
 * Trois observations sur une façon de noter.
 *
 * Le partage des rôles est ce qui distingue ce portrait d'un horoscope :
 * l'application calcule les moyennes et les corrélations, le modèle ne fait que
 * les mettre en phrases, et chaque observation doit citer un chiffre. Une phrase
 * inventée sur quelqu'un se lit exactement comme une phrase vraie — seul le
 * chiffre affiché à côté permet de trancher.
 */
export const getTastePortrait = async (statsDescription: string): Promise<TasteTrait[]> => {
  const { traits } = await callAI<{ traits?: TasteTrait[] }>({
    action: 'portrait',
    context: statsDescription,
    text: 'Écris mon portrait.',
  });
  return Array.isArray(traits) ? traits.filter((tr) => tr?.text) : [];
};

/** Ce qu'un film proposé vaut pour un membre donné. */
export interface SpacePitch {
  name: string;
  text: string;
}

/**
 * Un argument par membre, pour un film proposé à un espace.
 *
 * Un film posé sans un mot ne déclenche rien : celui qui le voit ne sait pas
 * s'il lui est destiné, et dans le doute il passe. L'argument s'adresse donc à
 * chacun séparément, à partir de ses notes — un même film ne se défend pas de la
 * même façon auprès de quelqu'un qui adore l'image et de quelqu'un qui ne
 * pardonne rien au scénario.
 */
export const getSpacePitches = async (
  film: { title: string; year?: number; overview?: string },
  members: { name: string; taste: string }[]
): Promise<SpacePitch[]> => {
  if (members.length === 0) return [];

  const context = `LE FILM PROPOSÉ :
${film.title}${film.year ? ` (${film.year})` : ''}
${film.overview ? `Résumé : ${film.overview.slice(0, 600)}` : ''}

LES MEMBRES ET LEUR FAÇON DE NOTER :
${members.map((m) => `— ${m.name} : ${m.taste}`).join('\n')}`;

  const { pitches } = await callAI<{ pitches?: SpacePitch[] }>({
    action: 'space-pitch',
    context,
    text: `Écris un argument pour chacun des ${members.length} membres.`,
  });

  return Array.isArray(pitches) ? pitches.filter((p) => p?.name && p?.text) : [];
};

/** Un film proposé, une fois retrouvé dans TMDB. */
export interface PersonalRecommendation {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  voteAverage: number;
  /** Pourquoi ce film-là, au vu de ses notes. C'est ce qui vaut le détour. */
  reason: string;
}

/**
 * Décrit une collection au modèle, par ce qu'elle révèle plutôt qu'en entier.
 *
 * Les meilleures notes disent ce que la personne cherche, les plus basses ce
 * qu'elle ne pardonne pas — et les secondes sont au moins aussi instructives.
 * Envoyer les soixante films coûterait cher pour n'ajouter que du milieu de
 * tableau, qui ne tranche rien.
 */
/** Un film noté, réduit à ce qui sert à décrire un goût. */
export interface RatedFilm {
  title: string;
  year?: number;
  score: number;
  criteria: { label: string; value: number }[];
}

/**
 * Décrit quelqu'un par les films qu'il a aimés, critère par critère.
 *
 * La tentation est de résumer un goût par des moyennes : « image 6,4/10 ». C'est
 * commode et ça ne décrit personne. Quelqu'un qui met 9 à l'image des films
 * qu'il adore et 3 à celle des films qu'il déteste ressort à 6 — exactement
 * comme quelqu'un que l'image laisse indifférent. La moyenne écrase précisément
 * ce qu'on cherchait à voir.
 *
 * On regarde donc ce qu'il RÉCOMPENSE : les critères des films qu'il a bien
 * notés, film par film. Et on joint ses moyennes de référence, sans quoi un 8 ne
 * se lit pas — c'est un exploit chez quelqu'un qui plafonne à 6, une déception
 * chez quelqu'un qui distribue des 9.
 */
export const describeLovedFilms = (films: RatedFilm[], name?: string): string => {
  if (films.length === 0) return '';

  const sorted = [...films].sort((a, b) => b.score - a.score);

  // Le seuil du « bien noté » suit la personne, pas une constante : chez un
  // sévère, 7 est déjà un compliment rare, et un seuil fixe ne retiendrait rien.
  const median = sorted[Math.floor(sorted.length / 2)]?.score ?? 0;
  const bar = Math.max(median, 6.5);
  const loved = sorted.filter((f) => f.score >= bar).slice(0, 10);
  const kept = loved.length >= 3 ? loved : sorted.slice(0, Math.min(5, sorted.length));

  // Les moyennes ne servent que de repère de lecture, jamais de portrait.
  const baseline = new Map<string, number[]>();
  for (const film of films) {
    for (const c of film.criteria) {
      baseline.set(c.label, [...(baseline.get(c.label) ?? []), c.value]);
    }
  }
  const reference = [...baseline.entries()]
    .map(([label, values]) => {
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      return `${label} ${avg.toFixed(1)}`;
    })
    .join(', ');

  const line = (f: RatedFilm) =>
    `- ${f.title}${f.year ? ` (${f.year})` : ''} — ${f.score.toFixed(1)}/10 · ` +
    f.criteria.map((c) => `${c.label} ${c.value}`).join(', ');

  const disliked = sorted
    .filter((f) => f.score < Math.min(5, bar - 2))
    .slice(-4)
    .reverse();

  const who = name ? `${name.toUpperCase()} — ` : '';

  return `${who}${films.length} films notés.

CE QU'IL RÉCOMPENSE — ses films les mieux notés, critère par critère.
C'est là que se lit son goût : regarde QUELS critères portent ces notes, pas la
note globale.
${kept.map(line).join('\n')}

SES MOYENNES DE RÉFÉRENCE, pour savoir lire les chiffres ci-dessus :
${reference}
${
  disliked.length > 0
    ? `\nCE QU'IL NE PARDONNE PAS — ses plus mauvaises notes :\n${disliked.map(line).join('\n')}`
    : ''
}`;
};

/** Les films de la collection locale, ramenés à la forme commune. */
const toRatedFilms = (movies: Movie[]): RatedFilm[] =>
  movies
    .filter((m) => m.status === 'watched')
    .map((m) => ({
      title: m.title,
      year: m.year,
      score:
        m.adaptiveRating?.weightedRating ??
        (m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4,
      criteria: m.adaptiveRating?.criteria?.length
        ? m.adaptiveRating.criteria.map((c) => ({
            label: currentCriterionLabel(c.label, c.key),
            value: Number(c.value),
          }))
        : [
            { label: 'Scénario', value: Number(m.ratings.story) },
            { label: 'Image', value: Number(m.ratings.visuals) },
            { label: 'Jeu des acteurs', value: Number(m.ratings.acting) },
            { label: 'Son & musique', value: Number(m.ratings.sound) },
          ],
    }));

const describeTaste = (movies: Movie[]): string => describeLovedFilms(toRatedFilms(movies));

/**
 * Cinq films choisis d'après la façon de noter, et non d'après un graphe de
 * co-visionnage.
 *
 * L'écran de recommandations interrogeait jusqu'ici les suggestions TMDB, du
 * « ceux qui ont aimé X ont aimé Y » : utile, mais aveugle au pourquoi. Un
 * modèle qui lit la grille critère par critère voit autre chose, et peut le
 * dire — c'est la justification qui fait la valeur, pas la liste d'affiches.
 *
 * Les titres inventés se règlent seuls : chacun est cherché dans TMDB, et ce
 * qui ne s'y trouve pas n'arrive jamais à l'écran.
 */
export const getPersonalRecommendations = async (
  movies: Movie[],
  knownTmdbIds: Set<number>
): Promise<PersonalRecommendation[]> => {
  const seen = movies
    .map((m) => m.title)
    .filter(Boolean)
    .slice(0, 80)
    .join(' · ');

  const context = `${describeTaste(movies)}

À NE PAS PROPOSER (déjà vus ou déjà en attente) :
${seen}`;

  const { recommendations } = await callAI<{
    recommendations?: { title: string; year: number | null; reason: string }[];
  }>({ action: 'recommend', context, text: 'Propose-moi cinq films.' });

  if (!Array.isArray(recommendations) || recommendations.length === 0) return [];

  const resolved = await Promise.all(
    recommendations.map(async (pick) => {
      try {
        const url =
          `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&language=fr-FR` +
          `&query=${encodeURIComponent(pick.title)}&include_adult=false` +
          (pick.year ? `&year=${pick.year}` : '');
        const data = await (await fetch(url)).json();
        const match = (data.results || []).find((r: any) => r.poster_path);
        if (!match || knownTmdbIds.has(match.id)) return null;

        return {
          tmdbId: match.id,
          title: match.title,
          posterPath: match.poster_path ?? null,
          releaseDate: match.release_date ?? null,
          voteAverage: Number(match.vote_average) || 0,
          reason: pick.reason,
        } as PersonalRecommendation;
      } catch {
        return null;
      }
    })
  );

  // Un même film proposé sous deux titres ne doit pas apparaître deux fois.
  const unique = new Map<number, PersonalRecommendation>();
  for (const item of resolved) if (item) unique.set(item.tmdbId, item);
  return [...unique.values()];
};

/** Ce que le relais a compris d'une envie, une fois borné et filtré. */
export interface DiscoverFilters {
  /** Ce qu'il a retenu, en fragments courts. Sert à vérifier, pas à décorer. */
  summary: string;
  mediaType: 'movie' | 'tv';
  withGenres: number[];
  withoutGenres: number[];
  runtimeLte: number | null;
  runtimeGte: number | null;
  yearGte: number | null;
  yearLte: number | null;
  voteAverageGte: number | null;
  provider: 'netflix' | 'prime' | 'disney' | 'canal' | null;
  sortBy: string;
}

/** Identifiants TMDB des plateformes, région France. */
const PROVIDER_IDS: Record<string, number> = {
  netflix: 8,
  prime: 119,
  disney: 337,
  canal: 381,
};

/**
 * Traduit une envie en critères de recherche.
 *
 * Le modèle ne choisit aucun film : il pose des filtres, et c'est TMDB qui
 * répond. Rien ne peut donc être inventé — c'est ce qui distingue cette
 * fonction d'un assistant, et ce qui la rend sûre. Le pire cas est un
 * contresens, visible aussitôt puisque `summary` dit ce qu'il a retenu.
 */
export const interpretDiscoverQuery = async (
  phrase: string,
  favoriteGenres?: string[]
): Promise<DiscoverFilters> => {
  const context = favoriteGenres?.length
    ? `Pour information, ses genres préférés sont : ${favoriteGenres.join(', ')}. N'en tiens compte que si la phrase reste vague.`
    : '';

  const { filters } = await callAI<{ filters?: DiscoverFilters }>({
    action: 'discover-query',
    context,
    text: phrase,
  });

  if (!filters) throw new Error("L'envie n'a pas pu être traduite.");
  return filters;
};

/**
 * Bâtit l'URL TMDB correspondante.
 *
 * Chaque valeur a déjà été bornée par le relais ; on ne fait ici que la mettre
 * en forme. Les genres exclus comptent autant que les inclus : « pas prise de
 * tête » se traduit surtout par ce qu'on ne veut pas voir.
 */
export const buildDiscoverUrl = (filters: DiscoverFilters): string => {
  const endpoint = filters.mediaType === 'tv' ? 'discover/tv' : 'discover/movie';
  const dateField = filters.mediaType === 'tv' ? 'first_air_date' : 'primary_release_date';

  const params = new URLSearchParams({
    api_key: TMDB_API_KEY,
    language: 'fr-FR',
    region: 'FR',
    watch_region: 'FR',
    include_adult: 'false',
    page: '1',
    sort_by:
      filters.mediaType === 'tv' && filters.sortBy === 'primary_release_date.desc'
        ? 'first_air_date.desc'
        : filters.sortBy,
    // Un tri par note sans plancher de votes remonte des films notés trois fois.
    'vote_count.gte': filters.sortBy === 'vote_average.desc' ? '200' : '50',
  });

  if (filters.withGenres.length) params.set('with_genres', filters.withGenres.join(','));
  if (filters.withoutGenres.length) params.set('without_genres', filters.withoutGenres.join(','));
  if (filters.runtimeLte != null) params.set('with_runtime.lte', String(filters.runtimeLte));
  if (filters.runtimeGte != null) params.set('with_runtime.gte', String(filters.runtimeGte));
  if (filters.yearGte != null) params.set(`${dateField}.gte`, `${filters.yearGte}-01-01`);
  if (filters.yearLte != null) params.set(`${dateField}.lte`, `${filters.yearLte}-12-31`);
  if (filters.voteAverageGte != null)
    params.set('vote_average.gte', String(filters.voteAverageGte));
  if (filters.provider && PROVIDER_IDS[filters.provider])
    params.set('with_watch_providers', String(PROVIDER_IDS[filters.provider]));

  return `${TMDB_BASE_URL}/${endpoint}?${params.toString()}`;
};

/**
 * 🎬 Récupère les films Netflix disponibles en France via TMDB
 */
const getNetflixMovies = async (genre?: string, limit: number = 10): Promise<any[]> => {
  try {
    const genreParam = genre ? `&with_genres=${TMDB_GENRE_MAP[genre] || ''}` : '';
    const url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=fr-FR&region=FR&watch_region=FR&with_watch_providers=8${genreParam}&sort_by=popularity.desc&page=1`;

    const response = await fetch(url);
    const data = await response.json();

    return (data.results || []).slice(0, limit).map((movie: any) => ({
      id: movie.id,
      title: movie.title,
      year: movie.release_date?.split('-')[0] || 'N/A',
      rating: movie.vote_average?.toFixed(1) || 'N/A',
      overview: movie.overview || '',
    }));
  } catch (error) {
    if (import.meta.env.DEV) console.error('Error fetching Netflix movies:', error);
    return [];
  }
};

/**
 * 🎯 Trouve des films similaires via TMDB
 */
const getSimilarMovies = async (tmdbId: number, limit: number = 5): Promise<any[]> => {
  try {
    const url = `${TMDB_BASE_URL}/movie/${tmdbId}/similar?api_key=${TMDB_API_KEY}&language=fr-FR&page=1`;
    const response = await fetch(url);
    const data = await response.json();

    return (data.results || []).slice(0, limit).map((movie: any) => ({
      id: movie.id,
      title: movie.title,
      year: movie.release_date?.split('-')[0] || 'N/A',
      rating: movie.vote_average?.toFixed(1) || 'N/A',
    }));
  } catch (error) {
    if (import.meta.env.DEV) console.error('Error fetching similar movies:', error);
    return [];
  }
};

/**
 * 📚 Fiches TMDB correspondant à une recherche, pour ancrer la réponse.
 *
 * La recherche approfondie s'appuyait sur Google Search pour ne pas répondre de
 * mémoire. TMDB joue le même rôle en mieux sur ce sujet précis : c'est la base de
 * référence du cinéma, elle est à jour, et l'application l'interroge déjà. Le
 * modèle reçoit donc des titres, des années et des résumés vérifiables plutôt
 * que ses propres souvenirs.
 */
const getSearchFacts = async (query: string, limit: number = 5): Promise<string> => {
  try {
    const url = `${TMDB_BASE_URL}/search/multi?api_key=${TMDB_API_KEY}&language=fr-FR&query=${encodeURIComponent(query)}&page=1`;
    const response = await fetch(url);
    const data = await response.json();

    const entries = (data.results || [])
      .filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv')
      .slice(0, limit)
      .map((r: any) => {
        const title = r.title || r.name;
        const year = (r.release_date || r.first_air_date || '').split('-')[0] || 'année inconnue';
        const note = r.vote_average ? `${r.vote_average.toFixed(1)}/10` : 'non noté';
        const overview = (r.overview || '').slice(0, 300);
        return `- ${title} (${year}) — ${note}${overview ? `\n  ${overview}` : ''}`;
      });

    if (entries.length === 0) return '';
    return `FICHES TMDB CORRESPONDANT À LA RECHERCHE :\n${entries.join('\n')}`;
  } catch (error) {
    if (import.meta.env.DEV) console.error('Error fetching search facts:', error);
    return '';
  }
};

/**
 * Recherche approfondie d'informations sur un film.
 *
 * `sources` reste dans le type pour ne rien casser chez les appelants, mais
 * n'est plus alimenté : l'ancien moteur citait ses pages web, celui-ci s'appuie
 * sur TMDB, qui n'est pas une liste de liens à afficher.
 */
export const deepMovieSearch = async (query: string): Promise<AISearchResult> => {
  try {
    const context = await getSearchFacts(query);
    const text = await askAI({ action: 'search', query, context });
    return { text: cleanAIResponse(text), sources: [] };
  } catch (error: any) {
    if (import.meta.env.DEV) console.error('DeepSearch Error:', error?.message);
    return { text: error?.message || 'Recherche temporairement indisponible.', sources: [] };
  }
};

/**
 * 🎬 Assistant conversationnel enrichi avec TMDB
 */
export const callCineAssistant = async (
  userQuestion: string,
  userProfile: UserProfile,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
): Promise<string> => {
  try {
    // Contexte utilisateur enrichi
    const watchedMovies = userProfile.movies.filter((m) => m.status === 'watched').slice(0, 15);
    const favoriteGenres = userProfile.favoriteGenres || [];

    // Calcul des stats de vibes
    const vibeStats =
      watchedMovies.length > 0
        ? {
            cerebral: (
              watchedMovies.reduce((acc, m) => acc + (m.vibe?.story || 5), 0) / watchedMovies.length
            ).toFixed(1),
            emotion: (
              watchedMovies.reduce((acc, m) => acc + (m.vibe?.emotion || 5), 0) /
              watchedMovies.length
            ).toFixed(1),
            fun: (
              watchedMovies.reduce((acc, m) => acc + (m.vibe?.fun || 5), 0) / watchedMovies.length
            ).toFixed(1),
            visuel: (
              watchedMovies.reduce((acc, m) => acc + (m.vibe?.visual || 5), 0) /
              watchedMovies.length
            ).toFixed(1),
            tension: (
              watchedMovies.reduce((acc, m) => acc + (m.vibe?.tension || 5), 0) /
              watchedMovies.length
            ).toFixed(1),
          }
        : null;

    // 🔥 ENRICHISSEMENT DYNAMIQUE selon la question
    let enrichedContext = '';
    const questionLower = userQuestion.toLowerCase();

    // Si mention de Netflix/streaming
    if (
      questionLower.includes('netflix') ||
      questionLower.includes('streaming') ||
      questionLower.includes('regarder')
    ) {
      const netflixMovies = await getNetflixMovies(favoriteGenres[0], 8);

      if (netflixMovies.length > 0) {
        enrichedContext += `\n\nFILMS NETFLIX FRANCE DISPONIBLES ACTUELLEMENT :\n`;
        enrichedContext += netflixMovies
          .map((m) => `- ${m.title} (${m.year}) - Note TMDB: ${m.rating}/10`)
          .join('\n');
      }
    }

    // Si mention de similarité
    if (questionLower.includes('comme') || questionLower.includes('similaire')) {
      const lastMovie = watchedMovies[0];
      if (lastMovie && lastMovie.tmdbId) {
        const similarMovies = await getSimilarMovies(lastMovie.tmdbId, 5);

        if (similarMovies.length > 0) {
          enrichedContext += `\n\nFILMS SIMILAIRES À "${lastMovie.title}" :\n`;
          enrichedContext += similarMovies
            .map((m) => `- ${m.title} (${m.year}) - ${m.rating}/10`)
            .join('\n');
        }
      }
    }

    // Construction du contexte
    const userContext = `
PROFIL DE ${userProfile.firstName.toUpperCase()} :
- Rôle : ${userProfile.role || 'Analyste'}
- Exigence : ${userProfile.severityIndex || 5}/10
- Patience : ${userProfile.patienceLevel || 5}/10
- Genres préférés : ${favoriteGenres.join(', ') || 'Non défini'}

15 DERNIERS FILMS VUS :
${watchedMovies
  .map((m, i) => {
    const avgRating = (
      (m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) /
      4
    ).toFixed(1);
    // Priority to personal comment, then review (synopsis/legacy comment)
    const comment = m.comment || m.review;
    return `${i + 1}. "${m.title}" (${m.year}) - ${m.genre} - Note: ${avgRating}/10${comment ? ` - "${comment}"` : ''}`;
  })
  .join('\n')}

${
  vibeStats
    ? `STATISTIQUES VIBES (moyennes) :
- Cérébral: ${vibeStats.cerebral}/10
- Émotion: ${vibeStats.emotion}/10
- Fun: ${vibeStats.fun}/10
- Visuel: ${vibeStats.visuel}/10
- Tension: ${vibeStats.tension}/10`
    : ''
}

${enrichedContext}
`;

    const text = await askAI({
      action: 'assistant',
      firstName: userProfile.firstName,
      context: userContext,
      history: conversationHistory,
      question: userQuestion,
    });

    return cleanAIResponse(text);
  } catch (error: any) {
    if (import.meta.env.DEV) console.error('CRITICAL CineAssistant Error:', error?.message);

    // Le relais renvoie déjà une phrase compréhensible pour chaque cas qu'il sait
    // nommer (pas connecté, quota atteint, service tombé). La répéter telle
    // quelle vaut mieux que de la remplacer par un message générique qui
    // masquerait ce qu'il faut faire.
    return error?.message
      ? `🎬 ${error.message}`
      : 'Ma pellicule a brûlé... 🎬\n\nRéessaye dans quelques secondes.';
  }
};
