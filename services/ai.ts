
import { GoogleGenAI } from "@google/genai";
import { UserProfile } from "../types";

export interface AISearchResult {
  text: string;
  sources: { title: string; uri: string }[];
}

const cleanAIResponse = (text: string): string => {
  return text.replace(/\*\*/g, '').replace(/\*/g, '').trim();
};

const getAIInstance = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("ERREUR : Clé API manquante dans l'environnement.");
  }
  return new GoogleGenAI({ apiKey: apiKey || "" });
};

export const deepMovieSearch = async (query: string): Promise<AISearchResult> => {
  try {
    const ai = getAIInstance();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: 'user', parts: [{ text: query }] }],
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "Tu es un expert ciné. Réponds avec des balises <b> pour les titres. Pas d'astérisques."
      },
    });

    const text = cleanAIResponse(response.text || "Aucune information trouvée.");
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.filter((c: any) => c.web).map((c: any) => ({ title: c.web.title, uri: c.web.uri }));

    return { text, sources };
  } catch (error) {
    console.error("DeepSearch Error:", error);
    return { text: "Service de recherche indisponible.", sources: [] };
  }
};

export const callCineAssistant = async (
  userQuestion: string,
  userProfile: UserProfile,
  conversationHistory: { role: 'user' | 'assistant', content: string }[]
): Promise<string> => {
  try {
    const ai = getAIInstance();
    
    const watchedMovies = userProfile.movies.filter(m => m.status === 'watched').slice(0, 10);
    const context = `Utilisateur: ${userProfile.firstName}, Profil: ${userProfile.role}. Films récents: ${watchedMovies.map(m => m.title).join(', ')}.`;

    const systemInstruction = `Tu es le Ciné-Assistant de "The Bitter". Tu parles à ${userProfile.firstName}.
Ton ton est piquant, expert et passionné. Tutoie l'utilisateur.
DIRECTIVES : Pas d'astérisques (**). Utilise <b>titre</b> pour les films. 
Utilise Google Search pour le streaming en France. Max 100 mots.
${context}`;

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
        temperature: 0.7,
      },
    });

    return cleanAIResponse(response.text || "Erreur de réponse.");
  } catch (error: any) {
    console.error("CineAssistant Error:", error);
    return "Ma pellicule a brûlé... Un problème de connexion empêche l'IA de répondre. Réessaie dans un instant.";
  }
};
