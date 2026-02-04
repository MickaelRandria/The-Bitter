
import { GoogleGenAI } from "@google/genai";
import { UserProfile } from "../types";

export interface AISearchResult {
  text: string;
  sources: { title: string; uri: string }[];
}

const cleanAIResponse = (text: string): string => {
  // Regex robuste pour supprimer les artefacts Markdown sur mobile
  return text
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/#{1,6}\s?/g, "")
    .replace(/`{1,3}.*?`{1,3}/g, "")
    .replace(/>\s?/g, "")
    .trim();
};

export const deepMovieSearch = async (query: string): Promise<AISearchResult> => {
  try {
    // Utilisation de process.env.API_KEY injecté par l'environnement
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GOOGLE_AI_KEY || "" });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: 'user', parts: [{ text: query }] }],
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "Expert cinéma. Utilise <b>titre</b> pour les films. Pas de markdown."
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

export const callCineAssistant = async (
  userQuestion: string,
  userProfile: UserProfile,
  conversationHistory: { role: 'user' | 'assistant', content: string }[]
): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GOOGLE_AI_KEY|| "" });
    
    const watchedMovies = userProfile.movies.filter(m => m.status === 'watched').slice(0, 10);
    const context = `Utilisateur: ${userProfile.firstName}, Profil: ${userProfile.role}. Films vus: ${watchedMovies.map(m => m.title).join(', ')}.`;

    const systemInstruction = `Tu es le Ciné-Assistant de "The Bitter" (v0.71). 
Ton ton est expert et piquant. Tutoie l'utilisateur. 
RÈGLES : Pas d'astérisques. Titres en gras <b>. 
Vérifie le streaming via Google Search. Max 100 mots.
${context}`;

    // IMPORTANT : Transformation des rôles pour le SDK stable
    const formattedContents = [
      ...conversationHistory.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      })),
      { role: 'user', parts: [{ text: userQuestion }] }
    ];

    const response = await ai.models.generateContent({
      model: "gemini-flash-latest", // Passage au modèle stable de production
      contents: formattedContents as any,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
        temperature: 0.7,
      },
    });

    if (!response.text) throw new Error("IA_EMPTY_RESPONSE");

    return cleanAIResponse(response.text);
  } catch (error: any) {
    console.error("CRITICAL CineAssistant Error:", error.message);
    return "Ma pellicule a brûlé... (v0.71) Un problème de connexion avec Google Gemini empêche l'IA de répondre. Vérifie ta connexion.";
  }
};
