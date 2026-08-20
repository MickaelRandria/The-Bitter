/**
 * Partage d'une image générée (story, bilan…) : API native quand elle existe,
 * téléchargement sinon.
 *
 * Sortie explicite plutôt qu'un booléen : l'appelant a besoin de distinguer
 * « partagé », « tombé en téléchargement » et « annulé » pour son message.
 */
import { dataUrlToBlob } from './dataUrl';

export type ShareImageOutcome = 'shared' | 'downloaded' | 'cancelled';

export async function shareImage(
  dataUrl: string,
  fileName: string,
  meta: { title: string; text: string }
): Promise<ShareImageOutcome> {
  // Surtout pas `fetch(dataUrl)` : la CSP de production ne liste pas `data:`
  // dans `connect-src`, la requête y était bloquée. Voir utils/dataUrl.ts.
  const blob = dataUrlToBlob(dataUrl);
  const file = new File([blob], fileName, { type: 'image/png' });

  const download = () => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const canUseShare =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] });

  if (!canUseShare) {
    download();
    return 'downloaded';
  }

  try {
    await navigator.share({ ...meta, files: [file] });
    return 'shared';
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    if (!isAbort) throw err;

    // AbortError couvre deux cas : l'utilisateur a fermé la feuille de partage
    // (mobile — la feuille a volé le focus, document.hasFocus() est false), ou
    // le navigateur n'a pas réussi à l'ouvrir (desktop — la page garde le focus).
    if (document.hasFocus()) {
      download();
      return 'downloaded';
    }
    return 'cancelled';
  }
}
