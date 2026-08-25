import type { AdaptiveRatingData, EmotionalImprint } from '../types';
import {
  CinemaScreening,
  CinemaSubscription,
  FavoriteCinema,
  Movie,
  MovieWatch,
  PacingType,
  ThemeColor,
  UserProfile,
  VibeCriteria,
  ViewingContext,
} from '../types';
import { RatingProfileId } from '../config/ratingProfiles';
import { adaptiveToLegacyRatings, buildAdaptiveRating } from '../utils/rating';
/**
 * Import de TYPE uniquement : `services/supabase.ts` importe ce module pour son
 * fil de démonstration, et un import de valeur formerait un cycle. `import type`
 * est effacé à la compilation, il n'en reste rien à l'exécution.
 */
import type { FriendActivity } from '../services/supabase';
import type { TasteTrait } from '../services/ai';

/**
 * Le profil de démonstration : Alex, 31 films notés, un abonnement UGC rentabilisé,
 * trois amis qui postent, un calendrier vivant.
 *
 * POURQUOI DES DONNÉES CONSTRUITES ET NON UN JSON FIGÉ
 * Toutes les vues qui comptent lisent l'heure courante : `CinemaSubscriptionCard`
 * demande les statistiques du MOIS EN COURS, le calendrier n'affiche que le mois
 * affiché, le fil d'amis écrit « Aujourd'hui » / « Hier ». Un jeu de données daté
 * en dur vieillirait en quelques semaines et la démo montrerait un abonnement non
 * rentabilisé et un calendrier vide. Tout est donc daté relativement à `new Date()`,
 * au moment où la démo s'ouvre.
 *
 * POURQUOI DES AFFICHES DESSINÉES ICI
 * Les affiches sont des SVG générés sur l'appareil, pas des URLs TMDB. Une URL
 * TMDB dépend d'un chemin d'image que rien ne garantit dans le temps, d'une clé
 * d'API et du réseau : une affiche morte devant quelqu'un à qui on montre l'app
 * coûte plus cher que l'absence de la vraie jaquette. Celles-ci s'affichent
 * toujours, hors ligne, dans les deux thèmes. Pour passer aux vraies affiches, il
 * suffit de remplacer `posterUrl` par l'URL TMDB correspondante : rien d'autre
 * dans ce fichier n'en dépend.
 *
 * LES SEUILS QUE CE JEU DE DONNÉES DOIT FRANCHIR (sinon les écrans restent vides)
 * - 5 films vus minimum, sinon AnalyticsView affiche son cadenas ;
 * - 5 films avec `adaptiveRating.imprints`, sinon l'onglet ADN reste verrouillé ;
 * - 8 films avec les 4 critères de base, sinon pas de bloc « verdict » ;
 * - 10 films vus, sinon TastePortrait ne se rend pas du tout ;
 * - 2 mois civils distincts, sinon pas de courbe de tendance ;
 * - 2 décennies distinctes, sinon pas de répartition par décennie ;
 * - un réalisateur vu au moins 2 fois, sinon pas de « réalisateur favori ».
 * Tous sont franchis largement ici. Voir le commentaire de `FILMS`.
 */

export const DEMO_PROFILE_ID = 'demo-profile-alex';
const DEMO_SUBSCRIPTION_ID = 'demo-subscription-ugc';

// ─── Affiches ────────────────────────────────────────────────────────────────

const escapeXml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] as string
  );

/**
 * Découpe un titre en lignes courtes. Le SVG n'a pas de retour à la ligne
 * automatique : sans ça, « Everything Everywhere All at Once » sortirait du cadre.
 */
const wrapTitle = (title: string, maxChars = 14, maxLines = 4): string[] => {
  const lines: string[] = [];
  let current = '';

  for (const word of title.split(/\s+/)) {
    if (!current) current = word;
    else if (`${current} ${word}`.length <= maxChars) current = `${current} ${word}`;
    else {
      lines.push(current);
      current = word;
    }
    if (lines.length === maxLines - 1 && current.length > maxChars) break;
  }
  if (current) lines.push(current);

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]}…`;
    return kept;
  }
  return lines;
};

/**
 * Une affiche typographique, au format 2:3 comme les vraies.
 *
 * L'identifiant du dégradé est suffixé par un index : chaque affiche vit dans son
 * propre document (`<img src="data:…">`), mais le suffixe évite toute collision si
 * l'une d'elles finit un jour inlinée dans la page.
 */
const buildPoster = (
  index: number,
  title: string,
  director: string,
  year: number,
  accent: string
): string => {
  const lines = wrapTitle(title);
  const fontSize = lines.length <= 2 ? 40 : lines.length === 3 ? 33 : 27;
  const lineHeight = Math.round(fontSize * 1.1);
  const firstBaseline = 478 - (lines.length - 1) * lineHeight;
  const gradientId = `bitter-poster-${index}`;

  const titleSpans = lines
    .map(
      (line, i) =>
        `<text x="36" y="${firstBaseline + i * lineHeight}" fill="#ffffff" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="800" letter-spacing="-1">${escapeXml(line)}</text>`
    )
    .join('');

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600" width="400" height="600">',
    `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0.9" y2="1">`,
    `<stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="#0b0b0b"/>`,
    '</linearGradient></defs>',
    '<rect width="400" height="600" fill="#0b0b0b"/>',
    `<rect width="400" height="600" fill="url(#${gradientId})"/>`,
    '<circle cx="330" cy="118" r="168" fill="#ffffff" opacity="0.07"/>',
    '<circle cx="330" cy="118" r="104" fill="#ffffff" opacity="0.05"/>',
    '<text x="36" y="62" fill="#D9FF00" font-family="Inter, Helvetica, Arial, sans-serif" font-size="12" font-weight="800" letter-spacing="5">THE BITTER</text>',
    titleSpans,
    '<rect x="36" y="504" width="46" height="4" fill="#D9FF00"/>',
    `<text x="36" y="540" fill="#ffffff" opacity="0.82" font-family="Inter, Helvetica, Arial, sans-serif" font-size="16" font-weight="700">${escapeXml(director)}</text>`,
    `<text x="36" y="564" fill="#ffffff" opacity="0.5" font-family="Inter, Helvetica, Arial, sans-serif" font-size="14" font-weight="600" letter-spacing="2">${year}</text>`,
    '</svg>',
  ].join('');

  // `(`, `)` et `'` doivent être encodés en plus : MovieCard pose l'affiche dans un
  // `background-image: url(…)`, où ces trois caractères fermeraient la déclaration.
  const encoded = encodeURIComponent(svg)
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/'/g, '%27');

  return `data:image/svg+xml,${encoded}`;
};

// ─── Calendrier des séances ──────────────────────────────────────────────────

const EVENING_HOUR = 20;
const EVENING_MINUTE = 30;

const at = (date: Date, hour = EVENING_HOUR, minute = EVENING_MINUTE): Date => {
  const copy = new Date(date);
  copy.setHours(hour, minute, 0, 0);
  return copy;
};

/**
 * Une date du mois en cours, `daysBack` jours avant aujourd'hui.
 *
 * Le repli sur le 1er du mois n'est pas cosmétique : les quatre séances les plus
 * récentes DOIVENT tomber dans le mois courant, sinon la carte d'abonnement
 * annonce un mois non rentabilisé le 3 du mois. Un débordement les ramène donc au
 * 1er plutôt que dans le mois précédent.
 */
