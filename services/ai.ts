import { UserProfile } from '../types';
import { TMDB_API_KEY, TMDB_BASE_URL, TMDB_GENRE_MAP } from '../constants';
import { supabase } from './supabase';

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
