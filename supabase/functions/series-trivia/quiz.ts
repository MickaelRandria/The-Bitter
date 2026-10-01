/**
 * Le quiz tiré des bases de données, sans IA.
 *
 * Wikidata (licence CC0) et TMDB donnent des faits sûrs sur la fabrication
 * d'une série : qui l'a créée, qui en signe la musique, où elle a été tournée,
 * ce qu'elle a remporté, qui joue qui dans la première saison. Chaque fait
 * devient une question à trois choix, les mauvaises réponses étant prises dans
 * des listes du même genre (d'autres créateurs, d'autres plateformes...).
 *
 * Rien de tout ça ne dévoile l'histoire. La distribution ne vient que de la
 * première saison : un acteur qui arrive plus tard ne peut pas y figurer.
 *
 * Le tirage est déterministe (graine = la série et la question) : la même série
 * donne toujours le même quiz, ce qui le rend vérifiable et le cache stable.
 * Ce fichier n'importe rien : il est testé tel quel (tests/seriesQuiz.test.mjs).
 */

export interface SeriesFacts {
  title: string;
  creators: string[];
  composers: string[];
  networks: string[];
  locations: string[];
  countries: string[];
  awards: string[];
  year?: number;
  /** Les rôles réguliers de la première saison, jamais au-delà. */
  cast: { character: string; actor: string }[];
}

export interface DataQuestion {
  type: 'quiz';
  season: null;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  source: 'data';
  origin: 'data';
}

/** En dessous, pas de manche complète : on passe au quiz de l'IA. */
export const MIN_DATA_QUESTIONS = 4;

const POOLS = {
  creators: [
    'Vince Gilligan', 'Dan Erickson', 'Jesse Armstrong', 'Phoebe Waller-Bridge', 'Damon Lindelof',
    'Shonda Rhimes', 'David Simon', 'Matthew Weiner', 'Noah Hawley', 'Mike White', 'Ryan Murphy',
    'Christopher Storer', 'Craig Mazin', 'Peter Morgan', 'Sam Esmail', 'David Chase', 'Greg Daniels',
    'Lena Dunham', 'Donald Glover', 'Taylor Sheridan', 'Steven Knight', 'Baran bo Odar', 'Michael Schur',
    'Dan Harmon', 'Issa Rae', 'Aaron Sorkin', 'Jenji Kohan', 'Kurt Sutter', 'Eric Kripke', 'Mike Flanagan',
  ],
  composers: [
    'Ramin Djawadi', 'Theodore Shapiro', 'Dave Porter', 'Nicholas Britell', 'Max Richter', 'Bear McCreary',
    'Mark Mothersbaugh', 'Jeff Russo', 'Hildur Guðnadóttir', 'Trent Reznor', 'Natalie Holt', 'Ben Frost',
    'Cristobal Tapia de Veer', 'Siddhartha Khosla', 'Kris Bowers', 'Michael Abels', 'Daniel Pemberton',
    'Dustin O’Halloran', 'Lorne Balfe', 'Gustavo Santaolalla',
  ],
  networks: [
    'Netflix', 'HBO', 'Apple TV', 'Prime Video', 'Disney+', 'Canal+', 'AMC', 'FX', 'BBC One', 'Showtime',
    'Hulu', 'Arte', 'TF1', 'France 2', 'ABC', 'NBC', 'CBS', 'Fox', 'Starz', 'Paramount+', 'Channel 4', 'Peacock',
  ],
  locations: [
    'New York', 'Los Angeles', 'Atlanta', 'Vancouver', 'Toronto', 'Londres', 'Belfast', 'Albuquerque',
    'Chicago', 'Budapest', 'Prague', 'Dublin', 'Paris', 'Berlin', 'Madrid', 'Montréal', 'La Nouvelle-Orléans',
    'Pittsburgh', 'Séville', 'Islande', 'Écosse', 'Malte', 'Croatie', 'Afrique du Sud',
  ],
  countries: [
    'États-Unis', 'Royaume-Uni', 'France', 'Allemagne', 'Espagne', 'Corée du Sud', 'Danemark', 'Canada',
    'Italie', 'Japon', 'Suède', 'Belgique', 'Israël', 'Australie', 'Norvège',
  ],
  awards: [
    'Primetime Emmy Award de la meilleure série télévisée dramatique',
    'Primetime Emmy Award de la meilleure série télévisée comique',
    'Golden Globe de la meilleure série télévisée dramatique',
    'Golden Globe de la meilleure série télévisée musicale ou comique',
    'Peabody Awards',
    'Primetime Emmy Award de la meilleure mini-série',
    'Golden Globe de la meilleure mini-série ou du meilleur téléfilm',
    'Screen Actors Guild Award de la meilleure distribution pour une série dramatique',
    'Critics’ Choice Television Award de la meilleure série dramatique',
    'British Academy Television Award de la meilleure série dramatique',
  ],
  awardsEn: [
    'Primetime Emmy Award for Outstanding Drama Series',
    'Primetime Emmy Award for Outstanding Comedy Series',
    'Golden Globe Award for Best Television Series – Drama',
    'Golden Globe Award for Best Television Series – Musical or Comedy',
    'Peabody Award',
    'Primetime Emmy Award for Outstanding Limited Series',
    'Screen Actors Guild Award for Outstanding Performance by an Ensemble in a Drama Series',
    'Primetime Emmy Award for Outstanding Main Title Design',
    'Critics’ Choice Television Award for Best Drama Series',
    'British Academy Television Award for Best Drama Series',
  ],
  actors: [
    'Bryan Cranston', 'Adam Scott', 'Jeremy Allen White', 'Elisabeth Moss', 'Pedro Pascal', 'Zendaya',
    'Bob Odenkirk', 'Sarah Snook', 'Kieran Culkin', 'Jennifer Coolidge', 'Rami Malek', 'Millie Bobby Brown',
    'Cillian Murphy', 'Olivia Colman', 'Steve Carell', 'Ayo Edebiri', 'Kit Harington', 'Emilia Clarke',
  ],
};