const inCurrentMonth = (now: Date, daysBack: number): Date => {
  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack);
  const sameMonth =
    candidate.getMonth() === now.getMonth() && candidate.getFullYear() === now.getFullYear();
  const evening = at(sameMonth ? candidate : new Date(now.getFullYear(), now.getMonth(), 1));

  /**
   * Une séance du soir alors qu'il est encore midi tomberait dans le futur : la
   * démo ouverte le matin annoncerait un film vu ce soir. On la recule de deux
   * heures, sans jamais sortir de la journée en cours — sinon la séance
   * quitterait le mois affiché les tout premiers jours du mois.
   */
  if (evening.getTime() > now.getTime()) {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return new Date(Math.max(startOfToday, now.getTime() - 2 * 60 * 60 * 1000));
  }
  return evening;
};

/** Un jour précis d'un mois antérieur. Tous les jours utilisés sont ≤ 28. */
const inPastMonth = (now: Date, monthsBack: number, day: number): Date =>
  at(new Date(now.getFullYear(), now.getMonth() - monthsBack, day));

/**
 * Le calendrier des 31 séances, de la plus récente à la plus ancienne.
 *
 * Les quatre premières sont dans le mois courant et couvertes par l'abonnement :
 * c'est ce qui rend la carte de rentabilité verte dès l'ouverture de la démo.
 */
const buildSchedule = (now: Date): Date[] => [
  inCurrentMonth(now, 0),
  inCurrentMonth(now, 2),
  inCurrentMonth(now, 5),
  inCurrentMonth(now, 9),
  inPastMonth(now, 1, 24),
  inPastMonth(now, 1, 19),
  inPastMonth(now, 1, 13),
  inPastMonth(now, 1, 8),
  inPastMonth(now, 1, 3),
  inPastMonth(now, 2, 25),
  inPastMonth(now, 2, 20),
  inPastMonth(now, 2, 14),
  inPastMonth(now, 2, 9),
  inPastMonth(now, 2, 4),
  inPastMonth(now, 3, 23),
  inPastMonth(now, 3, 16),
  inPastMonth(now, 3, 10),
  inPastMonth(now, 3, 5),
  inPastMonth(now, 4, 26),
  inPastMonth(now, 4, 18),
  inPastMonth(now, 4, 11),
  inPastMonth(now, 4, 4),
  inPastMonth(now, 5, 22),
  inPastMonth(now, 5, 14),
  inPastMonth(now, 5, 6),
  inPastMonth(now, 6, 19),
  inPastMonth(now, 6, 8),
  inPastMonth(now, 7, 12),
  inPastMonth(now, 8, 21),
  inPastMonth(now, 8, 9),
  inPastMonth(now, 10, 15),
];

// ─── La collection ───────────────────────────────────────────────────────────

interface FilmSpec {
  title: string;
  director: string;
  actors: string;
  year: number;
  runtime: number;
  /** Un des libellés de `GENRES` : c'est lui qui décide du profil de notation. */
  genre: string;
  tmdbId: number;
  tmdbRating: number;
  profile: RatingProfileId;
  /** Valeurs des critères, dans les clés du profil choisi. */
  values: Record<string, number>;
  /** Ordre significatif : les trois premières sont les empreintes dominantes. */
  imprints: EmotionalImprint[];
  vibe: VibeCriteria;
  smartphone: number;
  hype: number;
  pacing: PacingType;
  review: string;
  theme: ThemeColor;
  accent: string;
  /** Vu au cinéma avec l'abonnement : compte dans la rentabilité. */
  cinema?: boolean;
  /** Revu une seconde fois, N mois avant la séance principale. */
  rewatchedMonthsBefore?: number;
  tags?: string[];
}

/**
 * Trente et un films vus, ordonnés du plus récent au plus ancien : l'index dans
 * ce tableau est l'index dans `buildSchedule`.
 *
 * Les valeurs de critères ne sont pas prises au hasard. `scenario` suit de près la
 * note finale, tandis que `sound` reste stable d'un film à l'autre : c'est ce qui
 * fait ressortir un axe de jugement dominant (« Récit & propos ») dans l'onglet
 * ADN. Avec des valeurs plates, le bloc verdict se replierait sur son message
 * « profil équilibré » et ne montrerait ni barres ni films-preuves.
 */
