/**
 * Mode démo : un profil pré-rempli, en mémoire, sans aucune écriture distante.
 *
 * Il existe pour une seule raison : montrer The Bitter plein à quelqu'un qui n'a
 * pas encore de compte. Un profil vide ne démontre rien — ni l'ADN, ni le fil
 * d'amis, ni la rentabilité de l'abonnement, qui ont tous besoin de plusieurs
 * dizaines de films pour dire quelque chose.
 *
 * TROIS RÈGLES, tenues par ce module :
 *
 * 1. RIEN N'EST ÉCRIT. Ni dans Supabase (le mode démo n'ouvre aucune session,
 *    donc tous les appels de synchronisation, déjà gardés par `session?.user?.id`,
 *    sont morts d'eux-mêmes), ni dans les clés localStorage des vrais profils.
 *    Une seule clé est posée, `the_bitter_demo_mode`, et elle ne contient qu'un
 *    drapeau. Les films notés pendant la démo vivent en mémoire et disparaissent
 *    au rechargement : c'est voulu, une démo ne doit pas laisser de traces.
 *
 * 2. LE DRAPEAU EST LISIBLE DEPUIS LES SERVICES, de façon synchrone et sans
 *    contexte React. `services/supabase.ts` et `services/screenings.ts` s'en
 *    servent pour rendre des données factices au lieu d'appeler le réseau. C'est
 *    pourquoi il est calculé au chargement du module et non dans un effet : un
 *    service peut être appelé avant le premier rendu.
 *
 * 3. ON N'IMPORTE RIEN D'AUTRE ICI. Ce module est en bas de la pile de
 *    dépendances ; les services l'importent, il n'importe aucun service. Sans
 *    cette discipline, `supabase.ts → demoMode.ts → supabase.ts` formerait un
 *    cycle.
 */

/** Le drapeau, pour qu'un rechargement ou une navigation PWA reste en démo. */
const DEMO_FLAG_KEY = 'the_bitter_demo_mode';

/** `?demo=true` et `?guest=true` ouvrent la démo, au choix de celui qui partage le lien. */
const DEMO_PARAMS = ['demo', 'guest'] as const;

/** `?demo` tout court compte pour un oui : personne n'écrit `=true` de mémoire. */
const TRUTHY = new Set(['', '1', 'true', 'yes', 'oui', 'on']);
const FALSY = new Set(['0', 'false', 'no', 'non', 'off']);

/**
 * Lit la demande portée par l'URL. Rend `null` quand l'URL ne dit rien, pour
 * distinguer « pas d'avis » de « explicitement non » — `?demo=false` est la
 * porte de sortie d'un lien démo qu'on aurait mis en favori.
 */
const readUrlRequest = (): boolean | null => {
  try {
    const params = new URLSearchParams(window.location.search);
    for (const name of DEMO_PARAMS) {
      const raw = params.get(name);
      if (raw === null) continue;
      const value = raw.trim().toLowerCase();
      if (FALSY.has(value)) return false;
      if (TRUTHY.has(value)) return true;
    }
    return null;
  } catch {
    return null;
  }
};

const readStoredFlag = (): boolean => {
  try {
    return window.localStorage.getItem(DEMO_FLAG_KEY) === '1';
  } catch {
    // Navigation privée verrouillée, iframe sans stockage : la démo reste
    // possible, elle ne survivra simplement pas au rechargement.
    return false;
  }
};

const writeStoredFlag = (value: boolean) => {
  try {
    if (value) window.localStorage.setItem(DEMO_FLAG_KEY, '1');
    else window.localStorage.removeItem(DEMO_FLAG_KEY);
  } catch {
    /* voir readStoredFlag */
  }
};

/**
 * Retire `?demo` / `?guest` de la barre d'adresse.
 *
 * Sans ça, quitter la démo puis recharger y ramènerait aussitôt : le paramètre
 * d'URL est plus fort que le drapeau qu'on vient d'effacer.
 */
const stripUrlParams = () => {
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const name of DEMO_PARAMS) {
      if (url.searchParams.has(name)) {
        url.searchParams.delete(name);
        changed = true;
      }
    }
    if (changed) {
      const search = url.searchParams.toString();
      window.history.replaceState(
        null,
        '',
        `${url.pathname}${search ? `?${search}` : ''}${url.hash}`
      );
    }
  } catch {
    /* pas d'historique manipulable : la barre d'adresse restera sale, sans plus */
  }
};

const detect = (): boolean => {
  const requested = readUrlRequest();
  if (requested === true) {
    // Mémorisé tout de suite : la démo doit survivre à un rechargement, et le
    // paramètre disparaît de l'URL dès qu'on en sort.
    writeStoredFlag(true);
    return true;
  }
  if (requested === false) {
    writeStoredFlag(false);
    return false;
  }
  return readStoredFlag();
};

let active = detect();

/** Vrai quand l'application tourne sur le profil de démonstration. */
export const isDemoMode = (): boolean => active;

/** Entre en mode démo depuis un bouton, sans passer par l'URL. */
export const enableDemoMode = () => {
  active = true;
  writeStoredFlag(true);
};

/** Sort du mode démo et efface toute trace de son passage. */
export const disableDemoMode = () => {
  active = false;
  writeStoredFlag(false);
  stripUrlParams();
};

/**
 * Message unique des actions refusées en démo.
 *
 * Refuser sans expliquer donnerait l'impression d'un bug ; c'est exactement
 * l'inverse de ce qu'une démonstration doit produire.
 */
export const DEMO_BLOCKED_MESSAGE = 'Mode démo : rien n’est enregistré ici.';

/**
 * L'assistant passe par une fonction serveur qui exige une vraie session. En
 * démo elle répondrait « connecte-toi », ce qui se lirait comme une panne : on
 * dit plutôt où s'arrête la démonstration.
 */
export const DEMO_AI_MESSAGE =
  'Mode démo : l’assistant IA reste réservé aux comptes créés.';
