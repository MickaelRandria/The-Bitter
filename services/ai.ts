
import { GoogleGenAI } from "@google/genai";
import { UserProfile } from "../types";
import { TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL, TMDB_GENRE_MAP } from "../constants";

/**
 * Logique de récupération de clé API robuste pour environnements Vite (client) et Vercel.
 */
const getApiKey = (): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_AI_KEY) {
    return import.meta.env.VITE_GOOGLE_AI_KEY as string;
  }
  if (typeof process !== 'undefined' && process.env?.VITE_GOOGLE_AI_KEY) {
    return process.env.VITE_GOOGLE_AI_KEY;
  }
  // Fallback plateforme standard
  if (typeof process !== 'undefined' && process.env?.API_KEY) {
    return process.env.API_KEY;
  }
  return "";
};

/**
 * Nettoyage des réponses pour l'affichage mobile : 
 * Convertit le gras Markdown en HTML et préserve les balises structurales.
 */
const cleanAIResponse = (text: string): string => {
  if (!text) return "";
  
  return text
    // Conversion du gras Markdown (**titre**) en HTML <b>
    .replace(/\*\*(.*?)\*\*/g, "<b>$2</b>")
    .replace(/__(.*?)__/g, "<b>$2</b>")
    // // Suppression des astérisques et underscores résiduels (italique, listes)
    // .replace(/\*/g, "")
    // .replace(/_/g, "")
    // // Suppression des headers Markdown
    // .replace(/#{1,6}\s?/g, "")
    // // On NE supprime PAS les chevrons > car ils servent aux balises HTML
    // .replace(/\n{3,}/g, "\n\n")
    .trim();
};

/**
 * Grounding TMDB : Récupère les films populaires sur Netflix France.
 */
const getNetflixGrounding = async (genre?: string): Promise<string> => {
  try {
    const genreId = genre ? TMDB_GENRE_MAP[genre] : '';
    const url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=fr-FR&region=FR&watch_region=FR&with_watch_providers=8${genreId ? `&with_genres=${genreId}` : ''}&sort_by=popularity.desc&page=1`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.results?.length) return "";
    
    return "\nCATALOGUE NETFLIX FRANCE ACTUEL :\n" + data.results.slice(0, 8).map((m: any) => 
      `- ${m.title} (${m.release_date?.split('-')[0]}) : ${m.vote_average}/10`
    ).join('\n');
  } catch (e) {
    return "";
  }
};

/**
 * Grounding TMDB : Récupère les films similaires au dernier film vu.
 */
const getSimilarityGrounding = async (tmdbId: number): Promise<string> => {
  try {
    const url = `${TMDB_BASE_URL}/movie/${tmdbId}/similar?api_key=${TMDB_API_KEY}&language=fr-FR&page=1`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.results?.length) return "";
    
    return `\nFILMS SIMILAIRES TROUVÉS SUR TMDB :\n` + data.results.slice(0, 5).map((m: any) => 
      `- ${m.title} (${m.release_date?.split('-')[0]}) : ${m.vote_average}/10`
    ).join('\n');
  } catch (e) {
    return "";
  }
};

export interface AISearchResult {
  text: string;
  sources: { title: string; uri: string }[];
}

/**
 * Recherche profonde Gemini 3 avec Google Search Grounding.
 */
export const deepMovieSearch = async (query: string): Promise<AISearchResult> => {
  try {
    const apiKey = getApiKey();
    const ai = new GoogleGenAI({ apiKey });
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: 'user', parts: [{ text: query }] }],
      config: {
        tools: [{ googleSearch: {} }],
        maxOutputTokens: 800,
        thinkingConfig: { thinkingBudget: 400 },
        systemInstruction: "Expert cinéma. Réponds sans markdown type astérisques. Utilise <b> pour les titres. Sois percutant."
      },
    });

    const text = cleanAIResponse(response.text || "Aucune information trouvée.");
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.filter((c: any) => c.web).map((c: any) => ({ title: c.web.title, uri: c.web.uri }));

    return { text, sources };
  } catch (error: any) {
    console.error("DeepSearch Error:", error.message);
    return { text: "Recherche temporairement indisponible.", sources: [] };
  }
};

/**
 * Assistant Ciné-Analyste enrichi dynamiquement avec Grounding TMDB et Gemini 3 Flash.
 */
export const callCineAssistant = async (
  userQuestion: string,
  userProfile: UserProfile,
  conversationHistory: { role: 'user' | 'assistant', content: string }[]
): Promise<string> => {
  try {
    const apiKey = getApiKey();
    const ai = new GoogleGenAI({ apiKey });
    const questionLower = userQuestion.toLowerCase();
    
    const watchedMovies = userProfile.movies.filter(m => m.status === 'watched').slice(0, 15);
    const favoriteGenre = userProfile.favoriteGenres?.[0];
    
    let tmdbData = "";
    if (questionLower.includes('netflix') || questionLower.includes('regarder') || questionLower.includes('streaming')) {
      tmdbData += await getNetflixGrounding(favoriteGenre);
    }
    
    if (questionLower.includes('comme') || questionLower.includes('similaire') || questionLower.includes('conseille')) {
      const lastWatched = watchedMovies[0];
      if (lastWatched?.tmdbId) {
        tmdbData += await getSimilarityGrounding(lastWatched.tmdbId);
      }
    }

    const systemInstruction = `Tu es le Ciné-Assistant de "The Bitter". 
Ton ton est celui d'un critique érudit, passionné et piquant. Tutoie l'utilisateur.

CONTEXTE UTILISATEUR :
- Prénom : ${userProfile.firstName}
- Profil : ${userProfile.role || 'Analyste'}
- Exigence : ${userProfile.severityIndex}/10
- Patience : ${userProfile.patienceLevel}/10
- Bibliothèque : ${watchedMovies.map(m => m.title).join(', ')}

DONNÉES TMDB :
${tmdbData || 'Aucune donnée TMDB spécifique.'}

RÈGLES ABSOLUES :
1. TERMINES TOUJOURS tes phrases. Ne t'arrête jamais en plein milieu d'une idée.
2. PAS D'ASTÉRISQUES (*). Utilise exclusivement <b> pour les titres de films.
3. Utilise les données TMDB et Google Search pour des recommandations actuelles et streaming FR.
4. Réponse complète et fluide d'environ 100-120 mots.`;

    const formattedContents = [
      ...conversationHistory.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      })),
      { role: 'user', parts: [{ text: userQuestion }] }
    ];

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: formattedContents as any,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
        maxOutputTokens: 800,
        thinkingConfig: { thinkingBudget: 400 },
        temperature: 0.7,
      },
    });

    if (!response.text) throw new Error("Empty response");

    return cleanAIResponse(response.text);
  } catch (error: any) {
    console.error("CineAssistant Error:", error.message);
    return "Ma pellicule a brûlé... 🎬 Une erreur technique liée à la clé API ou à la configuration empêche l'IA de répondre. Vérifie tes secrets VITE_GOOGLE_AI_KEY.";
  }
};