const FILMS: FilmSpec[] = [
  {
    title: 'Dune : Deuxième partie',
    director: 'Denis Villeneuve',
    actors: 'Timothée Chalamet, Zendaya, Rebecca Ferguson',
    year: 2024,
    runtime: 167,
    genre: 'Science-Fiction',
    tmdbId: 693134,
    tmdbRating: 8.2,
    profile: 'science_fiction',
    values: { scenario: 7.4, image: 9.5, interpretation: 8.0, sound: 9.3, universe: 9.0 },
    imprints: ['wonder', 'fascination', 'tension'],
    vibe: { story: 7, emotion: 6, fun: 5, visual: 10, tension: 7 },
    smartphone: 5,
    hype: 9,
    pacing: 'perfect',
    review:
      'Le son te plaque au fauteuil et le désert avale tout. Le récit, lui, avance en ligne droite : c’est une expérience avant d’être une histoire.',
    theme: 'orange',
    accent: '#8a4a1f',
    cinema: true,
    tags: ['IMAX', 'à revoir'],
  },
  {
    title: 'Anatomie d’une chute',
    director: 'Justine Triet',
    actors: 'Sandra Hüller, Swann Arlaud, Milo Machado-Graner',
    year: 2023,
    runtime: 152,
    genre: 'Drame',
    tmdbId: 915935,
    tmdbRating: 7.6,
    profile: 'drama',
    values: { scenario: 9.5, image: 7.8, interpretation: 9.6, sound: 7.4, emotional_truth: 9.2 },
    imprints: ['reflection', 'tension', 'trouble', 'fascination'],
    vibe: { story: 10, emotion: 8, fun: 1, visual: 4, tension: 7 },
    smartphone: 0,
    hype: 7,
    pacing: 'perfect',
    review:
      'Deux heures et demie à peser des mots, et on ressort sans certitude. Le film refuse de trancher à ta place, c’est exactement sa force.',
    theme: 'black',
    accent: '#2f3d4a',
    cinema: true,
  },
  {
    title: 'Oppenheimer',
    director: 'Christopher Nolan',
    actors: 'Cillian Murphy, Emily Blunt, Robert Downey Jr.',
    year: 2023,
    runtime: 181,
    genre: 'Drame',
    tmdbId: 872585,
    tmdbRating: 8.1,
    profile: 'drama',
    values: { scenario: 8.2, image: 9.0, interpretation: 9.4, sound: 9.5, emotional_truth: 7.8 },
    imprints: ['tension', 'fascination', 'reflection', 'malaise'],
    vibe: { story: 9, emotion: 7, fun: 2, visual: 8, tension: 8 },
    smartphone: 5,
    hype: 9,
    pacing: 'fast',
    review:
      'Trois heures montées comme un thriller. Murphy tient le film à lui seul ; la deuxième moitié perd un peu de son souffle dans les couloirs.',
    theme: 'yellow',
    accent: '#7a5a12',
    cinema: true,
  },
  {
    title: 'Pauvres Créatures',
    director: 'Yorgos Lanthimos',
    actors: 'Emma Stone, Mark Ruffalo, Willem Dafoe',
    year: 2023,
    runtime: 141,
    genre: 'Comédie',
    tmdbId: 792307,
    tmdbRating: 7.8,
    profile: 'comedy',
    values: { scenario: 7.8, image: 9.6, interpretation: 9.4, sound: 8.4, humor: 7.6 },
    imprints: ['fascination', 'jubilation', 'trouble', 'wonder'],
    vibe: { story: 8, emotion: 6, fun: 7, visual: 10, tension: 4 },
    smartphone: 10,
    hype: 7,
    pacing: 'perfect',
    review:
      'Un conte au grand-angle, méchant et somptueux. Emma Stone joue sans filet. Le film s’aime un peu trop dans son dernier tiers.',
    theme: 'purple',
    accent: '#5c2a63',
    cinema: true,
  },
  {
    title: 'La Zone d’intérêt',
    director: 'Jonathan Glazer',
    actors: 'Christian Friedel, Sandra Hüller',
    year: 2023,
    runtime: 105,
    genre: 'Drame',
    tmdbId: 467244,
    tmdbRating: 7.4,
    profile: 'drama',
    values: { scenario: 8.6, image: 8.8, interpretation: 7.6, sound: 9.7, emotional_truth: 8.4 },
    imprints: ['malaise', 'reflection', 'haunting', 'shock'],
    vibe: { story: 10, emotion: 7, fun: 1, visual: 7, tension: 8 },
    smartphone: 0,
    hype: 8,
    pacing: 'slow',
    review:
      'Tout est hors champ, et c’est le son qui raconte l’horreur pendant qu’on tond la pelouse. Je n’ai jamais été aussi mal devant un jardin.',
    theme: 'green',
    accent: '#31462c',
    cinema: true,
  },
  {
    title: 'Perfect Days',
    director: 'Wim Wenders',
    actors: 'Kōji Yakusho, Tokio Emoto, Arisa Nakano',
    year: 2023,
    runtime: 124,
    genre: 'Drame',
    tmdbId: 976893,
    tmdbRating: 7.8,
    profile: 'drama',
    values: { scenario: 8.8, image: 8.6, interpretation: 9.5, sound: 8.0, emotional_truth: 9.4 },
    imprints: ['emotion', 'reflection', 'wonder'],
    vibe: { story: 8, emotion: 9, fun: 3, visual: 7, tension: 1 },
    smartphone: 0,
    hype: 6,
    pacing: 'slow',
    review:
      'Un homme nettoie des toilettes et écoute des cassettes. Rien ne se passe, et pourtant tout est là. Le plan final vaut le film entier.',
    theme: 'green',
    accent: '#2c4a3f',
    cinema: true,
  },
  {
    title: 'Challengers',
    director: 'Luca Guadagnino',
    actors: 'Zendaya, Josh O’Connor, Mike Faist',
    year: 2024,
    runtime: 131,
    genre: 'Drame',
    tmdbId: 937287,
    tmdbRating: 7.2,
    profile: 'drama',
    values: { scenario: 5.4, image: 8.0, interpretation: 8.4, sound: 8.6, emotional_truth: 5.6 },
    imprints: ['jubilation', 'tension', 'fascination', 'disappointment'],
    vibe: { story: 5, emotion: 6, fun: 7, visual: 7, tension: 7 },
    smartphone: 20,
    hype: 8,
    pacing: 'fast',
    review:
      'La musique fait 80 % du boulot et le montage le reste. Sur le fond, un triangle amoureux qui tourne à vide pendant deux heures.',
    theme: 'orange',
    accent: '#9a4520',
    cinema: true,
  },
  {
    title: 'Parasite',
    director: 'Bong Joon-ho',
    actors: 'Song Kang-ho, Lee Sun-kyun, Cho Yeo-jeong',
    year: 2019,
    runtime: 132,
    genre: 'Thriller',
    tmdbId: 496243,
    tmdbRating: 8.5,
    profile: 'thriller',
    values: { scenario: 9.6, image: 8.8, interpretation: 9.2, sound: 8.6, suspense: 9.4 },
    imprints: ['shock', 'tension', 'reflection', 'fascination'],
    vibe: { story: 9, emotion: 7, fun: 6, visual: 8, tension: 9 },
    smartphone: 0,
    hype: 8,
    pacing: 'perfect',
    review:
      'Une mécanique parfaite qui bascule sans prévenir. Le scénario le plus propre que j’aie vu depuis dix ans, sans une scène de trop.',
    theme: 'green',
    accent: '#264a35',
  },
  {
    title: 'Portrait de la jeune fille en feu',
    director: 'Céline Sciamma',
    actors: 'Noémie Merlant, Adèle Haenel, Luàna Bajrami',
    year: 2019,
    runtime: 122,
    genre: 'Romance',
    tmdbId: 501929,
    tmdbRating: 8.1,
    profile: 'romance',
    values: { scenario: 9.0, image: 9.7, interpretation: 9.4, sound: 8.2, chemistry: 9.6 },
    imprints: ['emotion', 'wonder', 'haunting', 'reflection'],
    vibe: { story: 9, emotion: 10, fun: 1, visual: 10, tension: 3 },
    smartphone: 0,
    hype: 7,
    pacing: 'slow',
    review:
      'Chaque plan est un tableau et pourtant rien n’est décoratif. La dernière scène de concert m’a coupé le souffle pendant une minute entière.',
    theme: 'orange',
    accent: '#8a3520',
  },
  {
    title: 'The Substance',
    director: 'Coralie Fargeat',
    actors: 'Demi Moore, Margaret Qualley, Dennis Quaid',
    year: 2024,
    runtime: 141,
    genre: 'Horreur',
    tmdbId: 933260,
    tmdbRating: 7.3,
    profile: 'horror',
    values: { scenario: 4.8, image: 8.4, interpretation: 7.6, sound: 7.0, fear: 6.4 },
    imprints: ['shock', 'malaise', 'fascination', 'trouble'],
    vibe: { story: 7, emotion: 4, fun: 5, visual: 8, tension: 8 },
    smartphone: 15,
    hype: 8,
    pacing: 'slow',
    review:
      'Le message tient en une phrase, répétée pendant deux heures et quart. Reste un dernier acte complètement dingue et Demi Moore, immense.',
    theme: 'purple',
    accent: '#6b1f3a',
    cinema: true,
  },
  {
    title: 'Furiosa',
    director: 'George Miller',
    actors: 'Anya Taylor-Joy, Chris Hemsworth, Tom Burke',
    year: 2024,
    runtime: 148,
    genre: 'Action',
    tmdbId: 786892,
    tmdbRating: 7.6,
    profile: 'action',
    values: { scenario: 4.6, image: 8.8, interpretation: 6.8, sound: 8.6, action: 6.6 },
    imprints: ['fascination', 'tension', 'wonder'],
    vibe: { story: 4, emotion: 5, fun: 7, visual: 9, tension: 8 },
    smartphone: 20,
    hype: 8,
    pacing: 'slow',
    review:
      'Miller filme toujours aussi bien, mais le numérique a mangé la matière de Fury Road. Un préquel qui explique ce qu’on avait compris.',
    theme: 'orange',
    accent: '#a04a15',
    cinema: true,
  },
  {
    title: 'Civil War',
    director: 'Alex Garland',
    actors: 'Kirsten Dunst, Wagner Moura, Cailee Spaeny',
    year: 2024,
    runtime: 109,
    genre: 'Thriller',
    tmdbId: 929590,
    tmdbRating: 7.0,
    profile: 'thriller',
    values: { scenario: 4.0, image: 7.6, interpretation: 6.0, sound: 8.4, suspense: 6.0 },
    imprints: ['malaise', 'tension', 'frustration', 'disappointment'],
    vibe: { story: 7, emotion: 5, fun: 2, visual: 7, tension: 9 },
    smartphone: 25,
    hype: 8,
    pacing: 'perfect',
    review:
      'Deux ou trois séquences tétanisantes, et un film qui refuse obstinément de dire quoi que ce soit. Le sujet méritait un point de vue.',
    theme: 'blue',
    accent: '#2b3a55',
    cinema: true,
  },
  {
    title: 'Whiplash',
    director: 'Damien Chazelle',
    actors: 'Miles Teller, J.K. Simmons, Melissa Benoist',
    year: 2014,
    runtime: 107,
    genre: 'Drame',
    tmdbId: 244786,
    tmdbRating: 8.4,
    profile: 'drama',
    values: { scenario: 9.2, image: 8.4, interpretation: 9.8, sound: 9.6, emotional_truth: 9.0 },
    imprints: ['tension', 'fascination', 'jubilation', 'shock'],
    vibe: { story: 8, emotion: 9, fun: 3, visual: 7, tension: 10 },
    smartphone: 0,
    hype: 7,
    pacing: 'fast',
    review:
      'Monté comme un solo de batterie. Simmons est terrifiant, les neuf dernières minutes sont un sommet absolu de tension.',
    theme: 'yellow',
    accent: '#8a6a12',
  },
  {
    title: 'Get Out',
    director: 'Jordan Peele',
    actors: 'Daniel Kaluuya, Allison Williams, Bradley Whitford',
    year: 2017,
    runtime: 104,
    genre: 'Horreur',
    tmdbId: 419430,
    tmdbRating: 7.6,
    profile: 'horror',
    values: { scenario: 8.8, image: 7.6, interpretation: 8.6, sound: 8.2, fear: 8.0 },
    imprints: ['malaise', 'tension', 'shock', 'reflection'],
    vibe: { story: 9, emotion: 5, fun: 4, visual: 6, tension: 9 },
    smartphone: 5,
    hype: 6,
    pacing: 'perfect',
    review:
      'Le malaise s’installe dès la première scène et ne repart jamais. Un film d’horreur qui tient debout sans jump scare.',
    theme: 'blue',
    accent: '#1f3a4a',
  },
  {
    title: 'Past Lives',
    director: 'Celine Song',
    actors: 'Greta Lee, Teo Yoo, John Magaro',
    year: 2023,
    runtime: 105,
    genre: 'Romance',
    tmdbId: 666277,
    tmdbRating: 7.7,
    profile: 'romance',
    values: { scenario: 8.6, image: 8.4, interpretation: 9.0, sound: 7.8, chemistry: 9.2 },
    imprints: ['emotion', 'haunting', 'reflection'],
    vibe: { story: 8, emotion: 10, fun: 2, visual: 7, tension: 2 },
    smartphone: 0,
    hype: 6,
    pacing: 'slow',
    review:
      'Un film sur les vies qu’on ne vit pas. Les vingt dernières minutes tiennent en trois regards et ça suffit largement.',
    theme: 'blue',
    accent: '#28405e',
    cinema: true,
  },
  {
    title: 'Conclave',
    director: 'Edward Berger',
    actors: 'Ralph Fiennes, Stanley Tucci, Isabella Rossellini',
    year: 2024,
    runtime: 120,
    genre: 'Thriller',
    tmdbId: 974576,
    tmdbRating: 7.2,
    profile: 'thriller',
    values: { scenario: 7.8, image: 8.2, interpretation: 9.0, sound: 7.6, suspense: 8.2 },
    imprints: ['fascination', 'tension', 'reflection'],
    vibe: { story: 8, emotion: 5, fun: 3, visual: 8, tension: 7 },
    smartphone: 10,
    hype: 6,
    pacing: 'perfect',
    review:
      'Un huis clos de couloirs et de regards. Fiennes est parfait ; le twist final est de trop, mais on marche quand même.',
    theme: 'purple',
    accent: '#4a2a4a',
    cinema: true,
  },
  {
    title: 'Premier Contact',
    director: 'Denis Villeneuve',
    actors: 'Amy Adams, Jeremy Renner, Forest Whitaker',
    year: 2016,
    runtime: 116,
    genre: 'Science-Fiction',
    tmdbId: 329865,
    tmdbRating: 7.6,
    profile: 'science_fiction',
    values: { scenario: 9.3, image: 9.0, interpretation: 8.8, sound: 9.2, universe: 9.0 },
    imprints: ['emotion', 'wonder', 'reflection', 'fascination'],
    vibe: { story: 10, emotion: 9, fun: 2, visual: 8, tension: 5 },
    smartphone: 0,
    hype: 6,
    pacing: 'slow',
    review:
      'De la science-fiction qui parle de deuil et de langage plutôt que de vaisseaux. La révélation reconfigure tout le film d’un coup.',
    theme: 'blue',
    accent: '#26404f',
  },
  {
    title: 'Le Voyage de Chihiro',
    director: 'Hayao Miyazaki',
    actors: 'Rumi Hiiragi, Miyu Irino, Mari Natsuki',
    year: 2001,
    runtime: 125,
    genre: 'Animation',
    tmdbId: 129,
    tmdbRating: 8.5,
    profile: 'animation',
    values: { scenario: 9.4, image: 9.6, interpretation: 8.6, sound: 9.4, animation: 9.8 },
    imprints: ['wonder', 'emotion', 'fascination', 'jubilation'],
    vibe: { story: 8, emotion: 9, fun: 7, visual: 10, tension: 4 },
    smartphone: 5,
    hype: 8,
    pacing: 'perfect',
    review:
      'Revu vingt ans après et il n’a pas pris une ride. Le train sur l’eau reste l’une des plus belles séquences jamais animées.',
    theme: 'green',
    accent: '#215446',
    rewatchedMonthsBefore: 14,
    tags: ['Ghibli'],
  },
  {
    title: 'Flow',
    director: 'Gints Zilbalodis',
    actors: 'Sans dialogue',
    year: 2024,
    runtime: 85,
    genre: 'Animation',
    tmdbId: 1140535,
    tmdbRating: 8.2,
    profile: 'animation',
    values: { scenario: 7.2, image: 9.2, interpretation: 6.0, sound: 9.4, animation: 9.6 },
    imprints: ['wonder', 'emotion', 'fascination'],
    vibe: { story: 6, emotion: 9, fun: 4, visual: 10, tension: 4 },
    smartphone: 0,
    hype: 5,
    pacing: 'perfect',
    review:
      'Pas une ligne de dialogue et on comprend tout. Le son fait le récit. Quatre-vingt-cinq minutes, pas une de trop.',
    theme: 'blue',
    accent: '#1f4a5c',
    cinema: true,
  },
  {
    title: 'Anora',
    director: 'Sean Baker',
    actors: 'Mikey Madison, Mark Eydelshteyn, Yura Borisov',
    year: 2024,
    runtime: 139,
    genre: 'Comédie',
    tmdbId: 1064213,
    tmdbRating: 7.1,
    profile: 'comedy',
    values: { scenario: 7.0, image: 7.6, interpretation: 9.2, sound: 7.0, humor: 7.8 },
    imprints: ['jubilation', 'emotion', 'trouble', 'frustration'],
    vibe: { story: 6, emotion: 7, fun: 7, visual: 6, tension: 5 },
    smartphone: 25,
    hype: 6,
    pacing: 'slow',
    review:
      'Mikey Madison porte le film sur ses épaules. Le deuxième acte s’étire, mais le tout dernier plan justifie l’attente.',
    theme: 'purple',
    accent: '#6a2450',
    cinema: true,
  },
  {
    title: 'Mad Max: Fury Road',
    director: 'George Miller',
    actors: 'Tom Hardy, Charlize Theron, Nicholas Hoult',
    year: 2015,
    runtime: 120,
    genre: 'Action',
    tmdbId: 76341,
    tmdbRating: 7.6,
    profile: 'action',
    values: { scenario: 6.4, image: 9.5, interpretation: 7.6, sound: 9.4, action: 9.8 },
    imprints: ['jubilation', 'fascination', 'tension', 'wonder'],
    vibe: { story: 3, emotion: 4, fun: 9, visual: 10, tension: 9 },
    smartphone: 10,
    hype: 7,
    pacing: 'fast',
    review:
      'Deux heures de poursuite et pas une seconde d’ennui. La lisibilité de chaque plan d’action force le respect.',
    theme: 'orange',
    accent: '#a83c14',
  },
  {
    title: 'Blade Runner 2049',
    director: 'Denis Villeneuve',
    actors: 'Ryan Gosling, Harrison Ford, Ana de Armas',
    year: 2017,
    runtime: 164,
    genre: 'Science-Fiction',
    tmdbId: 335984,
    tmdbRating: 7.6,
    profile: 'science_fiction',
    values: { scenario: 8.4, image: 9.9, interpretation: 8.6, sound: 9.6, universe: 9.5 },
    imprints: ['wonder', 'haunting', 'reflection', 'fascination'],
    vibe: { story: 9, emotion: 7, fun: 2, visual: 10, tension: 5 },
    smartphone: 15,
    hype: 8,
    pacing: 'slow',
    review:
      'Deakins signe le plus beau film de science-fiction de la décennie. Lent, oui, et c’est précisément le sujet.',
    theme: 'orange',
    accent: '#8a4a10',
  },
  {
    title: 'Interstellar',
    director: 'Christopher Nolan',
    actors: 'Matthew McConaughey, Anne Hathaway, Jessica Chastain',
    year: 2014,
    runtime: 169,
    genre: 'Science-Fiction',
    tmdbId: 157336,
    tmdbRating: 8.4,
    profile: 'science_fiction',
    values: { scenario: 8.9, image: 9.4, interpretation: 8.4, sound: 9.8, universe: 9.2 },
    imprints: ['emotion', 'wonder', 'tension', 'reflection'],
    vibe: { story: 9, emotion: 10, fun: 4, visual: 10, tension: 8 },
    smartphone: 5,
    hype: 8,
    pacing: 'perfect',
    review:
      'La scène des vidéos après Miller me démolit à chaque fois. L’orgue de Zimmer transforme le troisième acte en expérience physique.',
    theme: 'black',
    accent: '#1e3350',
    rewatchedMonthsBefore: 11,
    tags: ['à revoir'],
  },
  {
    title: 'The Grand Budapest Hotel',
    director: 'Wes Anderson',
    actors: 'Ralph Fiennes, Tony Revolori, Saoirse Ronan',
    year: 2014,
    runtime: 99,
    genre: 'Comédie',
    tmdbId: 120467,
    tmdbRating: 8.0,
    profile: 'comedy',
    values: { scenario: 7.6, image: 9.4, interpretation: 8.8, sound: 8.2, humor: 8.4 },
    imprints: ['jubilation', 'wonder', 'emotion'],
    vibe: { story: 5, emotion: 6, fun: 9, visual: 10, tension: 3 },
    smartphone: 20,
    hype: 7,
    pacing: 'fast',
    review:
      'Une boîte à malices rose bonbon avec une vraie mélancolie au fond. Fiennes n’a jamais été aussi drôle.',
    theme: 'purple',
    accent: '#8a3a5a',
  },
  {
    title: 'Spider-Man: New Generation',
    director: 'Peter Ramsey',
    actors: 'Shameik Moore, Jake Johnson, Hailee Steinfeld',
    year: 2018,
    runtime: 117,
    genre: 'Animation',
    tmdbId: 324857,
    tmdbRating: 8.4,
    profile: 'animation',
    values: { scenario: 7.8, image: 9.8, interpretation: 7.8, sound: 9.0, animation: 9.9 },
    imprints: ['jubilation', 'wonder', 'fascination', 'emotion'],
    vibe: { story: 5, emotion: 7, fun: 9, visual: 10, tension: 5 },
    smartphone: 15,
    hype: 6,
    pacing: 'fast',
    review:
      'Chaque plan pourrait être une planche encadrée. L’animation la plus inventive depuis très longtemps, et un vrai cœur dessous.',
    theme: 'purple',
    accent: '#5a2470',
  },
  {
    title: 'Hérédité',
    director: 'Ari Aster',
    actors: 'Toni Collette, Alex Wolff, Milly Shapiro',
    year: 2018,
    runtime: 127,
    genre: 'Horreur',
    tmdbId: 493922,
    tmdbRating: 7.3,
    profile: 'horror',
    values: { scenario: 7.8, image: 8.2, interpretation: 9.4, sound: 8.8, fear: 9.2 },
    imprints: ['shock', 'malaise', 'haunting', 'trouble'],
    vibe: { story: 8, emotion: 6, fun: 2, visual: 7, tension: 10 },
    smartphone: 5,
    hype: 7,
    pacing: 'slow',
    review:
      'Toni Collette devrait avoir tout raflé. Le film n’essaie pas de te faire sursauter, il t’installe dans le malaise et t’y laisse.',
    theme: 'black',
    accent: '#3a1f28',
  },
  {
    title: 'Pulp Fiction',
    director: 'Quentin Tarantino',
    actors: 'John Travolta, Samuel L. Jackson, Uma Thurman',
    year: 1994,
    runtime: 154,
    genre: 'Thriller',
    tmdbId: 680,
    tmdbRating: 8.5,
    profile: 'thriller',
    values: { scenario: 9.4, image: 8.6, interpretation: 9.3, sound: 9.0, suspense: 8.6 },
    imprints: ['jubilation', 'fascination', 'shock'],
    vibe: { story: 7, emotion: 4, fun: 9, visual: 7, tension: 6 },
    smartphone: 10,
    hype: 8,
    pacing: 'perfect',
    review:
      'Les dialogues n’ont pas vieilli d’un jour. La structure en boucle reste un cas d’école, et Jackson récite Ézéchiel comme personne.',
    theme: 'yellow',
    accent: '#7a5a1a',
    rewatchedMonthsBefore: 16,
  },
  {
    title: 'Free Solo',
    director: 'Elizabeth Chai Vasarhelyi',
    actors: 'Alex Honnold, Tommy Caldwell',
    year: 2018,
    runtime: 100,
    genre: 'Documentaire',
    tmdbId: 515001,
    tmdbRating: 7.8,
    profile: 'documentary',
    values: { scenario: 7.4, image: 9.0, interpretation: 6.8, sound: 7.6, impact: 8.6 },
    imprints: ['tension', 'fascination', 'wonder'],
    vibe: { story: 5, emotion: 7, fun: 5, visual: 9, tension: 10 },
    smartphone: 20,
    hype: 5,
    pacing: 'perfect',
    review:
      'J’ai regardé la dernière demi-heure debout. Le documentaire pose la bonne question : ce n’est pas comment, c’est pourquoi.',
    theme: 'orange',
    accent: '#8a5a20',
  },
  {
    title: 'Le Fabuleux Destin d’Amélie Poulain',
    director: 'Jean-Pierre Jeunet',
    actors: 'Audrey Tautou, Mathieu Kassovitz, Rufus',
    year: 2001,
    runtime: 122,
    genre: 'Comédie',
    tmdbId: 194,
    tmdbRating: 7.9,
    profile: 'comedy',
    values: { scenario: 7.2, image: 9.2, interpretation: 8.6, sound: 9.0, humor: 7.4 },
    imprints: ['jubilation', 'emotion', 'wonder'],
    vibe: { story: 5, emotion: 8, fun: 8, visual: 9, tension: 2 },
    smartphone: 30,
    hype: 6,
    pacing: 'perfect',
    review:
      'La musique de Tiersen fait la moitié du charme. Le Paris de carte postale a mal vieilli, la générosité du film beaucoup moins.',
    theme: 'green',
    accent: '#2f5a2a',
  },
  {
    title: 'Matrix',
    director: 'Lana Wachowski',
    actors: 'Keanu Reeves, Laurence Fishburne, Carrie-Anne Moss',
    year: 1999,
    runtime: 136,
    genre: 'Science-Fiction',
    tmdbId: 603,
    tmdbRating: 8.2,
    profile: 'science_fiction',
    values: { scenario: 8.2, image: 8.8, interpretation: 7.4, sound: 8.6, universe: 9.4 },
    imprints: ['fascination', 'wonder', 'jubilation', 'reflection'],
    vibe: { story: 9, emotion: 5, fun: 8, visual: 9, tension: 8 },
    smartphone: 10,
    hype: 7,
    pacing: 'perfect',
    review:
      'Vingt-cinq ans après, la proposition tient toujours. Reeves joue faux et ça marche quand même, c’est ça le mystère.',
    theme: 'green',
    accent: '#1f4a2f',
  },
  {
    title: 'Everything Everywhere All at Once',
    director: 'Daniel Kwan',
    actors: 'Michelle Yeoh, Ke Huy Quan, Stephanie Hsu',
    year: 2022,
    runtime: 139,
    genre: 'Aventure',
    tmdbId: 545611,
    tmdbRating: 7.8,
    profile: 'adventure',
    values: { scenario: 7.4, image: 8.6, interpretation: 9.2, sound: 7.8, adventure: 8.8 },
    imprints: ['emotion', 'jubilation', 'fascination', 'wonder'],
    vibe: { story: 8, emotion: 9, fun: 9, visual: 9, tension: 6 },
    smartphone: 20,
    hype: 7,
    pacing: 'fast',
    review:
      'Épuisant pendant une heure, bouleversant ensuite. Ke Huy Quan et la scène des cailloux valent tout le bazar multivers.',
    theme: 'yellow',
    accent: '#7a4a55',
  },
];