const EN_COUNTRY: Record<string, string> = {
  'États-Unis': 'United States', 'Royaume-Uni': 'United Kingdom', France: 'France', Allemagne: 'Germany',
  Espagne: 'Spain', 'Corée du Sud': 'South Korea', Danemark: 'Denmark', Canada: 'Canada', Italie: 'Italy',
  Japon: 'Japan', Suède: 'Sweden', Belgique: 'Belgium', Israël: 'Israel', Australie: 'Australia', Norvège: 'Norway',
};

/** Pour comparer sans se faire piéger par la casse, les accents ou un « + ». */
const norm = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Graine stable : la même série et la même question donnent toujours le même tirage. */
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const shuffle = <T,>(items: T[], random: () => number) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/** Ce qui ressemble à une adresse (« 3828 Piermont Drive ») ou à un identifiant n'est pas une réponse. */
const usable = (value: string) => !!value && !/^Q\d+$/.test(value) && !/\d{2,}/.test(value) && value.length <= 90;

/**
 * Une question à trois choix. Les mauvaises réponses ne doivent ni égaler ni
 * contenir la bonne (« Apple TV » contre « Apple TV+ »), ni être une autre
 * vraie réponse (un deuxième créateur, un autre lieu de tournage).
 */
function ask(
  seed: string,
  question: string,
  correct: string,
  pool: string[],
  alsoTrue: string[],
  explanation: string
): DataQuestion | null {
  const random = rng(seed);
  const taken = [correct, ...alsoTrue].map(norm);
  const wrong = shuffle(pool, random)
    .filter((candidate, index, list) => {
      const n = norm(candidate);
      return (
        n &&
        !taken.some((t) => t === n || t.includes(n) || n.includes(t)) &&
        list.findIndex((other) => norm(other) === n) === index
      );
    })
    .slice(0, 2);
  if (wrong.length < 2) return null;
  const options = shuffle([correct, ...wrong], random);
  return {
    type: 'quiz',
    season: null,
    question,
    options,
    answer: options.indexOf(correct),
    explanation,
    source: 'data',
    origin: 'data',
  };
}

const list = (values: string[], language: 'fr' | 'en') =>
  values.length <= 1
    ? values.join('')
    : `${values.slice(0, -1).join(', ')} ${language === 'fr' ? 'et' : 'and'} ${values[values.length - 1]}`;

