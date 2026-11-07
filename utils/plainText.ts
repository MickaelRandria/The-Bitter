/**
 * Du texte brut à partir d'un texte écrit par un modèle : Mistral met parfois
 * des mots en gras façon Markdown (« **sommet visuel** »), et l'app afficherait
 * les astérisques telles quelles.
 *
 * Même règle que `plainText` dans supabase/functions/public-reviews/summary.ts,
 * qui nettoie à la source ; celle-ci rattrape les résumés et traductions déjà
 * gardés sur l'appareil. `stray` retire aussi les astérisques isolées : à
 * garder faux pour une traduction, où « f*ck » doit rester lisible.
 */
export function plainText(text: string, stray = true): string {
  let t = text
    .replace(/\*\*([^*]+?)\*\*/g, '$1')
    .replace(/__([^_]+?)__/g, '$1')
    .replace(/(^|[\s(«"“])\*(?!\s)([^*\n]+?)\*(?=$|[\s).,;:!?»"”])/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*(#{1,6}\s+|[-*•]\s+|\d+[.)]\s+)/, '');
  if (stray) t = t.replace(/\*+/g, '');
  return t.replace(/\s+/g, ' ').trim();
}
