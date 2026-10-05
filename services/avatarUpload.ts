/**
 * Photo de profil prise dans la galerie.
 *
 * La photo est recadrée en carré au centre et réduite à 400 px sur l'appareil
 * avant l'envoi : une photo de téléphone pèse plusieurs mégaoctets pour une
 * pastille de quarante pixels, et la réduire ici efface au passage ses données
 * EXIF (position GPS comprise), qu'un `<canvas>` ne recopie pas.
 *
 * Seau `avatars`, dossier de l'auteur : voir `20261005_photos_de_profil.sql`.
 */
import { supabase } from './supabase';

const SIZE = 400;
const BUCKET = 'avatars';

export type UploadError = 'no-account' | 'unreadable' | 'too-big' | 'failed';

/** Décode l'image, la recadre au centre et la rend en JPEG carré. */
async function squareJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('unreadable'));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error('unreadable');
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('unreadable');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      SIZE,
      SIZE
    );
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('unreadable'))), 'image/jpeg', 0.85)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Envoie la photo et rend son adresse publique, à ranger dans `avatar_url`.
 * Les anciennes photos du dossier sont retirées une fois la nouvelle en place.
 */
export async function uploadAvatarPhoto(file: File): Promise<{ url?: string; error?: UploadError }> {
  if (!supabase) return { error: 'no-account' };
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return { error: 'no-account' };
  // Une photo de 40 Mo ne se décode pas sur tous les téléphones sans planter.
  if (file.size > 40 * 1024 * 1024) return { error: 'too-big' };

  let blob: Blob;
  try {
    blob = await squareJpeg(file);
  } catch {
    return { error: 'unreadable' };
  }

  const path = `${userId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) {
    if (import.meta.env.DEV) console.warn('[Avatar] Envoi refusé', error);
    return { error: 'failed' };
  }

  void removeAvatarPhotos(userId, path);
  return { url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
}

/** Retire les photos du dossier, sauf `keep`. Sans `keep`, vide tout le dossier. */
export async function removeAvatarPhotos(userId: string, keep?: string): Promise<void> {
  if (!supabase || !userId) return;
  const { data } = await supabase.storage.from(BUCKET).list(userId, { limit: 100 });
  const stale = (data || []).map((f) => `${userId}/${f.name}`).filter((p) => p !== keep);
  if (stale.length) await supabase.storage.from(BUCKET).remove(stale);
}

/** Une photo de ce seau, par opposition à un avatar dessiné. */
export const isUploadedAvatar = (value?: string | null) =>
  typeof value === 'string' && value.includes(`/storage/v1/object/public/${BUCKET}/`);
