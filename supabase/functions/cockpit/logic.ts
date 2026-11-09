/**
 * Les chiffres du cockpit, calculés sans dépendance.
 *
 * Module pur, testé tel quel par `tests/cockpit.test.mjs`. Tout passe ici pour
 * qu'un chiffre affiché ait une seule définition : un « actif » de la vue
 * d'ensemble est forcément un « Actif » de la liste des contacts.
 */

export const OWNER_EMAIL = 'vrymikaf13@gmail.com';

const DAY_MS = 86_400_000;
const ENGAGED_NOTES = 5;

export type ContactStatus = 'active' | 'asleep' | 'trial' | 'never';

export interface RawAccount {
  id: string;
  email: string | null;
  firstName: string | null;
  createdAt: string;
  confirmed: boolean;
}
export interface RawMovie {
  profileId: string;
  tmdbId: number | null;
  title: string;
  ratedAt: string | null;
  createdAt: string | null;
}
export interface RawUsage {
  userId: string;
  day: string;
  calls: number;
}
export interface RawScreening {
  profileId: string;
  tmdbId: number | null;
  startsAt: string;
}
export interface SnapshotInput {
  accounts: RawAccount[];
  movies: RawMovie[];
  usage: RawUsage[];
  screenings: RawScreening[];
  pushActive: number;
}

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  confirmed: boolean;
  isOwner: boolean;
  status: ContactStatus;
  joined: string;
  notes: number;
  notes30: number;
  lastNote: string | null;
  films: number;
  added30: number;
  ai30: number;
}

/** Comptes créés pour tester : ils fausseraient chaque chiffre. */
export const isTestAccount = (email: string | null): boolean => {
  const value = (email ?? '').toLowerCase();
  return (
    value.includes('+test') ||
    value.endsWith('@yopmail.com') ||
    value === 'review@thebitter.watch' ||
    value.startsWith('demo.')
  );
};

/** « Utilisateur » est le prénom posé par défaut : il ne désigne personne. */
const displayName = (account: RawAccount): string => {
  const first = (account.firstName ?? '').trim();
  if (first && first.toLowerCase() !== 'utilisateur') return first;
  const local = (account.email ?? '').split('@')[0];
  return local || 'Sans nom';
};

export const statusOf = (notes: number, notes30: number): ContactStatus => {
  if (notes30 > 0) return 'active';
  if (notes >= ENGAGED_NOTES) return 'asleep';
  return notes > 0 ? 'trial' : 'never';
};

const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10);

