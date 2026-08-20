/**
 * Conversion d'une data URL en Blob, sans passer par le réseau.
 *
 * Le réflexe habituel est `await (await fetch(dataUrl)).blob()`. Il est court, et
 * il est faux ici : un `fetch()` vers une URL `data:` reste une requête, donc il
 * est soumis à la directive `connect-src` de la Content Security Policy. Celle de
 * production (`vercel.json`) énumère les origines légitimes — Supabase, TMDB,
 * PostHog… — sans y faire figurer `data:`. Le navigateur refusait donc la requête,
 * et Safari la remontait sous la forme d'un `TypeError: Load failed` opaque, qui
 * arrivait tel quel dans l'alerte affichée à l'utilisateur.
 *
 * Le défaut ne se voyait pas en développement : `vite.config.ts` sert une CSP
 * permissive (`default-src *`), si bien que le seul environnement où la vraie
 * politique s'applique est celui où personne ne teste avant de déployer.
 *
 * Décoder soi-même supprime la dépendance à la CSP, et évite au passage un aller
 * -retour inutile : pour une story de 1080x1920, la data URL pèse plusieurs
 * mégaoctets que `fetch` recopie intégralement en mémoire.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma === -1) {
    throw new Error("Ce n'est pas une data URL.");
  }

  const header = dataUrl.slice(5, comma);
  const payload = dataUrl.slice(comma + 1);
  const isBase64 = /;base64$/i.test(header);
  const mime = (isBase64 ? header.slice(0, -';base64'.length) : header) || 'application/octet-stream';

  // Une data URL non encodée en base64 est percent-encoded : c'est le cas des SVG
  // écrits en clair. `canvas.toDataURL()` produit toujours du base64, mais cette
  // fonction n'a aucune raison de ne servir que lui.
  const binary = isBase64 ? atob(payload) : decodeURIComponent(payload);

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return new Blob([bytes], { type: mime });
}
