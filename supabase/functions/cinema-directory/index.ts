import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UGC_DIRECTORY_URL = 'https://www.ugc.fr/cinemasQuickFilterAjaxAction%21getAllList.action';
const UGC_SHOWTIMES_URL = 'https://www.ugc.fr/showingsCinemaAjaxAction%21getShowingsForCinemaPage.action';
const UGC_BOOKING_URL = 'https://www.ugc.fr/reservationSeances.html?id=';
const DIRECTORY_CACHE_MS = 12 * 60 * 60 * 1_000;
/**
 * Une grille horaire bouge rarement dans la journée : trois heures suffisent à
 * rester juste tout en ne redemandant la même journée à UGC qu'une poignée de
 * fois par jour, quel que soit le nombre de personnes qui ouvrent la fiche.
 * Les séances déjà commencées sont filtrées à la lecture, pas à la mise en
 * cache : un cache un peu vieux ne peut donc pas proposer un horaire passé.
 */
const SHOWTIMES_CACHE_MS = 3 * 60 * 60 * 1_000;
/** Au-delà, UGC n'a de toute façon pas encore publié la semaine suivante. */
const MAX_SHOWTIME_DAYS = 7;
/** Quelques dizaines de journées-cinémas suffisent, et bornent la mémoire de l'isolat. */
const SHOWTIMES_CACHE_ENTRIES = 120;
const PARIS_TIME_ZONE = 'Europe/Paris';

type UgcCinema = { id: string; name: string };
type UgcCity = { id: string; label: string; city: string; cinemas: UgcCinema[] };

/** Une séance telle qu'affichée par UGC, avant tout rapprochement avec un film TMDB. */
type UgcShowing = {
  id: string;
  title: string;
  /** Identifiant UGC du film : il regroupe les séances d'une même affiche. */
  filmId: string;
  cinemaName: string;
  version: string;
  room: string;
  /** jj/mm/aaaa, tel qu'UGC l'écrit. */
  date: string;
  /** hh:mm à l'heure de Paris. */
  time: string;
  endTime: string;
};

let cachedDirectory: { expiresAt: number; cities: UgcCity[] } | null = null;
const cachedShowtimes = new Map<string, { expiresAt: number; showings: UgcShowing[]; posters: Record<string, string> }>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const fail = (status: number, code: string, message: string) => json({ code, message }, status);

const cleanText = (value: unknown, maximum: number) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maximum) : '';

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Les titres de films UGC apportent bien plus d'entités que la liste des villes :
 * accents composés, apostrophes typographiques, tirets longs. On traite donc les
 * familles d'entités (`&Eacute;`, `&ocirc;`…) par leur règle plutôt qu'une à une.
 */
const ACCENT_MARKS: Record<string, string> = {
  acute: '́',
  grave: '̀',
  circ: '̂',
  uml: '̈',
  tilde: '̃',
  ring: '̊',
  cedil: '̧',
};

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  laquo: '«',
  raquo: '»',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  deg: '°',
  euro: '€',
  oelig: 'œ',
  szlig: 'ß',
  middot: '·',
  times: '×',
};

const decodeHtml = (value: string) =>
  value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-zA-Z])(acute|grave|circ|uml|tilde|ring|cedil);/g, (whole, letter, accent) =>
      ACCENT_MARKS[accent] ? (letter + ACCENT_MARKS[accent]).normalize('NFC') : whole
    )
    .replace(/&([a-zA-Z]+);/g, (whole, name) => NAMED_ENTITIES[name] ?? NAMED_ENTITIES[name.toLowerCase()] ?? whole);

const stripHtml = (value: string) => cleanText(decodeHtml(value.replace(/<[^>]*>/g, ' ')), 200);

