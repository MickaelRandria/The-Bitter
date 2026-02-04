
import { GoogleGenAI } from "@google/genai";
import { UserProfile } from "../types";

export interface AISearchResult {
  text: string;
  sources: { title: string; uri: string }[];
}

/**
 * Nettoie le texte des astérisques résiduels et s'assure que le formatage est propre.
 */
const cleanAIResponse = (text: string): string => {
  return text.replace(/\*\*/g, '').replace(/\*/g, '').trim();
};

const getApiKey = () => {
  return process.env.API_KEY || "";
};

// Pour la recherche simple
export const deepMovieSearch = async (query: string): Promise<AISearchResult> => {
  try {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: 'user', parts: [{ text: query }] }],
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "Tu es un expert ciné. Réponds en utilisant des balises HTML <b> et </b> pour mettre en gras. NE JAMAIS utiliser d'astérisques (**)."
      },
    });

    const text = cleanAIResponse(response.text || "Désolé, je n'ai pas trouvé d'informations.");
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    
    const sources = chunks
      .filter((chunk: any) => chunk.web)
      .map((chunk: any) => ({
        title: chunk.web.title || "Source",
        uri: chunk.web.uri,
      }));

    return { text, sources };
  } catch (error) {
    console.error("Gemini Search Error:", error);
    return { text: "Erreur de connexion à l'IA.", sources: [] };
  }
};

// Pour le Ciné-Assistant Contextuel
export const callCineAssistant = async (
  userQuestion: string,
  userProfile: UserProfile,
  conversationHistory: { role: 'user' | 'assistant', content: string }[]
): Promise<string> => {
  const watchedMovies = userProfile.movies.filter(m => m.status === 'watched');
  const recentMovies = watchedMovies.slice(0, 10);
  
  const userContext = `
CONTEXTE UTILISATEUR:
- Nom: ${userProfile.firstName}
- Profil: ${userProfile.role || 'Analyste'}
- Traits: Sévérité ${userProfile.severityIndex || 5}/10, Patience ${userProfile.patienceLevel || 5}/10.
- Goûts: ${userProfile.favoriteGenres?.join(', ') || 'tous les genres'}.

HISTORIQUE RÉCENT:
${recentMovies.map(m => `- ${m.title} (${m.year}) - Note: ${((m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4).toFixed(1)}/10`).join('\n')}
`;

  const systemInstruction = `Tu es le Ciné-Assistant de l'application "The Bitter". Tu parles à ${userProfile.firstName}.
Ton ton est expert, passionné et piquant. Tu tutoies l'utilisateur.

DIRECTIVES :
1. ANALYSE L'HISTORIQUE : Ne te répète pas.
2. NATUREL : Pas de phrases type "En tant qu'IA". Sois direct.
3. RECHERCHE : Utilise Google Search pour les plateformes streaming en France.

FORMATAGE STRICT :
- PAS d'astérisques (**).
- <b>titre</b> pour les films.
- Max 120 mots.

${userContext}`;

  try {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    
    // Formatage correct des messages pour le SDK
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

    return cleanAIResponse(response.text || "Je n'ai pas pu générer de réponse.");
  } catch (error) {
    console.error("CineAssistant Error Details:", error);
    return "Ma pellicule a brûlé... Peux-tu réessayer dans un instant ?";
  }
};