// ─── Watchlist ───────────────────────────────────────────────────────────────

interface QueueSpec {
  title: string;
  director: string;
  actors: string;
  year: number;
  runtime: number;
  genre: string;
  tmdbId: number;
  tmdbRating: number;
  theme: ThemeColor;
  accent: string;
  /** Ajouté il y a N jours : classe la watchlist du plus récent au plus ancien. */
  addedDaysAgo: number;
}

const QUEUE: QueueSpec[] = [
  {
    title: 'Le Garçon et le Héron',
    director: 'Hayao Miyazaki',
    actors: 'Soma Santoki, Masaki Suda, Kō Shibasaki',
    year: 2023,
    runtime: 124,
    genre: 'Animation',
    tmdbId: 508883,
    tmdbRating: 7.5,
    theme: 'blue',
    accent: '#26506a',
    addedDaysAgo: 3,
  },
  {
    title: 'Tár',
    director: 'Todd Field',
    actors: 'Cate Blanchett, Nina Hoss, Noémie Merlant',
    year: 2022,
    runtime: 158,
    genre: 'Drame',
    tmdbId: 817758,
    tmdbRating: 6.9,
    theme: 'black',
    accent: '#3a3a44',
    addedDaysAgo: 6,
  },
  {
    title: 'Aftersun',
    director: 'Charlotte Wells',
    actors: 'Paul Mescal, Frankie Corio',
    year: 2022,
    runtime: 102,
    genre: 'Drame',
    tmdbId: 800158,
    tmdbRating: 7.4,
    theme: 'orange',
    accent: '#8a5a3a',
    addedDaysAgo: 11,
  },
  {
    title: 'Les Banshees d’Inisherin',
    director: 'Martin McDonagh',
    actors: 'Colin Farrell, Brendan Gleeson, Kerry Condon',
    year: 2022,
    runtime: 114,
    genre: 'Comédie',
    tmdbId: 674324,
    tmdbRating: 7.4,
    theme: 'green',
    accent: '#3a5a3a',
    addedDaysAgo: 18,
  },
  {
    title: 'Killers of the Flower Moon',
    director: 'Martin Scorsese',
    actors: 'Leonardo DiCaprio, Robert De Niro, Lily Gladstone',
    year: 2023,
    runtime: 206,
    genre: 'Drame',
    tmdbId: 466420,
    tmdbRating: 7.4,
    theme: 'orange',
    accent: '#7a3020',
    addedDaysAgo: 26,
  },
  {
    title: 'Nope',
    director: 'Jordan Peele',
    actors: 'Daniel Kaluuya, Keke Palmer, Steven Yeun',
    year: 2022,
    runtime: 130,
    genre: 'Horreur',
    tmdbId: 762504,
    tmdbRating: 6.8,
    theme: 'blue',
    accent: '#2a3a5a',
    addedDaysAgo: 34,
  },
];

