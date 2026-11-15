import { encodeTicketCode } from '../utils/ticketCode';

/**
 * Lit le QR code d'une capture de billet, sur le téléphone.
 *
 * La capture ne quitte pas l'appareil pour ça : seul le contenu du QR est
 * gardé. Le lecteur (jsQR) n'est chargé qu'au moment d'importer un billet.
 * Deux essais : l'image pleine taille (un QR occupe peu de place sur un écran
 * de téléphone), puis réduite, ce qui aide quand la capture est très grande.
 */
const MAX_SIDE = 2_400;
const RETRY_SIDE = 1_000;

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image'));
    };
    image.src = url;
  });

const pixels = (image: HTMLImageElement, maxSide: number) => {
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return { data: context.getImageData(0, 0, width, height).data, width, height };
};

export const readTicketQr = async (file: File): Promise<string | null> => {
  try {
    const [{ default: jsQR }, image] = await Promise.all([import('jsqr'), loadImage(file)]);
    for (const side of [MAX_SIDE, RETRY_SIDE]) {
      const frame = pixels(image, side);
      if (!frame) return null;
      const found = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'attemptBoth' });
      if (found?.binaryData?.length) return encodeTicketCode(Uint8Array.from(found.binaryData));
    }
    return null;
  } catch (error) {
    console.warn('[Billets] Lecture du QR code impossible', error);
    return null;
  }
};
