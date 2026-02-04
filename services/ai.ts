
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
  // On utilise directement process.env.API_KEY injecté par le système
  return new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
};

export const deepMovieSearch = async (query: string): Promise<AISearchResult> => {
  try {
    const ai = getAIInstance();
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: [{ role: 'user', parts: [{ text: query }] }],
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "Tu es un expert ciné. Réponds en utilisant <b>titre</b> pour les films. Pas d'astérisques."
      },
    });

    const text = cleanAIResponse(response.text || "Aucune donnée trouvée.");
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.filter((c: any) => c.web).map((c: any) => ({ title: c.web.title, uri: c.web.uri }));

    return { text, sources };
  } catch (error) {
    console.error("DeepSearch Error:", error);
    return { text: "Recherche temporairement indisponible.", sources: [] };
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
RÈGLES STRICTES : 
1. JAMAIS d'astérisques (**). 
2. Utilise <b>titre</b> pour les films. 
3. Utilise Google Search pour vérifier les plateformes streaming en France.
4. Max 100 mots.
${context}`;

    const formattedContents = [
      ...conversationHistory.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      })),
      { role: 'user', parts: [{ text: userQuestion }] }
    ];

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: formattedContents as any,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
        temperature: 0.7,
      },
    });

    return cleanAIResponse(response.text || "Je n'ai pas pu analyser ta demande.");
  } catch (error: any) {
    console.error("CineAssistant Fail:", error);
    return "Désolé, ma pellicule a brûlé... Peux-tu reformuler ou réessayer dans quelques secondes ?";
  }
};