// ─── Construction ────────────────────────────────────────────────────────────

const subscriptionContext = (): ViewingContext => ({
  locationType: 'cinema',
  cinemaProvider: 'ugc',
  paymentType: 'subscription',
  subscriptionId: DEMO_SUBSCRIPTION_ID,
});

const homeContext = (): ViewingContext => ({ locationType: 'home' });

const buildMovie = (spec: FilmSpec, index: number, watchedAt: Date): Movie => {
  const criteriaValues = spec.values;
  const unweighted =
    Object.values(criteriaValues).reduce((sum, value) => sum + value, 0) /
    Object.values(criteriaValues).length;
  const legacyRating = Math.round(unweighted * 10) / 10;

  const adaptiveRating: AdaptiveRatingData = {
    ...buildAdaptiveRating(spec.profile, criteriaValues, legacyRating),
    imprints: spec.imprints,
  };

  /**
   * `ratings` reçoit les VRAIES valeurs des quatre critères de base, pas la note
   * pondérée recopiée quatre fois. Les analytics lisent `ratings` pour dire quel
   * critère on juge le plus durement : avec quatre valeurs identiques, la carte
   * « Ton œil » désignerait le même critère comme le plus sévère ET le plus
   * généreux. `adaptiveToLegacyRatings` fait exactement la correspondance attendue.
   */
  const ratings = adaptiveToLegacyRatings(adaptiveRating);

  const watches: MovieWatch[] = [
    {
      id: `demo-watch-${index}-1`,
      watch_number: 1,
      watched_at: watchedAt.toISOString(),
      ratings,
      review: spec.review,
      adaptiveRating,
      viewingContext: spec.cinema ? subscriptionContext() : homeContext(),
    },
  ];

  if (spec.rewatchedMonthsBefore) {
    const earlier = new Date(watchedAt);
    earlier.setMonth(earlier.getMonth() - spec.rewatchedMonthsBefore);
    // La première vision passe devant : `watch_number` 1 est la plus ancienne.
    watches.unshift({
      id: `demo-watch-${index}-0`,
      watch_number: 1,
      watched_at: earlier.toISOString(),
      ratings,
      review: undefined,
      sentiment: 'nostalgic',
      // Jamais rattachée à l'abonnement : elle est antérieure à sa souscription.
      viewingContext: homeContext(),
    });
    watches[1].watch_number = 2;
    watches[1].sentiment = 'better';
  }

  const average = Math.round(legacyRating * 10) / 10;

  return {
    id: `demo-movie-${index}`,
    tmdbId: spec.tmdbId,
    title: spec.title,
    director: spec.director,
    actors: spec.actors,
    year: spec.year,
    releaseDate: `${spec.year}-01-01`,
    runtime: spec.runtime,
    genre: spec.genre,
    ratings,
    review: spec.review,
    dateAdded: watchedAt.getTime(),
    dateWatched: watchedAt.getTime(),
    theme: spec.theme,
    posterUrl: buildPoster(index, spec.title, spec.director, spec.year, spec.accent),
    status: 'watched',
    tmdbRating: spec.tmdbRating,
    rewatch: !!spec.rewatchedMonthsBefore,
    tags: spec.tags,
    smartphoneFactor: spec.smartphone,
    vibe: spec.vibe,
    qualityMetrics: {
      scenario: criteriaValues.scenario,
      acting: criteriaValues.interpretation,
      visual: criteriaValues.image,
      sound: criteriaValues.sound,
    },
    hype: spec.hype,
    pacing: spec.pacing,
    mediaType: 'movie',
    watch_count: watches.length,
    watches,
    first_rating: average,
    current_rating: average,
    avg_rating: average,
    preferred_display_mode: 'latest',
    adaptiveRating,
    shareToFeed: true,
  };
};

