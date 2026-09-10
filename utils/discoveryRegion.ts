/**
 * Le pays depuis lequel on explore.
 *
 * POURQUOI CE MODULE EXISTE
 * `discover/tv` trié par popularité rend la popularité **mondiale** de TMDB.
 * Relevé le 10 septembre 2026, l'onglet Explorer ouvrait donc sur : une
 * télé-réalité danoise, une norvégienne, un soap hongkongais, une émission de
 * variété coréenne, une sitcom hongroise et le journal télévisé allemand. Rien
 * de tout cela n'est faux — ce sont bien les programmes les plus regardés de la
 * planète — mais aucun ne veut dire quoi que ce soit à quelqu'un qui cherche
 * une série à voir ce soir en France.
 *
 * `watch_region=FR` était déjà posé et ne servait à rien : TMDB ne l'applique
 * qu'en présence d'un filtre de plateforme. Il filtrait donc zéro résultat.
 *
 * CE QUI FILTRE VRAIMENT
 * `with_origin_country` : le pays de production. C'est le seul paramètre qui
 * répond à la question posée — « des séries dont on a entendu parler ici ».
 * Il accepte plusieurs valeurs en `|`, et il ne s'agit pas de ne garder que la
 * production nationale : personne ne regarde que des séries françaises. On garde
 * l'aire dont les œuvres circulent jusqu'ici.
 *
 * ET CE QU'ON NE CACHE PAS
 * Un filtre par pays d'origine écarte forcément des séries que quelqu'un
 * cherche peut-être — les coréennes, justement. « Monde » existe pour ça, dans
 * le même sélecteur : le filtre est un réglage visible, jamais une décision
 * prise dans le dos.
 */

/** Le choix « Monde » : aucun filtre d'origine. Ce n'est pas un code ISO. */
export const WORLD = 'XX';

/**
 * Les pays proposés. La liste est courte à dessein : elle sert à dire « d'où je
 * regarde », pas à énumérer la planète.
 */
export const DISCOVERY_REGIONS = ['FR', 'BE', 'CH', 'CA', 'US', 'GB', 'ES', 'IT', 'DE', 'PT'];

/**
 * L'aire dont les séries circulent en Europe de l'Ouest et en Amérique du Nord.
 *
 * Ce n'est pas un jugement sur ce qui se fait ailleurs : c'est la liste des
 * origines dont un titre a une chance d'être doublé, sous-titré et diffusé ici.
 */
const WESTERN_SPHERE = [
  'US', 'GB', 'FR', 'CA', 'IE', 'AU', 'NZ',
  'DE', 'ES', 'IT', 'BE', 'NL', 'CH', 'AT',
  'DK', 'SE', 'NO', 'FI', 'PT',
];

const STORAGE_KEY = 'bitter-discovery-region';

/**
 * Le pays d'exploration retenu.
 *
 * Au premier lancement, il est déduit de la langue du navigateur — quelqu'un en
 * `fr-BE` explore depuis la Belgique sans avoir à le dire. Faute de région
 * lisible, on retombe sur la France : c'est là que vivent les gens qui utilisent
 * l'application, et un défaut faux se corrige en deux gestes.
 */
export function getDiscoveryRegion(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (stored === WORLD || DISCOVERY_REGIONS.includes(stored))) return stored;
  } catch {
    /* Navigation privée, stockage refusé : le défaut fait très bien l'affaire. */
  }
  const guess = new Intl.Locale(navigator.language || 'fr-FR').maximize().region;
  return guess && DISCOVERY_REGIONS.includes(guess) ? guess : 'FR';
}

export function setDiscoveryRegion(code: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* Le choix ne survivra pas à la session. Il vaut mieux que rien. */
  }
}

/** Le nom du pays dans la langue de l'application. Évite dix clés de traduction. */
export function regionLabel(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Le pays à passer à `watch_region` : « Monde » n'en est pas un. */
export const watchRegionOf = (code: string): string => (code === WORLD ? 'FR' : code);

/**
 * Les origines à garder, ou `null` pour n'en écarter aucune.
 *
 * Le pays choisi est toujours présent, même hors de l'aire : explorer depuis un
 * pays sans y voir sa propre production n'aurait aucun sens.
 */
export function originCountriesOf(code: string): string | null {
  if (code === WORLD) return null;
  const list = WESTERN_SPHERE.includes(code) ? WESTERN_SPHERE : [code, ...WESTERN_SPHERE];
  return list.join('|');
}

/**
 * Les types de programmes qu'on appelle « une série ».
 *
 * `0` documentaire, `2` mini-série, `4` scénarisé. Sont écartés `1` (journaux
 * télévisés), `3` (télé-réalité), `5` (talk-shows) et `6` (vidéo) : ce sont eux
 * qui remontaient en tête, et personne n'ouvre un suivi de séries pour y trouver
 * la Tagesschau.
 */
export const SERIES_TYPES = '0|2|4';
