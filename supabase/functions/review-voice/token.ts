/**
 * Un avis = une question du jour, quel que soit le nombre d'appels.
 *
 * L'avis guidé enchaîne jusqu'à cinq appels (trois réponses dictées, la mise en
 * forme, le resserrage). Le premier consomme le quota et reçoit ce jeton ; les
 * suivants le présentent et passent sans être recomptés. Signé avec un secret
 * du serveur et lié à la personne, il ne sert qu'à elle, et pas plus de vingt
 * minutes : de quoi finir un avis, pas de quoi en écrire dix.
 *
 * Sans état, donc sans table ni migration. Module sans dépendance :
 * `crypto.subtle` existe dans Deno comme dans Node, pour les tests.
 */

export const TOKEN_TTL_MS = 20 * 60 * 1000;

const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const fromBase64Url = (text: string) => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};

const hmac = async (secret: string, payload: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(`review-voice:${secret}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return toBase64Url(
    new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)))
  );
};

export async function mintToken(secret: string, user: string, now = Date.now()): Promise<string> {
  const payload = toBase64Url(encoder.encode(JSON.stringify({ u: user, e: now + TOKEN_TTL_MS })));
  return `${payload}.${await hmac(secret, payload)}`;
}

/** Vrai si le jeton a été signé ici, pour cette personne, et n'a pas expiré. */
export async function verifyToken(
  secret: string,
  user: string,
  token: unknown,
  now = Date.now()
): Promise<boolean> {
  if (typeof token !== 'string' || token.length > 400) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = await hmac(secret, payload);
  // Comparaison à durée constante : la signature ne doit pas se deviner octet par octet.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++)
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (diff !== 0) return false;
  try {
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    return claims?.u === user && typeof claims?.e === 'number' && claims.e > now;
  } catch {
    return false;
  }
}
