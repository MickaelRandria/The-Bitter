import { SharedSpace } from '../services/supabase';

/** Teintes sombres, lisibles sous un monogramme blanc, attribuées par espace. */
const TINTS = ['#3E5238', '#B45309', '#44403C', '#3D405B', '#7F5539', '#2F3E46'];

/** La teinte d'un espace : la sienne si elle est posée, sinon une teinte stable tirée de son id. */
export const tintOf = (space: Pick<SharedSpace, 'id' | 'color'>): string => {
  if (space.color && /^#[0-9a-f]{6}$/i.test(space.color)) return space.color;
  let hash = 0;
  for (const ch of space.id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return TINTS[Math.abs(hash) % TINTS.length];
};

/** « Ciné pote » → « CP », « Famille » → « FA ». */
export const monogramOf = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? '?').slice(0, 2).toUpperCase();
};
