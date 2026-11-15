import type { CinemaShowtime, FavoriteCinema, UserProfile } from '../types';

export const MAX_FAVORITE_CINEMAS = 15;

/**
 * Plafond des salles interrogées pour une même feuille de séances. Mes salles
 * passent toujours (une ville entière tient : 15 au plus) ; dans un espace, les
 * salles des autres membres s'ajoutent jusqu'à vingt, puis sont coupées.
 */
export const MAX_SHOWTIME_SOURCES = 20;

/** Couleur de chaque cinéma selon son rang dans ma liste, la même partout. */
// Lisibles sur la crème du profil comme sur le fond sombre de la feuille des séances.
export const CINEMA_COLORS = ['#C5E600', '#8BAA7C', '#F59E0B', '#93C5FD', '#D6D3D1'];
/** Couleurs claires : le numéro posé dessus s'écrit en noir. */
export const CINEMA_INK = ['#1A1A1A', '#1A1A1A', '#1A1A1A', '#1A1A1A', '#1A1A1A'];

/** An explicitly empty list means the user removed all their cinemas. */
export function cinemasOf(profile?: Pick<UserProfile, 'favoriteCinemas' | 'favoriteCinema'> | null): FavoriteCinema[] {
  if (Array.isArray(profile?.favoriteCinemas)) return profile.favoriteCinemas;
  return profile?.favoriteCinema ? [profile.favoriteCinema] : [];
}

/** Preserve order while ignoring repeated cinemas and enforcing the UI limit. */
export function uniqueFavoriteCinemas(cinemas: FavoriteCinema[]): FavoriteCinema[] {
  const seen = new Set<string>();
  return cinemas.filter((cinema) => {
    if (!cinema?.id || seen.has(cinema.id)) return false;
    seen.add(cinema.id);
    return true;
  }).slice(0, MAX_FAVORITE_CINEMAS);
}

/** Les deux champs du profil, toujours écrits ensemble : le premier reste « le » cinéma. */
export function withFavoriteCinemas<T extends Pick<UserProfile, 'favoriteCinemas' | 'favoriteCinema'>>(
  profile: T,
  cinemas: FavoriteCinema[]
): T {
  const list = uniqueFavoriteCinemas(cinemas);
  const next = { ...profile, favoriteCinemas: list };
  if (list[0]) next.favoriteCinema = list[0];
  else delete next.favoriteCinema;
  return next;
}

/** Les deux champs seuls, à étaler dans un profil reconstruit champ par champ. */
export function favoriteCinemaFields(cinemas: FavoriteCinema[]): Pick<UserProfile, 'favoriteCinemas' | 'favoriteCinema'> {
  const list = uniqueFavoriteCinemas(cinemas);
  return { favoriteCinemas: list, favoriteCinema: list[0] };
}

/** Une ligne `profiles` lue sur le serveur : la liste d'abord, l'ancien champ en repli. */
export function cinemasOfRow(row?: { favorite_cinemas?: unknown; favorite_cinema?: unknown } | null): FavoriteCinema[] | undefined {
  if (!row) return undefined;
  if (Array.isArray(row.favorite_cinemas)) return uniqueFavoriteCinemas(row.favorite_cinemas as FavoriteCinema[]);
  const single = row.favorite_cinema as FavoriteCinema | null | undefined;
  return single?.id ? [single] : undefined;
}

/** Une salle interrogée pour la feuille des séances, et à qui elle appartient. */
export interface ShowtimeSource {
  cinema: FavoriteCinema;
  color: string;
  /** Dans ma liste à moi. */
  mine: boolean;
  /** Les autres membres de l'espace qui la suivent aussi (prénoms). */
  followers: string[];
  /** Couleur de membre du premier d'entre eux, pour les salles des autres. */
  followerColor?: string;
}

export interface MemberCinemas {
  name: string;
  color?: string;
  cinemas: FavoriteCinema[];
}

/**
 * Mes salles d'abord, dans mon ordre ; puis celles des autres membres, chacune
 * une seule fois avec les prénoms de ceux qui la suivent. Une salle que je suis
 * aussi reste chez moi, avec la mention « aussi Sarah ».
 */
