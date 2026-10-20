/**
 * La barre du bas suit la page.
 *
 * Le bouton central garde sa place et sa couleur, mais son action change avec la
 * page : ajouter un film vu dans l'historique, ranger un film dans la liste « À
 * voir », planifier une séance dans le calendrier, partager sa carte dans les
 * stats, proposer un film dans un espace. Un appui long ouvre toujours le même
 * menu d'ajout, quelle que soit la page.
 *
 * Ce module ne contient que des décisions : il ne lit ni le stockage ni le DOM,
 * pour rester testable sans navigateur (`tests/navActions.test.mjs`).
 */
import type { MovieRating, SharedMovie } from '../services/supabase';

export type NavPage = 'Feed' | 'Analytics' | 'Discover' | 'Calendar' | 'Deck' | 'SharedSpace';
export type MediaMode = 'movie' | 'tv';

/** Ce que fait un appui court sur le bouton central. */
export type PrimaryKind =
  | 'addWatched'
  | 'addWatchlist'
  | 'startSeries'
  | 'plan'
  | 'shareCard'
  | 'propose';

export interface PrimaryContext {
  page: NavPage;
  feedTab: 'history' | 'queue';
  mediaMode: MediaMode;
  /** La page Stats n'a pas de carte à partager sous 5 films vus. */
  statsUnlocked: boolean;
}

export const primaryActionFor = (ctx: PrimaryContext): PrimaryKind => {
  if (ctx.page === 'SharedSpace') return 'propose';
  // Côté séries, ni séance ni carte d'archétype : le + reste « commencer une
  // série », comme avant.
  if (ctx.mediaMode === 'tv') return 'startSeries';
  switch (ctx.page) {
    case 'Calendar':
      return 'plan';
    case 'Analytics':
      return ctx.statsUnlocked ? 'shareCard' : 'addWatched';
    case 'Feed':
      return ctx.feedTab === 'queue' ? 'addWatchlist' : 'addWatched';
    default:
      return 'addWatched';
  }
};

/**
 * Le + de la page Stats partage la carte d'archétype, qui vit dans AnalyticsView
 * (chargée à la demande). App envoie cet évènement pendant le geste de
 * l'utilisateur ; la vue montée l'écoute et lance son partage.
 */
export const STATS_SHARE_EVENT = 'bitter:share-stats-card';

/** Clé de traduction du libellé de l'action, lu à voix haute et affiché en bulle. */
export const primaryLabelKey = (kind: PrimaryKind): string => `nav.primary.${kind}`;

/** Entrées du menu d'ajout ouvert par un appui long. */
export type AddMenuKind = 'watched' | 'watchlist' | 'series' | 'movie' | 'ticket' | 'dictate';

/**
 * Dans la partie Films : film vu, film à voir, puis une série (qui fait passer
 * dans la partie Séries), un billet, une dictée. Dans la partie Séries, l'ordre
 * s'inverse : on commence une série, et le film est le détour.
 *
 * Ce menu reste global depuis un espace. La palette contextuelle propose, elle,
 * un film au groupe ; les ajouts globaux ouvrent la collection personnelle.
 */
export const addMenuFor = (mediaMode: MediaMode, _inSpace: boolean): AddMenuKind[] => {
  // Le menu global reste personnel, y compris depuis un espace.
  return mediaMode === 'tv'
    ? ['series', 'watched', 'watchlist', 'movie', 'ticket', 'dictate']
    : ['watched', 'watchlist', 'series', 'ticket', 'dictate'];
};

/** Le libellé dépend de la partie : « Film vu » chez les films, « Série vue » chez les séries. */
export const addMenuLabelKey = (kind: AddMenuKind, mediaMode: MediaMode): string => {
  if (mediaMode === 'tv' && (kind === 'watched' || kind === 'watchlist' || kind === 'series')) {
    return `nav.add.tv.${kind}`;
  }
  return `nav.add.${kind}`;
};

// ── Découverte de l'appui long ──────────────────────────────────────────────

/** Durée d'un appui long, partagée par le + et les affiches. */
export const LONG_PRESS_MS = 450;
/** Au-delà de ce déplacement, le doigt fait défiler ou glisser : pas d'appui long. */
export const LONG_PRESS_MOVE_TOLERANCE = 10;
/** L'astuce arrive après ce nombre d'appuis courts sur le +, sans appui long. */
export const HOLD_TIP_AFTER_TAPS = 3;
/** La bulle qui nomme la nouvelle action du + s'affiche les premières fois seulement. */
export const PAGE_LABEL_SHOWS = 5;

