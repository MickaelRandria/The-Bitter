
import { GoogleGenAI } from "@google/genai";
import { UserProfile } from "../types";
import { TMDB_API_KEY, TMDB_BASE_URL, TMDB_GENRE_MAP } from "../constants";

export interface AISearchResult {
  text: string;
  sources: { title: string; uri: string }[];
}

/**
 * 🔑 Récupère la clé API de façon robuste (dev + prod)
 */
const getGoogleAIKey = (): string => {
  // 1. Essaie import.meta.env (Vite standard)
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GOOGLE_AI_KEY) {
    return import.meta.env.VITE_GOOGLE_AI_KEY;
  }
  
  // 2. Essaie process.env (fallback Node)
  if (typeof process !== 'undefined' && process.env && process.env.VITE_GOOGLE_AI_KEY) {
    return process.env.VITE_GOOGLE_AI_KEY;
  }

  // 3. Fallback Hardcoded (Provided in .env)
  // Essential for environments where env vars injection fails
  return 'AIzaSyC_djBFDJBClBvhjfYnqNciWxUGCHhgdYE';
};

/**
 * ✅ Nettoyage SIMPLE : garde tout sauf les astérisques
 */
const cleanAIResponse = (text: string): string => {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")  // ** → <b>
    .replace(/\*([^*]+)\*/g, "$1")              // * → supprime
    .trim();
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
      overview: movie.overview || ''
    }));
  } catch (error) {
    console.error("Error fetching Netflix movies:", error);
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
      rating: movie.vote_average?.toFixed(1) || 'N/A'
    }));
  } catch (error) {
    console.error("Error fetching similar movies:", error);
    return [];
  }
};

/**
 * Recherche approfondie d'informations sur un film via Gemini + Google Search.
 */
export const deepMovieSearch = async (query: string): Promise<AISearchResult> => {
  try {
    const apiKey = getGoogleAIKey();
    const ai = new GoogleGenAI({ apiKey });
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: 'user', parts: [{ text: query }] }],
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "Tu es un expert cinéma. Réponds naturellement. Utilise **titre** pour mettre en gras les films importants."
      },
    });

    const text = cleanAIResponse(response.text || "Aucune information trouvée.");
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks
      .filter((c: any) => c.web)
      .map((c: any) => ({ title: c.web.title, uri: c.web.uri }));

    return { text, sources };
  } catch (error: any) {
    console.error("DeepSearch Error:", error.message);
    return { text: "Recherche temporairement indisponible.", sources: [] };
  }
};

/**
 * 🎬 Assistant conversationnel enrichi avec TMDB
 */