export function buildSnapshot(input: SnapshotInput, now: Date) {
  const nowMs = now.getTime();
  const since30 = nowMs - 30 * DAY_MS;
  const since7 = nowMs - 7 * DAY_MS;
  const after = (value: string | null, limit: number) => !!value && Date.parse(value) > limit;

  const real = input.accounts.filter((account) => !isTestAccount(account.email));
  const realIds = new Set(real.map((account) => account.id));
  const movies = input.movies.filter((movie) => realIds.has(movie.profileId));
  const owner = real.find((account) => account.email?.toLowerCase() === OWNER_EMAIL);

  const contacts: Contact[] = real.map((account) => {
    const own = movies.filter((movie) => movie.profileId === account.id);
    const rated = own.filter((movie) => movie.ratedAt);
    const notes30 = rated.filter((movie) => after(movie.ratedAt, since30)).length;
    const lastNote = rated.reduce<string | null>(
      (latest, movie) => (!latest || movie.ratedAt! > latest ? movie.ratedAt : latest),
      null
    );
    return {
      id: account.id,
      name: displayName(account),
      email: account.email,
      confirmed: account.confirmed,
      isOwner: account.id === owner?.id,
      status: statusOf(rated.length, notes30),
      joined: account.createdAt,
      notes: rated.length,
      notes30,
      lastNote,
      films: own.length,
      added30: own.filter((movie) => after(movie.createdAt, since30)).length,
      ai30: input.usage
        .filter((row) => row.userId === account.id && Date.parse(row.day) > since30 - DAY_MS)
        .reduce((sum, row) => sum + row.calls, 0),
    };
  });

  const days = Array.from({ length: 30 }, (_, index) => {
    const date = isoDay(nowMs - (29 - index) * DAY_MS);
    return { date, count: movies.filter((movie) => movie.ratedAt?.slice(0, 10) === date).length };
  });

  const notes30 = movies.filter((movie) => after(movie.ratedAt, since30));
  const notes7 = movies.filter((movie) => after(movie.ratedAt, since7));
  const newcomers = contacts.filter((contact) => after(contact.joined, since30));
  const engaged = contacts.filter((contact) => contact.notes >= ENGAGED_NOTES);
  const never = contacts.filter((contact) => contact.status === 'never');
  const asleep = contacts.filter((contact) => contact.status === 'asleep');

  const nameById = new Map(contacts.map((contact) => [contact.id, contact.name]));
  const activity = movies
    .filter((movie) => movie.ratedAt)
    .sort((a, b) => b.ratedAt!.localeCompare(a.ratedAt!))
    .slice(0, 8)
    .map((movie) => ({
      date: movie.ratedAt!,
      title: movie.title,
      who: nameById.get(movie.profileId) ?? '',
    }));

  const usage = input.usage.filter((row) => realIds.has(row.userId) && Date.parse(row.day) > since30 - DAY_MS);
  const perDay = new Map<string, number>();
  for (const row of usage) perDay.set(row.day, (perDay.get(row.day) ?? 0) + row.calls);

  const screenings = input.screenings.filter(
    (screening) => realIds.has(screening.profileId) && after(screening.startsAt, since30) && Date.parse(screening.startsAt) < nowMs
  );
  const ratedFilms = new Set(
    movies.filter((movie) => movie.ratedAt).map((movie) => `${movie.profileId}:${movie.tmdbId}`)
  );

  return {
    generatedAt: now.toISOString(),
    excludedTests: input.accounts.length - real.length,
    kpis: {
      accounts: contacts.length,
      active30: contacts.filter((contact) => contact.status === 'active').length,
      othersActive30: contacts.filter((contact) => contact.status === 'active' && !contact.isOwner).length,
      notes30: notes30.length,
      ownerNotes30: notes30.filter((movie) => movie.profileId === owner?.id).length,
      notes7: notes7.length,
      people7: new Set(notes7.map((movie) => movie.profileId)).size,
      newcomers: newcomers.length,
      newcomersSilent: newcomers.filter((contact) => contact.notes === 0).length,
      pushActive: input.pushActive,
    },
    days,
    funnel: {
      created: contacts.length,
      firstNote: contacts.filter((contact) => contact.notes > 0).length,
      fiveNotes: engaged.length,
      stillHere: engaged.filter((contact) => contact.notes30 > 0).length,
    },
    groups: {
      never: never.length,
      neverNew: never.filter((contact) => after(contact.joined, since30)).length,
      asleep: asleep.length,
      asleepWithEmail: asleep.filter((contact) => contact.email).length,
      trial: contacts.filter((contact) => contact.status === 'trial').length,
      screenings: screenings.length,
      screeningsUnrated: screenings.filter((s) => !ratedFilms.has(`${s.profileId}:${s.tmdbId}`)).length,
    },
    ai: {
      total: usage.reduce((sum, row) => sum + row.calls, 0),
      owner: usage.filter((row) => row.userId === owner?.id).reduce((sum, row) => sum + row.calls, 0),
      peak: Math.max(0, ...perDay.values()),
    },
    activity,
    contacts: contacts.sort((a, b) => (b.lastNote ?? '').localeCompare(a.lastNote ?? '') || b.joined.localeCompare(a.joined)),
  };
}

export type Snapshot = ReturnType<typeof buildSnapshot>;