const buildQueueMovie = (spec: QueueSpec, index: number, now: Date): Movie => {
  const addedAt = new Date(now.getTime() - spec.addedDaysAgo * 24 * 60 * 60 * 1000);
  return {
    id: `demo-queue-${index}`,
    tmdbId: spec.tmdbId,
    title: spec.title,
    director: spec.director,
    actors: spec.actors,
    year: spec.year,
    releaseDate: `${spec.year}-01-01`,
    runtime: spec.runtime,
    genre: spec.genre,
    // Un film en attente n'est pas noté : zéro dit « pas encore jugé », et aucune
    // statistique ne le lit puisqu'elles filtrent toutes sur `status: 'watched'`.
    ratings: { story: 0, visuals: 0, acting: 0, sound: 0 },
    review: '',
    dateAdded: addedAt.getTime(),
    theme: spec.theme,
    posterUrl: buildPoster(100 + index, spec.title, spec.director, spec.year, spec.accent),
    status: 'watchlist',
    tmdbRating: spec.tmdbRating,
    mediaType: 'movie',
  };
};

const buildSubscription = (now: Date): CinemaSubscription => {
  // Quatre mois en arrière : assez pour que le détail propose plusieurs mois, et
  // antérieur à la plus ancienne séance rattachée (mois -4, jour 26).
  // Midi et non minuit : `toISOString()` décale d'un fuseau, et minuit local
  // repartirait sur le dernier jour du mois précédent une fois converti en UTC.
  const start = new Date(now.getFullYear(), now.getMonth() - 4, 1, 12, 0, 0, 0);
  return {
    id: DEMO_SUBSCRIPTION_ID,
    provider: 'ugc',
    name: 'UGC Illimité',
    monthlyPrice: 24.9,
    referenceTicketPrice: 14.5,
    startDate: start.toISOString(),
    active: true,
    createdAt: start.toISOString(),
  };
};