export const callCineAssistant = async (
  userQuestion: string,
  userProfile: UserProfile,
  conversationHistory: { role: 'user' | 'assistant', content: string }[]
): Promise<string> => {
  try {
    const apiKey = getGoogleAIKey();
    const ai = new GoogleGenAI({ apiKey });
    
    // Contexte utilisateur enrichi
    const watchedMovies = userProfile.movies.filter(m => m.status === 'watched').slice(0, 15);
    const favoriteGenres = userProfile.favoriteGenres || [];
    
    // Calcul des stats de vibes
    const vibeStats = watchedMovies.length > 0 ? {
      cerebral: (watchedMovies.reduce((acc, m) => acc + (m.vibe?.story || 5), 0) / watchedMovies.length).toFixed(1),
      emotion: (watchedMovies.reduce((acc, m) => acc + (m.vibe?.emotion || 5), 0) / watchedMovies.length).toFixed(1),
      fun: (watchedMovies.reduce((acc, m) => acc + (m.vibe?.fun || 5), 0) / watchedMovies.length).toFixed(1),
      visuel: (watchedMovies.reduce((acc, m) => acc + (m.vibe?.visual || 5), 0) / watchedMovies.length).toFixed(1),
      tension: (watchedMovies.reduce((acc, m) => acc + (m.vibe?.tension || 5), 0) / watchedMovies.length).toFixed(1)
    } : null;

    // 🔥 ENRICHISSEMENT DYNAMIQUE selon la question
    let enrichedContext = '';
    const questionLower = userQuestion.toLowerCase();
    
    // Si mention de Netflix/streaming
    if (questionLower.includes('netflix') || questionLower.includes('streaming') || questionLower.includes('regarder')) {
      console.log("🎬 Fetching Netflix catalog...");
      const netflixMovies = await getNetflixMovies(favoriteGenres[0], 8);
      
      if (netflixMovies.length > 0) {
        enrichedContext += `\n\nFILMS NETFLIX FRANCE DISPONIBLES ACTUELLEMENT :\n`;
        enrichedContext += netflixMovies.map(m => 
          `- ${m.title} (${m.year}) - Note TMDB: ${m.rating}/10`
        ).join('\n');
      }
    }
    
    // Si mention de similarité
    if (questionLower.includes('comme') || questionLower.includes('similaire')) {
      const lastMovie = watchedMovies[0];
      if (lastMovie && lastMovie.tmdbId) {
        console.log(`🎯 Finding movies similar to ${lastMovie.title}...`);
        const similarMovies = await getSimilarMovies(lastMovie.tmdbId, 5);
        
        if (similarMovies.length > 0) {
          enrichedContext += `\n\nFILMS SIMILAIRES À "${lastMovie.title}" :\n`;
          enrichedContext += similarMovies.map(m => 
            `- ${m.title} (${m.year}) - ${m.rating}/10`
          ).join('\n');
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
${watchedMovies.map((m, i) => {
  const avgRating = ((m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4).toFixed(1);
  return `${i + 1}. "${m.title}" (${m.year}) - ${m.genre} - Note: ${avgRating}/10${m.review ? ` - "${m.review}"` : ''}`;
}).join('\n')}

${vibeStats ? `STATISTIQUES VIBES (moyennes) :
- Cérébral: ${vibeStats.cerebral}/10
- Émotion: ${vibeStats.emotion}/10
- Fun: ${vibeStats.fun}/10
- Visuel: ${vibeStats.visuel}/10
- Tension: ${vibeStats.tension}/10` : ''}

${enrichedContext}
`;

    const systemInstruction = `Tu es le Ciné-Assistant de "The Bitter", expert cinéma passionné et légèrement piquant.

STYLE DE RÉPONSE :
- Parle NATURELLEMENT comme un vrai conseiller ciné
- Tutoie l'utilisateur
- Utilise **Titre du Film** pour mettre en gras les films importants
- Utilise des émojis si ça fait sens (🎬 🔥 etc.)
- Reste conversationnel et fluide

TES OUTILS :
- Base tes recommandations sur le PROFIL et l'HISTORIQUE de ${userProfile.firstName}
- Utilise Google Search pour vérifier la dispo streaming EN FRANCE
- Si tu recommandes, EXPLIQUE pourquoi ça match son profil
- Cite des films PRÉCIS du catalogue Netflix/Prime si demandé

RÈGLES :
- Maximum 150 mots par réponse
- Sois précis : cite des titres réels, pas des généralités
- Si tu ne sais pas, dis-le honnêtement

${userContext}`;

    // Formatage des messages
    const formattedContents = [
      ...conversationHistory.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      })),
      { role: 'user', parts: [{ text: userQuestion }] }
    ];

    const response = await ai.models.generateContent({
      model: "gemini-flash-lite-latest",
      contents: formattedContents as any,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
        temperature: 0.9,
        topP: 0.95,
        topK: 40
      },
    });

    if (!response.text) throw new Error("Réponse vide de l'IA");

    return cleanAIResponse(response.text);
  } catch (error: any) {
    console.error("CRITICAL CineAssistant Error:", error.message);
    console.error("Error stack:", error.stack);
    
    if (error.message.includes("API key")) {
      return "🔑 **Erreur de configuration**\n\nLa clé API Google AI n'est pas accessible. Vérifie que VITE_GOOGLE_AI_KEY est bien configurée dans les variables d'environnement Vercel avec les 3 environnements cochés (Production + Preview + Development).";
    }
    
    return `Ma pellicule a brûlé... 🎬\n\n**Erreur technique:** ${error.message}\n\nRéessaye dans quelques secondes ou contacte le support si le problème persiste.`;
  }
};