/** Toutes les questions qu'on peut tirer des faits, dans un ordre qui alterne les genres. */
export function buildDataQuiz(facts: SeriesFacts, language: 'fr' | 'en'): DataQuestion[] {
  const fr = language === 'fr';
  const t = facts.title;
  const q: (DataQuestion | null)[] = [];
  const creators = facts.creators.filter(usable);
  const composers = facts.composers.filter(usable);
  const networks = facts.networks.filter(usable);
  const locations = facts.locations.filter(usable);
  const countries = facts.countries.filter(usable);
  const awards = facts.awards.filter(usable);

  if (creators.length) {
    q.push(
      ask(`${t}:creator`, fr ? `Qui a créé ${t} ?` : `Who created ${t}?`, creators[0], POOLS.creators, creators,
        fr ? `${t} a été créée par ${list(creators, 'fr')}.` : `${t} was created by ${list(creators, 'en')}.`)
    );
  }

  const cast = facts.cast.filter(
    (c) => usable(c.actor) && usable(c.character) && !/^(self|himself|herself|narrator|narrateur)$/i.test(c.character)
  );
  const actors = cast.map((c) => c.actor);
  shuffle(cast, rng(`${t}:cast`))
    .slice(0, 3)
    .forEach((role) => {
      q.push(
        ask(
          `${t}:cast:${role.character}`,
          fr ? `Qui joue ${role.character} dans ${t} ?` : `Who plays ${role.character} in ${t}?`,
          role.actor,
          [...actors.filter((a) => a !== role.actor), ...POOLS.actors],
          [],
          fr ? `${role.character} est interprété(e) par ${role.actor}.` : `${role.character} is played by ${role.actor}.`
        )
      );
    });

  if (composers.length) {
    q.push(
      ask(`${t}:composer`, fr ? `Qui signe la musique de ${t} ?` : `Who composed the music for ${t}?`, composers[0],
        POOLS.composers, composers,
        fr ? `La musique de ${t} est signée ${list(composers, 'fr')}.` : `${t}'s score is by ${list(composers, 'en')}.`)
    );
  }

  if (networks.length) {
    q.push(
      ask(`${t}:network`,
        fr ? `Sur quelle chaîne ou plateforme ${t} a-t-elle été diffusée à l’origine ?` : `Which network or platform first aired ${t}?`,
        networks[0], POOLS.networks, networks,
        fr ? `${t} a d’abord été diffusée sur ${list(networks, 'fr')}.` : `${t} first aired on ${list(networks, 'en')}.`)
    );
  }

  locations.slice(0, 2).forEach((place) => {
    q.push(
      ask(`${t}:location:${place}`, fr ? `Où ${t} a-t-elle été (en partie) tournée ?` : `Where was ${t} (partly) filmed?`,
        place, POOLS.locations, locations,
        fr ? `${t} a été tournée notamment à ${list(locations, 'fr')}.` : `${t} was filmed in ${list(locations, 'en')}.`)
    );
  });

  // Un pays d'origine n'est une question que s'il surprend un peu.
  if (countries.length && !countries.some((c) => /^(États-Unis|United States)/.test(c))) {
    q.push(
      ask(`${t}:country`, fr ? `De quel pays vient ${t} ?` : `Which country does ${t} come from?`, countries[0],
        fr ? POOLS.countries : POOLS.countries.map((c) => EN_COUNTRY[c] ?? c), countries,
        fr ? `${t} est une série de ce pays : ${list(countries, 'fr')}.` : `${t} comes from ${list(countries, 'en')}.`)
    );
  }

  shuffle(awards, rng(`${t}:awards`))
    .slice(0, 3)
    .forEach((award) => {
      const english = /\b(for|Award for|Outstanding|Best)\b/.test(award);
      q.push(
        ask(`${t}:award:${award}`,
          fr ? `Laquelle de ces récompenses ${t} a-t-elle remportée ?` : `Which of these awards did ${t} win?`,
          award, english ? POOLS.awardsEn : POOLS.awards, awards,
          fr ? `${t} a remporté : ${award}.` : `${t} won the ${award}.`)
      );
    });

  if (facts.year) {
    const y = facts.year;
    const random = rng(`${t}:year`);
    const wrong = shuffle([y - 3, y - 2, y - 1, y + 1, y + 2], random)
      .filter((v) => v <= new Date().getUTCFullYear())
      .slice(0, 2);
    if (wrong.length === 2) {
      const options = shuffle([y, ...wrong], random).map(String);
      q.push({
        type: 'quiz',
        season: null,
        question: fr ? `En quelle année ${t} a-t-elle commencé ?` : `In which year did ${t} premiere?`,
        options,
        answer: options.indexOf(String(y)),
        explanation: fr ? `Le premier épisode de ${t} a été diffusé en ${y}.` : `${t} premiered in ${y}.`,
        source: 'data',
        origin: 'data',
      });
    }
  }

  return q.filter((item): item is DataQuestion => item != null);
}