export function buildShowtimeSources(mine: FavoriteCinema[], others: MemberCinemas[] = []): ShowtimeSource[] {
  const sources: ShowtimeSource[] = uniqueFavoriteCinemas(mine).map((cinema, index) => ({
    cinema,
    color: CINEMA_COLORS[index % CINEMA_COLORS.length],
    mine: true,
    followers: [],
  }));
  const byId = new Map(sources.map((source) => [source.cinema.id, source]));

  for (const member of others) {
    for (const cinema of uniqueFavoriteCinemas(member.cinemas)) {
      const known = byId.get(cinema.id);
      if (known) {
        if (member.name && !known.followers.includes(member.name)) known.followers.push(member.name);
        continue;
      }
      if (sources.length >= MAX_SHOWTIME_SOURCES) continue;
      const source: ShowtimeSource = {
        cinema,
        color: member.color || '#A8A29E',
        mine: false,
        followers: member.name ? [member.name] : [],
        followerColor: member.color,
      };
      sources.push(source);
      byId.set(cinema.id, source);
    }
  }
  return sources;
}

/** Un horaire et la salle qui le propose. */
export interface SourcedShowtime {
  showtime: CinemaShowtime;
  cinemaId: string;
}

export interface ShowtimeDayGroup {
  cinemaId: string;
  showtimes: CinemaShowtime[];
}

export interface ShowtimeDay {
  /** Minuit local du jour, en millisecondes. */
  day: number;
  /** 0 = aujourd'hui, 1 = demain… */
  offset: number;
  count: number;
  first?: number;
  last?: number;
  /** Une entrée par salle qui joue ce jour-là, dans l'ordre des salles. */
  groups: ShowtimeDayGroup[];
}

export const startOfDay = (timestamp: number) => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/**
 * Les jours à venir, vides compris : un jour sans séance se lit « rien de
 * prévu » plutôt que de disparaître. Les horaires déjà passés sont écartés.
 */
export function groupShowtimesByDay(
  entries: SourcedShowtime[],
  cinemaOrder: string[],
  now = Date.now(),
  days = 7
): ShowtimeDay[] {
  const today = startOfDay(now);
  const result: ShowtimeDay[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    // Pas `today + offset * 24 h` : un changement d'heure décalerait minuit.
    const date = new Date(today);
    date.setDate(date.getDate() + offset);
    result.push({ day: date.getTime(), offset, count: 0, groups: [] });
  }
  const byDay = new Map(result.map((day) => [day.day, day]));
  const rank = (id: string) => {
    const index = cinemaOrder.indexOf(id);
    return index === -1 ? cinemaOrder.length : index;
  };

  const upcoming = entries
    .filter((entry) => entry.showtime.startsAt > now)
    .sort((a, b) => a.showtime.startsAt - b.showtime.startsAt);

  for (const entry of upcoming) {
    const day = byDay.get(startOfDay(entry.showtime.startsAt));
    if (!day) continue;
    let group = day.groups.find((g) => g.cinemaId === entry.cinemaId);
    if (!group) {
      group = { cinemaId: entry.cinemaId, showtimes: [] };
      day.groups.push(group);
    }
    group.showtimes.push(entry.showtime);
    day.count += 1;
    day.first = day.first ?? entry.showtime.startsAt;
    day.last = entry.showtime.startsAt;
  }
  result.forEach((day) => day.groups.sort((a, b) => rank(a.cinemaId) - rank(b.cinemaId)));
  return result;
}

/** La prochaine séance à venir, toutes salles confondues. */
export function nextShowtime(entries: SourcedShowtime[], now = Date.now()): SourcedShowtime | null {
  return entries.reduce<SourcedShowtime | null>(
    (best, entry) =>
      entry.showtime.startsAt > now && (!best || entry.showtime.startsAt < best.showtime.startsAt) ? entry : best,
    null
  );
}

/** « UGC Ciné Cité Les Halles » → « Les Halles » : assez pour une puce. */
export function shortCinemaName(name: string): string {
  const short = name.replace(/^UGC\s+(Cin[ée]\s+Cit[ée]\s+)?/i, '').trim();
  return short || name;
}