export interface NavDiscovery {
  /** L'utilisateur a déjà fait un appui long sur le + : plus rien à lui apprendre. */
  learned: boolean;
  /** L'éventail « voilà ce que cache le + » a déjà été montré. */
  fanSeen: boolean;
  /** L'astuce du 3e appui a déjà été montrée. */
  tipSeen: boolean;
  /** Appuis courts sur le + depuis l'installation (s'arrête de compter une fois utile). */
  taps: number;
  /** Nombre de fois où la bulle d'action a été montrée au changement de page. */
  labelShows: number;
}

export const EMPTY_DISCOVERY: NavDiscovery = {
  learned: false,
  fanSeen: false,
  tipSeen: false,
  taps: 0,
  labelShows: 0,
};

/** Relit une valeur stockée sans jamais lever : tout champ abîmé reprend sa valeur neuve. */
export const parseDiscovery = (raw: string | null): NavDiscovery => {
  if (!raw) return { ...EMPTY_DISCOVERY };
  try {
    const value = JSON.parse(raw) as Partial<NavDiscovery> | null;
    if (!value || typeof value !== 'object') return { ...EMPTY_DISCOVERY };
    const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
    return {
      learned: value.learned === true,
      fanSeen: value.fanSeen === true,
      tipSeen: value.tipSeen === true,
      taps: count(value.taps),
      labelShows: count(value.labelShows),
    };
  } catch {
    return { ...EMPTY_DISCOVERY };
  }
};

/** L'éventail se joue une seule fois, au premier changement de page, hors visite guidée. */
export const shouldRunFan = (state: NavDiscovery, blocked: boolean): boolean =>
  !blocked && !state.learned && !state.fanSeen;

/** L'astuce attend le 3e appui court et ne revient jamais. */
export const shouldOfferHoldTip = (state: NavDiscovery): boolean =>
  !state.learned && !state.tipSeen && state.taps >= HOLD_TIP_AFTER_TAPS;

export const shouldShowPageLabel = (state: NavDiscovery): boolean => state.labelShows < PAGE_LABEL_SHOWS;

/** Un appui court de plus. Le compteur s'arrête quand il ne sert plus à rien. */
export const recordTap = (state: NavDiscovery): NavDiscovery =>
  state.learned || state.tipSeen ? state : { ...state, taps: state.taps + 1 };

// ── Sélection d'affiches ────────────────────────────────────────────────────

export type SelectionSource = 'feed' | 'discover' | 'space';

/** Une œuvre sélectionnée par appui long, d'où qu'elle vienne. */
export interface SelectedWork {
  /** Identité stable : `workKey` pour la collection, sinon `tmdb:<type>:<id>` ou `space:<uuid>`. */
  key: string;
  tmdbId?: number;
  mediaType: MediaMode;
  title: string;
  year?: number;
  posterUrl?: string;
  source: SelectionSource;
  /** Dans un espace : la fiche partagée et la note qu'on y a déjà, pour « Noter ». */
  spaceMovie?: SharedMovie;
  spaceRating?: MovieRating | null;
}

/** Clé d'une œuvre vue hors de la collection (Découvrir), sur le modèle de `workKey`. */
export const tmdbWorkKey = (mediaType: MediaMode, tmdbId: number): string => `${mediaType}:${tmdbId}:`;

export const toggleWork = (items: SelectedWork[], work: SelectedWork): SelectedWork[] =>
  items.some((w) => w.key === work.key) ? items.filter((w) => w.key !== work.key) : [...items, work];

export type SelectionAction = 'rate' | 'watchlist' | 'watchWith' | 'share';

export type OwnedStatus = 'watched' | 'watchlist' | null;

/**
 * Ce que la barre propose pour la sélection courante.
 *
 * - Noter et Voir avec ne valent que pour un seul titre : la notation est une
 *   grille par film, et une proposition « voir ensemble » porte sur un film.
 * - À voir n'a de sens que pour un titre absent de la collection.
 * - Voir avec demande un compte et une référence TMDB ; une série absente de la
 *   collection ne peut pas être proposée (`openWatchWith` ne lit que les films).
 */
export const selectionActionsFor = (
  items: SelectedWork[],
  owned: OwnedStatus[],
  signedIn: boolean
): Record<SelectionAction, boolean> => {
  const single = items.length === 1 ? items[0] : null;
  return {
    rate: !!single && (single.tmdbId != null || !!single.spaceMovie),
    watchlist: items.some((w, i) => w.tmdbId != null && !owned[i]),
    watchWith:
      signedIn &&
      !!single &&
      single.tmdbId != null &&
      (single.mediaType === 'movie' || owned[0] != null),
    share: items.length > 0,
  };
};

/** Lignes « Titre (année) » d'un partage de plusieurs titres. */
export const selectionShareLines = (items: SelectedWork[]): string[] =>
  items.map((w) => (w.year ? `${w.title} (${w.year})` : w.title));
