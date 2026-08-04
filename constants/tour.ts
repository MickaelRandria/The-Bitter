/**
 * Scénario des visites guidées.
 *
 * Principe : le tuto éclaire les vrais boutons de l'app et, dès qu'une étape
 * correspond à un geste réel, il laisse l'utilisateur le faire lui-même. Les
 * étapes `action: 'click'` percent le voile au niveau de la cible et attendent le
 * clic avant de passer à la suite ; les autres se contentent d'expliquer et
 * proposent un bouton Suivant.
 *
 * Quand une fonctionnalité est encore verrouillée (Analytics sous 5 films, Feed
 * sans collection), on l'explique sans inventer de données de démonstration.
 */

export type TourPage = 'Feed' | 'AddMovie' | 'Discover' | 'Calendar' | 'Analytics' | 'Profile';

export interface TourStep {
  id: string;
  /** Page que l'app doit afficher pendant cette étape. */
  page: TourPage;
  /** Valeur de l'attribut `data-tour` à mettre en lumière, ou null pour une carte centrée. */
  target: string | null;
  /** 'click' : la cible reste cliquable et le tuto avance une fois le geste fait. */
  action?: 'click';
  /** Nombre de puces `tour.<id>.b1` … `bN` affichées sous la phrase d'accroche. */
  bullets?: number;
  titleKey: string;
  bodyKey: string;
  /** Consigne des étapes interactives (`tour.<id>.cta`). */
  ctaKey?: string;
}

const step = (
  id: string,
  page: TourPage,
  target: string | null,
  opts: { action?: 'click'; bullets?: number } = {}
): TourStep => ({
  id,
  page,
  target,
  action: opts.action,
  bullets: opts.bullets,
  titleKey: `tour.${id}.title`,
  bodyKey: `tour.${id}.body`,
  ctaKey: opts.action ? `tour.${id}.cta` : undefined,
});

/**
 * Parcours principal, joué à la création d'un profil. L'utilisateur navigue
 * lui-même d'une page à l'autre : chaque changement d'écran est un clic qu'il
 * effectue, pas une transition subie.
 */
export const TOUR_STEPS: TourStep[] = [
  // ── Feed ────────────────────────────────────────────────────────────────────
  step('intro', 'Feed', null),
  step('feed-empty', 'Feed', 'feed-empty', { bullets: 3 }),
  // Volontairement non cliquable : ouvrir l'écran d'ajout ici couperait la visite
  // en deux. Il a son propre parcours, déclenché au premier vrai ajout.
  step('nav-add', 'Feed', 'nav-add'),
  step('nav-discover', 'Feed', 'nav-discover', { action: 'click' }),

  // ── Discover ────────────────────────────────────────────────────────────────
  step('discover-search', 'Discover', 'discover-search'),
  step('discover-period', 'Discover', 'discover-period', { action: 'click' }),
  step('discover-platform', 'Discover', 'discover-platform', { action: 'click' }),
  step('nav-calendar', 'Discover', 'nav-calendar', { action: 'click' }),

  // ── Calendar ────────────────────────────────────────────────────────────────
  step('calendar-toggle', 'Calendar', 'calendar-toggle', { action: 'click' }),
  step('calendar-grid', 'Calendar', 'calendar-nav', { action: 'click' }),
  step('nav-analytics', 'Calendar', 'nav-analytics', { action: 'click' }),

  // ── Analytics ───────────────────────────────────────────────────────────────
  step('analytics-locked', 'Analytics', 'analytics-locked', { bullets: 3 }),
  step('nav-profile', 'Analytics', 'nav-profile', { action: 'click' }),

  // ── Profil ──────────────────────────────────────────────────────────────────
  step('profile-calibration', 'Profile', 'profile-calibration', { bullets: 2 }),
  step('profile-notifications', 'Profile', 'profile-notifications', { action: 'click' }),
  // Pas de clic ici : le bouton déclenche un vrai téléchargement.
  step('profile-export', 'Profile', 'profile-export'),
  step('outro', 'Profile', null),
];

/**
 * Second parcours, déclenché à la première ouverture de l'écran d'ajout plutôt
 * qu'à la création du profil : la notation ne s'explique bien qu'au moment où on
 * s'apprête à noter. L'écran rend toute la grille sans qu'un film soit
 * sélectionné, donc on éclaire les vrais critères avec leurs vrais poids.
 *
 * Les étapes `bitterplus-*` garantissent l'affichage de la grille avancée même si
 * l'utilisateur reste en mode Bitter, via `tourForceBitterPlus` dans AddMovieModal.
 */
export const RATING_TOUR_STEPS: TourStep[] = [
  step('add-status', 'AddMovie', 'add-status', { bullets: 2 }),
  step('add-search', 'AddMovie', 'add-search'),
  step('rating-mode', 'AddMovie', 'add-rating-mode', { action: 'click' }),
  step('bitterplus-profile', 'AddMovie', 'add-profile-header', { bullets: 3 }),
  step('bitterplus-criteria', 'AddMovie', 'add-criteria', { action: 'click', bullets: 4 }),
  step('bitterplus-specific', 'AddMovie', 'add-specific', { bullets: 3 }),
  step('bitterplus-score', 'AddMovie', 'add-final-rating'),
  step('rating-context', 'AddMovie', 'add-distraction', { bullets: 3 }),
];

/** Identifiant de « déjà vu » du parcours notation, stocké dans `seenTooltips`. */
export const RATING_TOUR_SEEN_ID = 'rating_tour';
