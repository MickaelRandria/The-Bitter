
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
    throw new Error("API_KEY_MISSING");
  }
  return new GoogleGenAI({ apiKey });
};

export const deepMovieSearch = async (query: string): Promise<AISearchResult> => {
  try {
    const ai = getAIInstance();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: 'user', parts: [{ text: query }] }],
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "Expert ciné. Balises <b> obligatoires pour titres. Pas d'astérisques."
      },
    });

    const text = cleanAIResponse(response.text || "Aucune donnée.");
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.filter((c: any) => c.web).map((c: any) => ({ title: c.web.title, uri: c.web.uri }));

    return { text, sources };
  } catch (error) {
    console.error("DeepSearch Error:", error);
    return { text: "Recherche indisponible.", sources: [] };
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
Ton ton est piquant et expert. Tutoie l'utilisateur.
RÈGLES : Pas d'astérisques (**). Utilise <b>titre</b> pour les films. Max 100 mots.
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

    return cleanAIResponse(response.text || "Erreur de génération.");
  } catch (error: any) {
    console.error("CineAssistant Fail:", error);
    if (error.message === "API_KEY_MISSING") return "Configuration requise : La clé API est absente du serveur.";
    return "Ma pellicule a brûlé... Un problème technique empêche la connexion à l'IA.";
  }
};
