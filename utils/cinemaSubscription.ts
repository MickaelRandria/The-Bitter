import {
  CinemaSubscription,
  CinemaSubscriptionProvider,
  Movie,
  MovieWatch,
  ViewingContext,
} from '../types';
import { newId } from './id';

/**
 * Logique de rentabilité de l'abonnement cinéma.
 *
 * Toutes les fonctions sont pures et déterministes : elles ne lisent ni l'heure
 * courante ni le stockage, et prennent la période en paramètre. Les montants sont
 * calculés en centimes entiers puis reconvertis, pour éviter les 47.599999999999994
 * visibles à l'écran.
 *
 * DÉCISION TARIFAIRE ASSUMÉE (MVP)
 * L'abonnement ne conserve pas d'historique de prix. Si l'utilisateur modifie sa
 * mensualité ou son prix de référence, les nouveaux montants s'appliquent
 * rétroactivement à toute la période, y compris aux mois déjà écoulés. Construire
 * un barème daté serait un vrai système financier, hors périmètre ici. L'interface
 * de configuration le dit explicitement à l'utilisateur.
 */

export interface SubscriptionPreset {
  provider: CinemaSubscriptionProvider;
  nameKey: string;
  monthlyPrice: number;
  referenceTicketPrice: number;
}

/**
 * Valeurs de départ, volontairement modifiables. Ce ne sont pas des tarifs
 * officiels : ils servent à éviter un formulaire vide.
 */
export const SUBSCRIPTION_PRESETS: SubscriptionPreset[] = [
  { provider: 'ugc', nameKey: 'cinemaSub.preset.ugc', monthlyPrice: 24.9, referenceTicketPrice: 14.5 },
  { provider: 'pathe', nameKey: 'cinemaSub.preset.pathe', monthlyPrice: 24.99, referenceTicketPrice: 14.5 },
  { provider: 'custom', nameKey: 'cinemaSub.preset.custom', monthlyPrice: 0, referenceTicketPrice: 12 },
];

/** Une séance rattachée à son film, unité de base de tous les calculs. */
export interface SubscriptionSession {
  movie: Movie;
  watch: MovieWatch;
  watchedAt: Date;
}

