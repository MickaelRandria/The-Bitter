/**
 * Génération d'identifiants locaux.
 *
 * `crypto.randomUUID()` n'est exposé que dans un « contexte sécurisé » : HTTPS,
 * ou `localhost`. Sur une adresse IP en clair — `http://192.168.x.x:5173`, la
 * seule façon d'ouvrir le serveur de développement depuis un vrai téléphone ou
 * une vraie tablette — la fonction est simplement absente, et l'appel lève une
 * `TypeError` au milieu du gestionnaire d'événement. L'écran ne bouge pas et
 * rien n'explique pourquoi : c'est ce qui rendait la création de profil
 * impossible dès qu'on quittait localhost.
 *
 * `crypto.getRandomValues`, lui, n'est pas réservé aux contextes sécurisés. On
 * s'en sert pour fabriquer un UUID v4 conforme, de même qualité aléatoire.
 * Le dernier repli sur `Math.random()` ne sert que les environnements sans
 * Web Crypto du tout ; il n'est pas cryptographiquement sûr, ce qui n'a pas
 * d'importance ici — ces identifiants ne servent qu'à distinguer des lignes
 * dans un stockage local, jamais à authentifier quoi que ce soit.
 */
export const newId = (): string => {
  const webCrypto = globalThis.crypto;

  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }

  const bytes = new Uint8Array(16);

  if (typeof webCrypto?.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }

  // Marqueurs de version (4) et de variante (RFC 4122), attendus par tout ce qui
  // relit ces identifiants comme des UUID.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