const DEMO_CINEMA: FavoriteCinema = {
  id: 'ugc-cine-cite-les-halles',
  name: 'UGC Ciné Cité Les Halles',
  city: 'Paris',
};

/** Le profil complet. Reconstruit à chaque appel pour rester daté d'aujourd'hui. */
export const buildDemoProfile = (now: Date = new Date()): UserProfile => {
  const schedule = buildSchedule(now);
  const watched = FILMS.map((spec, index) => buildMovie(spec, index, schedule[index]));
  const queue = QUEUE.map((spec, index) => buildQueueMovie(spec, index, now));

  return {
    id: DEMO_PROFILE_ID,
    firstName: 'Alex',
    lastName: 'Moreau',
    age: 29,
    viewingPreference: 'both',
    streamingPlatforms: ['netflix', 'prime', 'canal'],
    movies: [...watched, ...queue],
    createdAt: new Date(now.getFullYear(), now.getMonth() - 10, 1).getTime(),
    // Déjà passé par la calibration : la démo n'a pas à rouvrir l'onboarding.
    isOnboarded: true,
    // Sévère et contemplatif : ce couple, croisé aux ambiances des films, décide
    // de l'archétype affiché en tête des analytics.
    severityIndex: 7,
    patienceLevel: 4,
    favoriteGenres: ['Drame', 'Science-Fiction', 'Thriller', 'Animation'],
    seenTutorials: [],
    avatarUrl: 'dicebear:notionists-neutral:alex-bitter-demo',
    cinemaSubscription: buildSubscription(now),
    favoriteCinema: DEMO_CINEMA,
  };
};

// ─── Séances du calendrier ───────────────────────────────────────────────────

/**
 * Deux séances récentes et une à venir, toutes à l'UGC.
 *
 * Les deux passées sont marquées `completed` : elles correspondent à deux films
 * déjà notés plus haut, et une séance passée qui resterait « prévue » se
 * réafficherait indéfiniment dans le calendrier comme une sortie à venir. Seule
 * celle à venir apparaît donc dans la grille — c'est le comportement juste.
 */
export const buildDemoScreenings = (now: Date = new Date()): CinemaScreening[] => {
  const day = 24 * 60 * 60 * 1000;
  const upcoming = new Date(now.getTime() + 4 * day);
  upcoming.setHours(19, 45, 0, 0);

  const recentA = new Date(now.getTime() - 2 * day);
  recentA.setHours(20, 30, 0, 0);
  const recentB = new Date(now.getTime() - 9 * day);
  recentB.setHours(21, 0, 0, 0);

  const base = {
    profileId: DEMO_PROFILE_ID,
    cinemaName: DEMO_CINEMA.name,
    cinemaAddress: '7 place de la Rotonde, 75001 Paris',
    reminderOffsetsMinutes: [2880, 30],
    createdAt: now.getTime(),
    updatedAt: now.getTime(),
  };

  return [
    {
      ...base,
      id: 'demo-screening-upcoming',
      tmdbId: 508883,
      title: 'Le Garçon et le Héron',
      posterUrl: buildPoster(100, QUEUE[0].title, QUEUE[0].director, QUEUE[0].year, QUEUE[0].accent),
      startsAt: upcoming.getTime(),
      format: 'VOSTFR',
      notes: 'Séance du soir, salle 12.',
      status: 'scheduled',
      createdAt: now.getTime() - 3 * day,
    },
    {
      ...base,
      id: 'demo-screening-recent-1',
      tmdbId: FILMS[1].tmdbId,
      title: FILMS[1].title,
      posterUrl: buildPoster(1, FILMS[1].title, FILMS[1].director, FILMS[1].year, FILMS[1].accent),
      startsAt: recentA.getTime(),
      format: 'VF',
      status: 'completed',
      createdAt: recentA.getTime() - 2 * day,
    },
    {
      ...base,
      id: 'demo-screening-recent-2',
      tmdbId: FILMS[3].tmdbId,
      title: FILMS[3].title,
      posterUrl: buildPoster(3, FILMS[3].title, FILMS[3].director, FILMS[3].year, FILMS[3].accent),
      startsAt: recentB.getTime(),
      format: 'VOSTFR',
      status: 'completed',
      createdAt: recentB.getTime() - 2 * day,
    },
  ];
};

// ─── Fil d'amis ──────────────────────────────────────────────────────────────

interface FriendSpec {
  movieId: string;
  profileId: string;
  firstName: string;
  avatarSeed: string;
  avatarStyle: string;
  title: string;
  director: string;
  year: number;
  tmdbId: number;
  accent: string;
  profile: RatingProfileId;
  values: Record<string, number>;
  review: string;
  synopsis: string;
  hoursAgo: number;
}

/**
 * Trois amis, des notes volontairement contrastées.
 *
 * Chaque entrée porte une grille `adaptiveRating` complète : sans elle, le badge
 * de note est rendu `disabled` et la feuille de comparaison ne s'ouvre pas. Quatre
 * des films sont dans la collection d'Alex — c'est ce qui fait apparaître le badge
 * « vs toi » ; les trois autres ne le sont pas, et proposent donc le raccourci
 * watchlist.
 */