export interface PeriodStats {
  /** Nombre de mensualités facturées sur la période. */
  monthsBilled: number;
  sessions: number;
  /** sessions × prix de référence. */
  value: number;
  /** monthsBilled × mensualité. */
  cost: number;
  /** value - cost, négatif tant que l'abonnement n'est pas rentabilisé. */
  netSavings: number;
  isProfitable: boolean;
  /** Séances restantes pour atteindre l'équilibre, 0 si déjà rentable. */
  sessionsToBreakEven: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Les montants transitent en centimes pour que les sommes restent exactes. */
const toCents = (value: number): number => Math.round(value * 100);

export const formatCurrency = (amount: number, language: string): string =>
  new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(round2(amount));

/**
 * Nombre de séances nécessaires pour couvrir une mensualité.
 * Un prix de référence nul ou négatif rendrait le seuil infini : on renvoie 0,
 * ce que l'appelant interprète comme « pas de seuil calculable ».
 */
export const getBreakEvenSessions = (subscription: CinemaSubscription): number => {
  if (subscription.referenceTicketPrice <= 0) return 0;
  return Math.ceil(subscription.monthlyPrice / subscription.referenceTicketPrice);
};

const parseWatchDate = (watch: MovieWatch): Date | null => {
  const date = new Date(watch.watched_at);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Aplatit les films en séances datées.
 *
 * Les films sans tableau `watches` sont ignorés : l'effet de migration d'App.tsx en
 * crée un pour tout film vu, donc ce cas ne concerne que la watchlist.
 */
export const collectSessions = (movies: Movie[]): SubscriptionSession[] => {
  const sessions: SubscriptionSession[] = [];
  movies.forEach((movie) => {
    if (movie.status !== 'watched' || !movie.watches) return;
    movie.watches.forEach((watch) => {
      const watchedAt = parseWatchDate(watch);
      if (watchedAt) sessions.push({ movie, watch, watchedAt });
    });
  });
  return sessions;
};

export const isSubscriptionSession = (
  watch: MovieWatch,
  subscription: CinemaSubscription
): boolean => {
  const context = watch.viewingContext;
  if (!context) return false;
  return (
    context.locationType === 'cinema' &&
    context.paymentType === 'subscription' &&
    context.subscriptionId === subscription.id
  );
};

/** Séances effectivement couvertes par l'abonnement, triées de la plus récente à la plus ancienne. */
export const getSubscriptionSessions = (
  movies: Movie[],
  subscription: CinemaSubscription
): SubscriptionSession[] =>
  collectSessions(movies)
    // Une séance marquée par erreur, ou rattachée avant un changement de date de
    // début, ne doit jamais entrer dans les statistiques de l'abonnement.
    .filter(
      (session) =>
        session.watchedAt.getTime() >= startOfDay(new Date(subscription.startDate)).getTime() &&
        isSubscriptionSession(session.watch, subscription)
    )
    .sort((a, b) => b.watchedAt.getTime() - a.watchedAt.getTime());

/**
 * Séances éligibles au rattrapage historique : vues depuis le début de
 * l'abonnement et pas encore rattachées à un abonnement.
 */
export const getImportableSessions = (
  movies: Movie[],
  subscription: CinemaSubscription
): SubscriptionSession[] => {
  const start = startOfDay(new Date(subscription.startDate));
  return collectSessions(movies)
    .filter(
      (session) =>
        session.watchedAt.getTime() >= start.getTime() &&
        !isSubscriptionSession(session.watch, subscription)
    )
    .sort((a, b) => b.watchedAt.getTime() - a.watchedAt.getTime());
};

/**
 * Historique complet des séances notées, sans présumer de leur contexte.
 * Les séances antérieures à l'abonnement restent éditables mais ne sont jamais
 * comptées dans sa rentabilité.
 */
export const getHistorySessions = (movies: Movie[]): SubscriptionSession[] =>
  collectSessions(movies).sort((a, b) => b.watchedAt.getTime() - a.watchedAt.getTime());

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Contexte appliqué en masse lors du rattrapage historique. */
export const buildSubscriptionContext = (subscription: CinemaSubscription): ViewingContext => ({
  locationType: 'cinema',
  cinemaProvider: subscription.provider,
  paymentType: 'subscription',
  subscriptionId: subscription.id,
});

/**
 * Attache un contexte à la première séance d'un film.
 *
 * App.tsx ne crée les séances qu'au montage suivant, via son effet de migration :
 * sans cette fonction, le contexte saisi à l'ajout serait perdu jusqu'au prochain
 * rechargement. On reproduit donc exactement la séance que la migration aurait
 * créée, contexte inclus. Sans contexte fourni, le film est renvoyé inchangé.
 */
export const withFirstWatchContext = (movie: Movie, context?: ViewingContext): Movie => {
  if (!context || movie.status !== 'watched') return movie;

  if (movie.watches && movie.watches.length > 0) {
    return {
      ...movie,
      watches: movie.watches.map((watch, index) =>
        index === 0 ? { ...watch, viewingContext: context } : watch
      ),
    };
  }

  const avg =
    (movie.ratings.story + movie.ratings.visuals + movie.ratings.acting + movie.ratings.sound) / 4;

  return {
    ...movie,
    watches: [
      {
        id: newId(),
        watch_number: 1,
        watched_at: new Date(movie.dateWatched ?? movie.dateAdded ?? Date.now()).toISOString(),
        ratings: movie.ratings,
        review: movie.review || undefined,
        viewingContext: context,
      },
    ],
    watch_count: 1,
    first_rating: avg,
    current_rating: avg,
    avg_rating: avg,
  };
};

const monthKey = (date: Date): string => `${date.getFullYear()}-${date.getMonth()}`;

/**
 * Nombre de mensualités facturées entre deux bornes incluses.
 *
 * Choix MVP assumé : le mois de démarrage est facturé en entier, sans prorata
 * journalier. Un abonnement démarré le 28 août compte donc une mensualité pour août.
 */
const countBilledMonths = (subscription: CinemaSubscription, from: Date, to: Date): number => {
  const start = new Date(subscription.startDate);
  const first = start.getTime() > from.getTime() ? start : from;
  if (first.getTime() > to.getTime()) return 0;
  const months =
    (to.getFullYear() - first.getFullYear()) * 12 + (to.getMonth() - first.getMonth()) + 1;
  return Math.max(0, months);
};

const buildStats = (
  subscription: CinemaSubscription,
  sessions: number,
  monthsBilled: number
): PeriodStats => {
  const valueCents = sessions * toCents(subscription.referenceTicketPrice);
  const costCents = monthsBilled * toCents(subscription.monthlyPrice);
  const netCents = valueCents - costCents;
  const ticketCents = toCents(subscription.referenceTicketPrice);

  return {
    monthsBilled,
    sessions,
    value: valueCents / 100,
    cost: costCents / 100,
    netSavings: netCents / 100,
    isProfitable: netCents >= 0,
    sessionsToBreakEven:
      netCents >= 0 || ticketCents <= 0 ? 0 : Math.ceil((costCents - valueCents) / ticketCents),
  };
};

/** Statistiques d'un mois civil donné. */
export const getMonthlySubscriptionStats = (
  movies: Movie[],
  subscription: CinemaSubscription,
  year: number,
  month: number
): PeriodStats => {
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 0, 23, 59, 59, 999);
  const key = monthKey(from);
  const sessions = getSubscriptionSessions(movies, subscription).filter(
    (session) => monthKey(session.watchedAt) === key
  ).length;
  return buildStats(subscription, sessions, countBilledMonths(subscription, from, to));
};

export type SubscriptionPeriod = 'currentMonth' | 'previousMonth' | 'year' | 'allTime';

/**
 * Statistiques sur une période. `reference` est la date « maintenant » fournie par
 * l'appelant, pour que la fonction reste pure et testable.
 *
 * L'année et le total cumulent les mois civils : le coût suit le nombre réel de
 * mensualités écoulées, jamais un mois unique.
 */
export const getSubscriptionStats = (
  movies: Movie[],
  subscription: CinemaSubscription,
  period: SubscriptionPeriod,
  reference: Date
): PeriodStats => {
  if (period === 'currentMonth') {
    return getMonthlySubscriptionStats(
      movies,
      subscription,
      reference.getFullYear(),
      reference.getMonth()
    );
  }

  if (period === 'previousMonth') {
    const previous = new Date(reference.getFullYear(), reference.getMonth() - 1, 1);
    return getMonthlySubscriptionStats(
      movies,
      subscription,
      previous.getFullYear(),
      previous.getMonth()
    );
  }

  const start = new Date(subscription.startDate);
  const from =
    period === 'year'
      ? new Date(Math.max(new Date(reference.getFullYear(), 0, 1).getTime(), start.getTime()))
      : start;
  const to = new Date(reference.getFullYear(), reference.getMonth() + 1, 0, 23, 59, 59, 999);

  const sessions = getSubscriptionSessions(movies, subscription).filter(
    (session) =>
      session.watchedAt.getTime() >= startOfDay(from).getTime() &&
      session.watchedAt.getTime() <= to.getTime()
  ).length;

  return buildStats(subscription, sessions, countBilledMonths(subscription, from, to));
};

/** Mois civils couverts par l'abonnement, du plus récent au plus ancien. */
export const getSubscriptionMonths = (
  subscription: CinemaSubscription,
  reference: Date
): { year: number; month: number }[] => {
  const start = new Date(subscription.startDate);
  const months: { year: number; month: number }[] = [];
  const cursor = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const first = new Date(start.getFullYear(), start.getMonth(), 1);

  while (cursor.getTime() >= first.getTime()) {
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
    cursor.setMonth(cursor.getMonth() - 1);
  }
  return months;
};
