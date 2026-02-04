
import { GoogleGenAI } from "@google/genai";
import { UserProfile } from "../types";
import { TMDB_API_KEY, TMDB_BASE_URL, TMDB_GENRE_MAP } from "../constants";

export interface AISearchResult {
  text: string;
  sources: { title: string; uri: string }[];
}

/**
 * Nettoyage robuste pour éviter les coupures de texte et les balises orphelines.
 */
const cleanAIResponse = (text: string): string => {
  if (!text) return "";
  
  return text
    // On convertit le gras Markdown (**titre**) en HTML propre
    .replace(/\*\*(.*?)\*\*/g, "<b>$2</b>")
    .replace(/__(.*?)__/g, "<b>$2</b>")
    // On supprime les astérisques restants (italique ou listes) pour éviter les bugs d'affichage mobile
    .replace(/\*/g, "")
    .replace(/_/g, "")
    // On nettoie les headers Markdown s'il y en a
    .replace(/#{1,6}\s?/g, "")
    // On normalise les sauts de ligne
    .replace(/\n{3,}/g, "\n\n")
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
    
    return "\nCATALOGUE NETFLIX FRANCE ACTUEL (Grounding TMDB) :\n" + data.results.slice(0, 8).map((m: any) => 
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
    
    return `\nFILMS SIMILAIRES TROUVÉS (Grounding TMDB) :\n` + data.results.slice(0, 5).map((m: any) => 
      `- ${m.title} (${m.release_date?.split('-')[0]}) : ${m.vote_average}/10`
    ).join('\n');
  } catch (e) {
    return "";
  }
};

/**
 * Recherche profonde Gemini 3 avec Google Search Grounding.
 */
export const deepMovieSearch = async (query: string): Promise<AISearchResult> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: 'user', parts: [{ text: query }] }],
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "Expert cinéma. Réponds sans markdown. Utilise <b> pour les titres. Sois percutant."
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
 * Assistant Ciné-Analyste utilisant Gemini 3 Flash pour plus de précision et éviter les réponses tronquées.
 */
export const callCineAssistant = async (
  userQuestion: string,
  userProfile: UserProfile,
  conversationHistory: { role: 'user' | 'assistant', content: string }[]
): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    const questionLower = userQuestion.toLowerCase();
    
    // 1. Extraction du contexte historique
    const watchedMovies = userProfile.movies.filter(m => m.status === 'watched').slice(0, 15);
    const favoriteGenre = userProfile.favoriteGenres?.[0];
    
    // 2. Grounding Dynamique TMDB
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
Ton ton est celui d'un critique de la Nouvelle Vague : érudit, passionné, piquant, tutoie.

CONTEXTE UTILISATEUR :
- Prénom : ${userProfile.firstName}
- Profil : ${userProfile.role || 'Analyste'}
- Exigence : ${userProfile.severityIndex}/10
- Patience : ${userProfile.patienceLevel}/10
- Bibliothèque : ${watchedMovies.map(m => m.title).join(', ')}

DONNÉES TEMPS RÉEL (Grounding TMDB) :
${tmdbData || 'Aucune donnée TMDB spécifique pour cette requête.'}

RÈGLES D'OR :
1. TERMINES TOUJOURS tes phrases. Ne t'arrête JAMAIS au milieu d'une idée ou d'une phrase.
2. PAS D'ASTÉRISQUES (*). Utilise exclusivement des balises <b> pour mettre en gras les titres de films.
3. Utilise les données TMDB pour tes recommandations.
4. Vérifie les actus/disponibilités via Google Search si nécessaire.
5. Sois concis mais complet : environ 100 mots.
6. Agis comme si tu avais une connaissance innée du catalogue sans citer TMDB explicitement.`;

    const formattedContents = [
      ...conversationHistory.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      })),
      { role: 'user', parts: [{ text: userQuestion }] }
    ];

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", // Passage à Gemini 3 pour une meilleure stabilité et éviter les coupures
      contents: formattedContents as any,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
        temperature: 0.7, // Température plus basse pour plus de cohérence et éviter l'errance
      },
    });

    if (!response.text) throw new Error("Réponse vide");

    return cleanAIResponse(response.text);
  } catch (error: any) {
    console.error("CineAssistant Error:", error.message);
    return "Ma pellicule a brûlé... 🎬 Une erreur technique empêche l'IA de répondre complètement. Réessaye dans un instant.";
  }
};