const fetchWithTimeout = async (url: string, init: RequestInit = {}, timeoutMs = 12_000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      headers: {
        Accept: 'text/html',
        'User-Agent': 'The-Bitter UGC directory (https://thebitter.watch)',
        ...(init.headers as Record<string, string> | undefined),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

const parseUgcDirectory = (html: string): UgcCity[] => {
  const headings = [...html.matchAll(/<a\s+id="anchor_[^"]+"[\s\S]*?<span[^>]*class="text-uppercase"[^>]*>([\s\S]*?)<\/span>/gi)];
  const cities: UgcCity[] = [];

  headings.forEach((heading, index) => {
    const rawLabel = stripHtml(heading[1]);
    // La réponse UGC contient « cinéma » avec des accents suivant le charset.
    // On retire le compteur sans dépendre de son encodage.
    const city = cleanText(rawLabel.replace(/\s*\(\d+\s+cin[^)]*\)\s*$/i, ''), 100);
    if (!city) return;

    const block = html.slice(heading.index, headings[index + 1]?.index ?? html.length);
    const cinemaMatches = [...block.matchAll(/id="quickAccessCinema_(\d+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    const seen = new Set<string>();
    const cinemas = cinemaMatches
      .map((match) => ({ id: match[1], name: stripHtml(match[2]) }))
      // Les cinémas partenaires figurent aussi sur la page UGC : l'app ne
      // propose ici que les établissements qui portent réellement l'enseigne UGC.
      .filter((cinema) => /^ugc\b/i.test(cinema.name) && !seen.has(cinema.id) && Boolean(seen.add(cinema.id)));

    if (cinemas.length > 0) {
      cities.push({ id: normalize(city), label: city, city, cinemas });
    }
  });

  return cities;
};

const getUgcDirectory = async (): Promise<UgcCity[]> => {
  if (cachedDirectory && cachedDirectory.expiresAt > Date.now()) return cachedDirectory.cities;

  const response = await fetchWithTimeout(UGC_DIRECTORY_URL);
  if (!response.ok) throw new Error(`UGC directory ${response.status}`);
  const cities = parseUgcDirectory(await response.text());
  if (cities.length === 0) throw new Error('UGC directory parse failure');
  cachedDirectory = { cities, expiresAt: Date.now() + DIRECTORY_CACHE_MS };
  return cities;
};

const parisParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: PARIS_TIME_ZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const readParisParts = (instant: number) =>
  Object.fromEntries(parisParts.formatToParts(instant).map((part) => [part.type, part.value])) as Record<string, string>;

/** Décalage Paris ↔ UTC en minutes, à l'instant donné. */
const parisOffsetMinutes = (instant: number) => {
  const parts = readParisParts(instant);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
  return Math.round((asUtc - instant) / 60_000);
};

/**
 * Une heure lue sur une affiche parisienne n'est pas un instant : elle vaut
 * UTC+1 ou UTC+2 selon la saison. La fonction Edge tourne en UTC, elle doit donc
 * appliquer le décalage réel de CE jour-là. La seconde passe rattrape les nuits
 * de changement d'heure, où le décalage à appliquer n'est pas celui de minuit.
 */
const parisToInstant = (year: number, month: number, day: number, hour: number, minute: number) => {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const firstGuess = naive - parisOffsetMinutes(naive) * 60_000;
  return naive - parisOffsetMinutes(firstGuess) * 60_000;
};

/** Les `days` prochaines journées parisiennes, au format jj/mm/aaaa attendu par UGC. */
const parisDaysFromToday = (days: number): string[] => {
  const today = readParisParts(Date.now());
  const anchor = Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day), 12);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(anchor + index * 24 * 60 * 60 * 1_000);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${date.getUTCFullYear()}`;
  });
};

const readAttributes = (tag: string): Record<string, string> => {
  const attributes: Record<string, string> = {};
  for (const match of tag.matchAll(/([a-zA-Z][a-zA-Z0-9-]*)="([^"]*)"/g)) {
    attributes[match[1].toLowerCase()] = decodeHtml(match[2]).trim();
  }
  return attributes;
};

/**
 * UGC décrit chaque séance sur le bouton de réservation lui-même, en attributs
 * `data-*` : identifiant de séance, titre, version, salle, jour et heure. C'est
 * la partie la plus stable de la page — on ne lit donc que ces boutons, jamais
 * la mise en page qui les entoure.
 */
const parseUgcShowings = (html: string): UgcShowing[] => {
  const showings: UgcShowing[] = [];
  for (const match of html.matchAll(/<button\b[^>]*?data-showing="(\d+)"[\s\S]{0,6000}?<\/button>/gi)) {
    const block = match[0];
    const attributes = readAttributes(block.slice(0, block.indexOf('>') + 1));
    const date = attributes['data-seancedate'] || '';
    const time = attributes['data-seancehour'] || '';
    const title = cleanText(attributes['data-film'], 240);
    if (!title || !/^\d{2}\/\d{2}\/\d{4}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) continue;

    showings.push({
      id: match[1],
      title,
      filmId: attributes['data-filmid'] || '',
      cinemaName: cleanText(attributes['data-cinema'], 240),
      version: cleanText(attributes['data-version'], 40),
      // La salle n'est publiée que le jour même : elle reste souvent vide.
      room: cleanText(stripHtml(block.match(/screening-room[^>]*>([\s\S]*?)<\/div>/i)?.[1] || ''), 60),
      date,
      time,
      endTime: block.match(/\(fin\s*(\d{1,2}:\d{2})\)/i)?.[1] || '',
    });
  }
  return showings;
};

/**
 * L'affiche de chaque film, relevée sur son bloc de programmation.
 *
 * Les boutons de séance ne la portent pas : elle vit plus haut dans la page,
 * sur le bloc du film. On associe les deux par l'identifiant UGC du film.
 * Le chargement paresseux d'UGC met l'URL dans `data-src`, pas dans `src`.
 */
const parseUgcPosters = (html: string): Record<string, string> => {
  const posters: Record<string, string> = {};
  for (const block of html.matchAll(/id="bloc-showing-film-(\d+)"([\s\S]*?)(?=id="bloc-showing-film-|$)/g)) {
    const poster = block[2].match(/data-src="(https:\/\/www\.ugc\.fr\/dynamique\/films\/[^"]+)"/)?.[1];
    if (poster) posters[block[1]] = poster;
  }
  return posters;
};

/** Une journée d'un cinéma, mise en cache sous sa forme déjà analysée (quelques Ko, pas 800). */
const getCinemaDay = async (
  cinemaId: string,
  date: string
): Promise<{ showings: UgcShowing[]; posters: Record<string, string> }> => {
  const key = `${cinemaId}|${date}`;
  const cached = cachedShowtimes.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const response = await fetchWithTimeout(UGC_SHOWTIMES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ cinemaId, date }).toString(),
  });
  if (!response.ok) throw new Error(`UGC showtimes ${response.status}`);
  const html = await response.text();
  const day = { showings: parseUgcShowings(html), posters: parseUgcPosters(html) };

  // Map conserve l'ordre d'insertion, mais `set` sur une clé existante ne la
  // déplace pas : on la retire d'abord pour qu'un rafraîchissement la remette en
  // fin de file et ne se fasse pas évincer alors qu'elle vient d'être relue.
  cachedShowtimes.delete(key);
  if (cachedShowtimes.size >= SHOWTIMES_CACHE_ENTRIES) {
    const oldest = cachedShowtimes.keys().next();
    if (!oldest.done) cachedShowtimes.delete(oldest.value);
  }
  cachedShowtimes.set(key, { ...day, expiresAt: Date.now() + SHOWTIMES_CACHE_MS });
  return day;
};


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method-not-allowed', 'Requête POST attendue.');

  const contentLength = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > 2_000) {
    return fail(413, 'payload-too-large', 'Requête trop volumineuse.');
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'invalid-json', 'Corps JSON invalide.');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return fail(503, 'server-misconfigured', 'Service indisponible.');

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('authorization') || '' } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return fail(401, 'authentication-required', 'Connecte-toi pour rechercher un cinéma.');

  /**
   * Le besoin réel n'est pas « toute la programmation UGC » mais « ce film-ci,
   * dans ce cinéma-ci ». On lit donc la grille du cinéma demandé et on n'y
   * cherche qu'un titre : aucun rapprochement massif entre catalogues, donc
   * aucune place pour un faux appariement à grande échelle.
   *
   * Cette action ne dépend pas de l'annuaire : elle est traitée avant lui pour
   * qu'une liste des villes en panne ne prive pas la fiche film de ses horaires.
   */
  /**
   * Les `days` prochaines journées du cinéma, lues trois par trois : assez pour
   * tenir la latence, assez peu pour ne pas envoyer une rafale d'appels à UGC.
   * Une journée qui échoue vaut journée vide — c'est au reste de continuer.
   */
  const readDays = async (cinemaId: string, days: number) => {
    const dates = parisDaysFromToday(days);
    const collected: { date: string; showings: UgcShowing[]; posters: Record<string, string> }[] = [];
    let failures = 0;

    for (let index = 0; index < dates.length; index += 3) {
      const batch = await Promise.all(
        dates.slice(index, index + 3).map(async (date) => {
          try {
            return { date, ...(await getCinemaDay(cinemaId, date)) };
          } catch (error) {
            console.warn('[Cinema directory] Grille UGC indisponible', { cinemaId, date, error: String(error) });
            failures += 1;
            return { date, showings: [] as UgcShowing[], posters: {} as Record<string, string> };
          }
        })
      );
      collected.push(...batch);
    }
    return { dates, collected, failures };
  };

  /** jj/mm/aaaa + hh:mm parisiens → instant, ou null si la séance est passée. */
  const instantOf = (showing: UgcShowing, now: number) => {
    const [day, month, year] = showing.date.split('/').map(Number);
    const [hour, minute] = showing.time.split(':').map(Number);
    const startsAt = parisToInstant(year, month, day, hour, minute);
    return Number.isFinite(startsAt) && startsAt > now ? startsAt : null;
  };

  /**
   * La programmation complète d'un cinéma : de quoi remplacer la saisie à la
   * main d'un titre, d'une date et d'une heure par un choix dans le vrai
   * programme. On renvoie l'état des sept jours — y compris ceux qui sont
   * vides — pour que le sélecteur de jour puisse les griser au lieu de laisser
   * croire à une panne : UGC ne publie la semaine suivante qu'au basculement
   * du mercredi, et un lundi soir les jours lointains sont réellement vides.
   */
  if (body.action === 'programme') {
    const cinemaId = cleanText(body.cinemaId, 12);
    if (!/^\d{1,8}$/.test(cinemaId)) return fail(400, 'invalid-cinema', 'Cinéma invalide.');

    const { dates, collected, failures } = await readDays(cinemaId, MAX_SHOWTIME_DAYS);
    if (failures === dates.length) {
      return fail(503, 'ugc-showtimes-unavailable', 'Le programme UGC est momentanément indisponible.');
    }

    const now = Date.now();
    const perDay = collected.map((entry) => {
      const upcoming = entry.showings
        .map((showing) => ({ showing, startsAt: instantOf(showing, now) }))
        .filter((item): item is { showing: UgcShowing; startsAt: number } => item.startsAt !== null);
      return { ...entry, upcoming };
    });

    const requested = cleanText(body.date, 10);
    // Par défaut, le premier jour qui a réellement quelque chose à proposer :
    // un soir à 22 h, « aujourd'hui » n'a plus une seule séance à vendre.
    const selected =
      (requested && perDay.find((day) => day.date === requested)) ||
      perDay.find((day) => day.upcoming.length > 0) ||
      perDay[0];

    const grouped = new Map<string, { filmId: string; title: string; posterUrl: string; showtimes: unknown[] }>();
    selected.upcoming
      .sort((a, b) => a.startsAt - b.startsAt)
      .forEach(({ showing, startsAt }) => {
        const key = showing.filmId || normalize(showing.title);
        if (!grouped.has(key)) {
          grouped.set(key, {
            filmId: showing.filmId,
            title: showing.title,
            posterUrl: selected.posters[showing.filmId] || '',
            showtimes: [],
          });
        }
        grouped.get(key)!.showtimes.push({
          id: showing.id,
          startsAt: new Date(startsAt).toISOString(),
          version: showing.version,
          room: showing.room,
          endTime: showing.endTime,
          bookingUrl: `${UGC_BOOKING_URL}${showing.id}`,
        });
      });

    return json({
      date: selected.date,
      days: perDay.map((day) => {
        const [d, m, y] = day.date.split('/');
        return {
          date: day.date,
          iso: `${y}-${m}-${d}`,
          showings: day.upcoming.length,
          films: new Set(day.upcoming.map((item) => item.showing.filmId || item.showing.title)).size,
        };
      }),
      films: [...grouped.values()].sort((a, b) => a.title.localeCompare(b.title, 'fr')),
      partial: failures > 0,
    });
  }

  if (body.action === 'showtimes') {
    const cinemaId = cleanText(body.cinemaId, 12);
    if (!/^\d{1,8}$/.test(cinemaId)) return fail(400, 'invalid-cinema', 'Cinéma invalide.');

    const rawTitles = Array.isArray(body.titles) ? body.titles.slice(0, 4) : [body.title];
    const wanted = [...new Set(rawTitles.map((value) => normalize(cleanText(value, 240))).filter((value) => value.length >= 2))];
    if (wanted.length === 0) return fail(400, 'invalid-title', 'Titre de film manquant.');

    const requestedDays = Number(body.days);
    const days = Number.isFinite(requestedDays)
      ? Math.min(MAX_SHOWTIME_DAYS, Math.max(1, Math.round(requestedDays)))
      : MAX_SHOWTIME_DAYS;

    const { dates, collected, failures } = await readDays(cinemaId, days);
    if (failures === dates.length) {
      return fail(503, 'ugc-showtimes-unavailable', 'Les horaires UGC sont momentanément indisponibles.');
    }

    // Une séance déjà commencée n'est plus réservable : elle disparaît à la
    // lecture, ce qui rend inoffensif un cache vieux de quelques heures.
    const now = Date.now();
    const items = collected
      .flatMap((day) => day.showings)
      .filter((showing) => wanted.includes(normalize(showing.title)))
      .map((showing) => ({ showing, startsAt: instantOf(showing, now) }))
      .filter((entry): entry is { showing: UgcShowing; startsAt: number } => entry.startsAt !== null)
      .sort((a, b) => a.startsAt - b.startsAt)
      .map(({ showing, startsAt }) => ({
        id: showing.id,
        title: showing.title,
        startsAt: new Date(startsAt).toISOString(),
        version: showing.version,
        room: showing.room,
        endTime: showing.endTime,
        cinemaName: showing.cinemaName,
        bookingUrl: `${UGC_BOOKING_URL}${showing.id}`,
      }));

    return json({ items, days, partial: failures > 0 });
  }

  let directory: UgcCity[];
  try {
    directory = await getUgcDirectory();
  } catch (error) {
    console.warn('[Cinema directory] Liste UGC indisponible', error);
    return fail(503, 'ugc-directory-unavailable', 'La liste officielle UGC est momentanément indisponible.');
  }

  if (body.action === 'cities') {
    const query = normalize(cleanText(body.query, 100));
    if (query.length < 2) return fail(400, 'invalid-query', 'Saisis au moins deux lettres.');
    const items = directory
      .filter((city) => normalize(city.label).includes(query))
      .map(({ id, label, city }) => ({ id, label, city }));
    return json({ items });
  }

  if (body.action === 'cinemas') {
    const city = normalize(cleanText(body.city, 100));
    if (!city) return fail(400, 'invalid-city', 'Ville invalide.');
    const selectedCity = directory.find((entry) => entry.id === city);
    if (!selectedCity) return json({ items: [] });
    return json({
      items: selectedCity.cinemas.map((cinema) => ({
        id: cinema.id,
        name: cinema.name,
        address: selectedCity.label,
      })),
    });
  }

  return fail(400, 'invalid-action', 'Action inconnue.');
});
