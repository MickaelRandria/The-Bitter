
import { GoogleGenAI } from "@google/genai";
import { UserProfile } from "../types";

export interface AISearchResult {
  text: string;
  sources: { title: string; uri: string }[];
}

const cleanAIResponse = (text: string): string => {
  return text
    .replace(/(\*\*|__)(.*?)\1/g, "<b>$2</b>") // Convertit le gras Markdown en HTML
    .replace(/(\*|_)(.*?)\1/g, "$2")           // Enlève l'italique
    .replace(/#{1,6}\s?/g, "")                 // Enlève les titres Markdown
    .replace(/`{1,3}.*?`{1,3}/g, "")           // Enlève les blocs de code
    // ON A SUPPRIMÉ LA LIGNE QUI TUAIT LES BALISES (replace >)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export const deepMovieSearch = async (query: string): Promise<AISearchResult> => {
  try {
    // Utilisation impérative de process.env.API_KEY pour la plateforme
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: 'user', parts: [{ text: query }] }],
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "Tu es un expert cinéma. Réponds de manière concise. Utilise des balises <b> pour les titres de films. Pas de markdown type astérisques."
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

export const callCineAssistant = async (
  userQuestion: string,
  userProfile: UserProfile,
  conversationHistory: { role: 'user' | 'assistant', content: string }[]
): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    
    const watchedMovies = userProfile.movies.filter(m => m.status === 'watched').slice(0, 10);
    const context = `Utilisateur: ${userProfile.firstName}, Profil: ${userProfile.role}. Films vus: ${watchedMovies.map(m => m.title).join(', ')}.`;

    const systemInstruction = `Tu es le Ciné-Assistant de "The Bitter" (v0.71). 
Ton ton est expert, passionné et un peu piquant. Tutoie l'utilisateur.
TU DOIS :
1. Ne jamais utiliser d'astérisques (*).
2. Utiliser des balises <b> pour les noms de films.
3. Utiliser Google Search pour les infos de streaming ou actus récentes.
4. Répondre en moins de 100 mots.
${context}`;

    // Formatage des messages pour le SDK Gemini (user / model)
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

    if (!response.text) throw new Error("IA_EMPTY_RESPONSE");

    return cleanAIResponse(response.text);
  } catch (error: any) {
    console.error("CRITICAL CineAssistant Error:", error.message);
    return "Ma pellicule a brûlé... (v0.71) Erreur d'initialisation de la clé API ou du modèle. Vérifie la configuration de l'environnement.";
  }
};
