
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
  return text.replace(/\*\*/g, '').trim();
};

// Pour la recherche simple existante
export const deepMovieSearch = async (query: string): Promise<AISearchResult> => {
  try {
    // Initialisation JIT pour éviter les ReferenceError au chargement du module
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: query,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "Tu es un expert ciné. Réponds en utilisant des balises HTML <b> et </b> pour mettre en gras les noms de films ou les points clés. NE JAMAIS utiliser d'astérisques (**)."
      },
    });

    const text = cleanAIResponse(response.text || "Désolé, je n'ai pas trouvé d'informations récentes.");
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    
    const sources = chunks
      .filter((chunk: any) => chunk.web)
      .map((chunk: any) => ({
        title: chunk.web.title || "Lien source",
        uri: chunk.web.uri,
      }));

    return { text, sources };
  } catch (error) {
    console.error("Gemini Search Error:", error);
    return { 
      text: "Une erreur est survenue lors de la recherche en ligne. Veuillez réessayer.", 
      sources: [] 
    };
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
- Goûts: Adore ${userProfile.favoriteGenres?.join(', ') || 'tous les genres'}.

HISTORIQUE DE VISIONNAGE (Rappel):
${recentMovies.map(m => `- ${m.title} (${m.year}) - Note: ${((m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4).toFixed(1)}/10`).join('\n')}
`;

  const systemInstruction = `Tu es le Ciné-Assistant de l'application "The Bitter". Tu parles à ${userProfile.firstName}.
Ton ton est celui d'un ami expert, passionné, parfois un peu piquant (bitter) mais toujours pertinent. Tu tutoies l'utilisateur.

DIRECTIVES DE CONVERSATION :
1. ANALYSE L'HISTORIQUE : Regarde les messages précédents pour ne pas te répéter. Si l'utilisateur rebondit sur une suggestion, approfondis au lieu de changer de sujet.
2. NATUREL : Évite les formules robotiques comme "En tant qu'assistant..." ou de répéter son nom à chaque phrase. Sois direct.
3. CONTEXTE : Utilise son profil psychologique (${userProfile.role}) pour nuancer tes recommandations.
4. RECHERCHE : Utilise Google Search pour les nouveautés ou vérifier sur quelles plateformes (Netflix, Prime, Disney+, Canal+) les films sont dispos en France.

FORMATAGE STRICT :
- NE JAMAIS utiliser d'astérisques (**).
- Utilise UNIQUEMENT <b>titre du film</b> pour les noms de films et les termes essentiels.
- Réponse courte (max 120 mots).

${userContext}`;

  try {
    // Initialisation JIT pour assurer la présence de la clé API au moment de l'appel
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        ...conversationHistory.map(h => ({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.content }]
        })),
        { role: 'user', parts: [{ text: userQuestion }] }
      ],
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
        temperature: 0.8,
      },
    });

    const rawText = response.text || "Je n'ai pas pu générer de réponse.";
    return cleanAIResponse(rawText);
  } catch (error) {
    console.error("CineAssistant Error:", error);
    return "Oups, ma pellicule a brûlé. Peux-tu reformuler ?";
  }
};