const FRIENDS: FriendSpec[] = [
  {
    movieId: 'demo-friend-activity-1',
    profileId: 'demo-friend-lea',
    firstName: 'Léa',
    avatarSeed: 'lea-bitter-demo',
    avatarStyle: 'open-peeps',
    title: 'Dune : Deuxième partie',
    director: 'Denis Villeneuve',
    year: 2024,
    tmdbId: 693134,
    accent: '#8a4a1f',
    profile: 'science_fiction',
    values: { scenario: 5.0, image: 9.0, interpretation: 6.0, sound: 8.5, universe: 6.5 },
    review: 'Magnifique et creux. Trois heures pour arriver où on savait qu’on allait.',
    synopsis:
      'Paul Atréides s’allie aux Fremen pour mener la révolte contre ceux qui ont détruit sa famille.',
    hoursAgo: 5,
  },
  {
    movieId: 'demo-friend-activity-2',
    profileId: 'demo-friend-karim',
    firstName: 'Karim',
    avatarSeed: 'karim-bitter-demo',
    avatarStyle: 'thumbs',
    title: 'The Substance',
    director: 'Coralie Fargeat',
    year: 2024,
    tmdbId: 933260,
    accent: '#6b1f3a',
    profile: 'horror',
    values: { scenario: 8.5, image: 9.0, interpretation: 9.0, sound: 9.0, fear: 9.5 },
    review: 'Le film le plus frontal de l’année. Le dernier acte m’a mis à terre.',
    synopsis:
      'Une star déchue teste un produit qui promet une version plus jeune et meilleure d’elle-même.',
    hoursAgo: 9,
  },
  {
    movieId: 'demo-friend-activity-3',
    profileId: 'demo-friend-sofia',
    firstName: 'Sofia',
    avatarSeed: 'sofia-bitter-demo',
    avatarStyle: 'notionists-neutral',
    title: 'Perfect Days',
    director: 'Wim Wenders',
    year: 2023,
    tmdbId: 976893,
    accent: '#2c4a3f',
    profile: 'drama',
    values: { scenario: 8.6, image: 8.8, interpretation: 9.4, sound: 8.0, emotional_truth: 9.2 },
    review: 'Un film qui apprend à regarder. Je suis sortie de là plus calme.',
    synopsis: 'Le quotidien d’un homme qui nettoie les toilettes publiques de Tokyo.',
    hoursAgo: 27,
  },
  {
    movieId: 'demo-friend-activity-4',
    profileId: 'demo-friend-lea',
    firstName: 'Léa',
    avatarSeed: 'lea-bitter-demo',
    avatarStyle: 'open-peeps',
    title: 'La La Land',
    director: 'Damien Chazelle',
    year: 2016,
    tmdbId: 313369,
    accent: '#2b3a70',
    profile: 'music',
    values: { scenario: 8.0, image: 9.5, interpretation: 9.0, sound: 9.8, songs: 9.6 },
    review: 'La séquence finale reste ce que le cinéma sait faire de mieux avec un « et si ».',
    synopsis: 'Une actrice et un pianiste de jazz tombent amoureux dans un Los Angeles rêvé.',
    hoursAgo: 31,
  },
  {
    movieId: 'demo-friend-activity-5',
    profileId: 'demo-friend-karim',
    firstName: 'Karim',
    avatarSeed: 'karim-bitter-demo',
    avatarStyle: 'thumbs',
    title: 'À couteaux tirés',
    director: 'Rian Johnson',
    year: 2019,
    tmdbId: 546554,
    accent: '#7a2a2a',
    profile: 'crime',
    values: { scenario: 8.8, image: 8.0, interpretation: 8.6, sound: 7.4, investigation: 8.4 },
    review: 'Une horlogerie parfaitement huilée. Craig s’amuse, et ça se voit.',
    synopsis:
      'À la mort d’un auteur de romans policiers, un détective enquête sur une famille peu recommandable.',
    hoursAgo: 53,
  },
  {
    movieId: 'demo-friend-activity-6',
    profileId: 'demo-friend-sofia',
    firstName: 'Sofia',
    avatarSeed: 'sofia-bitter-demo',
    avatarStyle: 'notionists-neutral',
    title: 'Conclave',
    director: 'Edward Berger',
    year: 2024,
    tmdbId: 974576,
    accent: '#4a2a4a',
    profile: 'thriller',
    values: { scenario: 8.8, image: 8.6, interpretation: 9.2, sound: 8.0, suspense: 9.0 },
    review: 'Beaucoup mieux que ce que la bande-annonce laissait craindre. Tucci est délicieux.',
    synopsis:
      'À la mort du pape, un cardinal découvre des secrets qui pourraient ébranler l’Église.',
    hoursAgo: 58,
  },
  {
    movieId: 'demo-friend-activity-7',
    profileId: 'demo-friend-lea',
    firstName: 'Léa',
    avatarSeed: 'lea-bitter-demo',
    avatarStyle: 'open-peeps',
    title: 'Dunkerque',
    director: 'Christopher Nolan',
    year: 2017,
    tmdbId: 374720,
    accent: '#3a4a5a',
    profile: 'historical',
    values: { scenario: 4.5, image: 8.6, interpretation: 5.0, sound: 9.2, historical_scope: 6.0 },
    review: 'Une prouesse technique sans personnage auquel se raccrocher. Je suis restée dehors.',
    synopsis:
      'En 1940, des centaines de milliers de soldats alliés sont encerclés sur les plages de Dunkerque.',
    hoursAgo: 76,
  },
];

/** Le fil d'activité, daté relativement à maintenant pour dire « Aujourd'hui ». */
export const buildDemoFriendsActivity = (now: Date = new Date()): FriendActivity[] =>
  FRIENDS.map((friend, index) => {
    const unweighted =
      Object.values(friend.values).reduce((sum, value) => sum + value, 0) /
      Object.values(friend.values).length;
    const adaptiveRating = buildAdaptiveRating(
      friend.profile,
      friend.values,
      Math.round(unweighted * 10) / 10
    );

    return {
      movieId: friend.movieId,
      profileId: friend.profileId,
      firstName: friend.firstName,
      avatarUrl: `dicebear:${friend.avatarStyle}:${friend.avatarSeed}`,
      title: friend.title,
      director: friend.director,
      year: friend.year,
      posterUrl: buildPoster(
        200 + index,
        friend.title,
        friend.director,
        friend.year,
        friend.accent
      ),
      tmdbId: friend.tmdbId,
      rating: adaptiveRating.weightedRating,
      adaptiveRating,
      review: friend.review,
      synopsis: friend.synopsis,
      watchedAt: new Date(now.getTime() - friend.hoursAgo * 60 * 60 * 1000).toISOString(),
    };
  });

// ─── Portrait de goût ───────────────────────────────────────────────

/**
 * Le portrait, écrit à la main plutôt que demandé au modèle.
 *
 * L'assistant passe par une fonction serveur qui exige une session : en démo il
 * répondrait par un refus, et l'onglet Profil montrerait une erreur à la place de
 * sa plus belle carte.
 *
 * Chaque observation cite un chiffre RÉELLEMENT calculé par `computeTasteStats`
 * sur cette collection — c'est la règle que s'impose TastePortrait, et une démo
 * n'a aucune raison d'y déroger. En modifiant les films plus haut, vérifier que
 * ces trois chiffres tiennent toujours.
 */
export const DEMO_TASTE_TRAITS: TasteTrait[] = [
  {
    text: 'Ce qui décide de ta note, c’est l’émotion. Quand elle est là le film monte, quand elle manque rien ne la remplace.',
    figure: 'Émotion · corrélation 0,92',
  },
  {
    text: 'Tu es le plus dur avec le scénario : c’est le seul critère où tu descends régulièrement sous la barre des 8.',
    figure: 'Scénario · 7,9 de moyenne',
  },
  {
    text: 'Tu regardes vraiment. Ton téléphone ne t’occupe qu’un dixième du temps, et la durée ne te fait pas fuir.',
    figure: '9 films de plus de 2h20',
  },
];
