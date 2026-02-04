
import { GoogleGenAI } from "@google/genai";
import { UserProfile } from "../types";

export interface AISearchResult {
  text: string;
  sources: { title: string; uri: string }[];
}

const cleanAIResponse = (text: string): string => {
  // Regex plus complète pour nettoyer TOUT le markdown restant
  return text
    .replace(/\*\*\*/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/###/g, '')
    .replace(/##/g, '')
    .replace(/#/g, '')
    .trim();
};

export const deepMovieSearch = async (query: string): Promise<AISearchResult> => {
  try {
    // Initialisation directe pour éviter les closures instables sur mobile
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: 'user', parts: [{ text: query }] }],
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "Tu es un expert cinéma. Utilise des balises <b> pour les titres. Pas de markdown (*)."
      },
    });

    const text = cleanAIResponse(response.text || "Aucune donnée trouvée.");
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.filter((c: any) => c.web).map((c: any) => ({ title: c.web.title, uri: c.web.uri }));

    return { text, sources };
  } catch (error: any) {
    console.error("DEBUG IA - DeepSearch Fail:", error.message || error);
    return { text: "Recherche temporairement indisponible.", sources: [] };
  }
};

export const callCineAssistant = async (
  userQuestion: string,
  userProfile: UserProfile,
  conversationHistory: { role: 'user' | 'assistant', content: string }[]
): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    
    const watchedMovies = userProfile.movies.filter(m => m.status === 'watched').slice(0, 10);
    const context = `Utilisateur: ${userProfile.firstName}, Profil: ${userProfile.role}. Films récents: ${watchedMovies.map(m => m.title).join(', ')}.`;

    const systemInstruction = `Tu es le Ciné-Assistant de "The Bitter". Tu parles à ${userProfile.firstName}.
Ton ton est piquant, expert et passionné. Tutoie l'utilisateur.
RÈGLES STRICTES : 
1. JAMAIS d'astérisques (*). 
2. Utilise <b>titre</b> pour les films. 
3. Utilise Google Search pour vérifier les plateformes streaming en France si besoin.
4. Réponds en maximum 100 mots.
${context}`;

    // Le SDK attend 'model' pour les réponses de l'IA
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

    if (!response.text) throw new Error("Réponse IA vide");

    return cleanAIResponse(response.text);
  } catch (error: any) {
    // Log crucial pour diagnostiquer le problème sur ton téléphone
    console.error("DEBUG IA - CineAssistant Fail:", error.message || error);
    
    // Message d'erreur enrichi pour le test
    return "Désolé, ma pellicule a brûlé... (Erreur technique détectée). Vérifie ta connexion ou réessaie dans quelques secondes.";
  }
};
