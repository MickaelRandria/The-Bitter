
import { GoogleGenAI } from "@google/genai";
import { UserProfile } from "../types";

export interface AISearchResult {
  text: string;
  sources: { title: string; uri: string }[];
}

/**
 * Nettoie la réponse de l'IA pour supprimer le Markdown et formater les titres en HTML.
 */
const cleanAIResponse = (text: string): string => {
  return text
    .replace(/(\*\*|__)(.*?)\1/g, "<b>$2</b>") // Conversion du gras Markdown en HTML
    .replace(/(\*|_)(.*?)\1/g, "$2")           // Suppression de l'italique
    .replace(/#{1,6}\s?/g, "")                // Suppression des headers
    .replace(/`{1,3}.*?`{1,3}/g, "")          // Suppression du code
    .replace(/>\s?/g, "")                     // Suppression des citations
    .replace(/\n{3,}/g, "\n\n")               // Normalisation des sauts de ligne
    .trim();
};

/**
 * Recherche approfondie d'informations sur un film via Gemini 3 & Google Search.
 */
export const deepMovieSearch = async (query: string): Promise<AISearchResult> => {
  try {
    // Utilisation de la clé configurée pour Vite/Vercel
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GOOGLE_AI_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: 'user', parts: [{ text: query }] }],
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "Tu es un expert cinéma. Réponds de manière concise. Utilise des balises <b> pour les titres de films. Pas de markdown."
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
 * Assistant conversationnel expert utilisant le modèle stable Gemini 2.5 Flash Lite.
 */
export const callCineAssistant = async (
  userQuestion: string,
  userProfile: UserProfile,
  conversationHistory: { role: 'user' | 'assistant', content: string }[]
): Promise<string> => {
  try {
    // Récupération dynamique de la clé pour éviter les closures vides
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GOOGLE_AI_KEY });
    
    const watchedMovies = userProfile.movies.filter(m => m.status === 'watched').slice(0, 10);
    const context = `Utilisateur: ${userProfile.firstName}, Profil: ${userProfile.role}. Films vus: ${watchedMovies.map(m => m.title).join(', ')}.`;

    const systemInstruction = `Tu es le Ciné-Assistant de "The Bitter". 
Ton ton est expert, passionné et piquant. Tutoie l'utilisateur.
RÈGLES :
1. JAMAIS d'astérisques (*).
2. Utilise <b> pour les noms de films.
3. Utilise Google Search pour le streaming ou actus.
4. Réponds en maximum 100 mots.
${context}`;

    // Formatage des rôles conforme au SDK (user/model)
    const formattedContents = [
      ...conversationHistory.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      })),
      { role: 'user', parts: [{ text: userQuestion }] }
    ];

    const response = await ai.models.generateContent({
      model: "gemini-flash-lite-latest", // Passage au modèle stable Gemini 2.5 Flash Lite
      contents: formattedContents as any,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
        temperature: 0.7,
      },
    });

    if (!response.text) throw new Error("Réponse vide de l'IA");

    return cleanAIResponse(response.text);
  } catch (error: any) {
    console.error("CRITICAL CineAssistant Error:", error.message);
    return "Ma pellicule a brûlé... Une erreur technique de configuration empêche l'IA de répondre (Vérifiez la clé VITE_GOOGLE_AI_KEY).";
  }
};
