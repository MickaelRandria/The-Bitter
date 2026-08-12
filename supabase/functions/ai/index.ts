/**
 * Relais vers Mistral.
 *
 * Toute clé placée dans l'application finit en clair dans le fichier JavaScript
 * que le navigateur télécharge : Vite la remplace par sa valeur au moment du
 * build, et il n'existe aucun moyen de l'y cacher. Pour une clé facturée à
 * l'usage, cela revient à publier un moyen de paiement. Elle vit donc ici, dans
 * les secrets de la fonction, et l'application n'appelle plus Mistral mais nous.
 *
 * Ce détour paie trois fois : la clé reste secrète, l'appel exige une vraie
 * session (un inconnu ne peut pas se servir), et un plafond quotidien par
 * personne borne la facture même si un compte légitime part en boucle.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';

/** Alias de version : Mistral fait pointer `-latest` sur la révision courante. */
const DEFAULT_MODEL = 'mistral-small-latest';

/** Au-delà, l'appel est refusé pour la journée (UTC). */
const DEFAULT_DAILY_LIMIT = 40;

/** Mistral n'est pas toujours rapide ; l'utilisateur, lui, n'attendra pas plus. */
const UPSTREAM_TIMEOUT_MS = 45_000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Bornes de taille. Le corps de la requête vient du navigateur, donc de
 * n'importe qui possédant un compte : sans plafond, un seul appel pourrait
 * envoyer un mégaoctet de contexte et coûter le prix de cent.
 */
const LIMITS = {
  question: 2_000,
  context: 12_000,
  historyTurns: 10,
  historyChars: 4_000,
};

type Action =
  | 'assistant'
  | 'search'
  | 'review-starters'
  | 'review-continue'
  | 'discover-query'
  | 'recommend'
  | 'portrait'
  | 'space-pitch';
type Role = 'user' | 'assistant';
interface Turn {
  role: Role;
  content: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/**
 * Une erreur que le client saura traduire.
 *
 * Le `code` existe pour que l'application choisisse son message sans avoir à
 * reconnaître une phrase : « plus de crédit aujourd'hui » et « le service est
 * tombé » n'appellent pas la même réaction de la part de celui qui lit.
 */
const fail = (status: number, code: string, message: string) => json({ code, message }, status);

const clamp = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.slice(0, max) : '';

/** Le contexte du profil est bâti côté application ; on ne fait que le cadrer. */
const persona = (firstName: string, context: string) => `Tu es le Ciné-Assistant de « The Bitter », expert cinéma passionné et légèrement piquant.

STYLE DE RÉPONSE :
- Parle NATURELLEMENT comme un vrai conseiller ciné
- Tutoie l'utilisateur
- Utilise **Titre du Film** pour mettre en gras les films importants
- Utilise des émojis si ça fait sens (🎬 🔥 etc.)
- Reste conversationnel et fluide

TES REPÈRES :
- Base tes recommandations sur le PROFIL et l'HISTORIQUE de ${firstName}
- Les catalogues de streaming et les films similaires fournis ci-dessous viennent
  d'être relevés : ce sont des faits, appuie-toi dessus plutôt que sur ta mémoire
- Si tu recommandes, EXPLIQUE pourquoi ça correspond à son profil

RÈGLES :
- Maximum 150 mots par réponse
- Sois précis : cite des titres réels, pas des généralités
- Si tu ne sais pas, dis-le honnêtement. N'invente jamais une date, une
  disponibilité ou un casting : mieux vaut l'admettre que se tromper avec aplomb

${context}`;

const searchPersona = (context: string) => `Tu es un expert cinéma. Réponds naturellement, en français, en 200 mots maximum.
Utilise **titre** pour mettre en gras les films importants.

Les fiches ci-dessous viennent d'être relevées dans la base TMDB : elles font foi
sur les titres, les années et les résumés. Si la question porte sur un point
qu'elles ne couvrent pas et dont tu n'es pas certain, dis-le franchement plutôt
que de l'inventer.

${context}`;

/**
 * Amorces d'avis.
 *
 * La difficulté est de tenir deux exigences qui semblent s'opposer. Une amorce
 * doit donner envie d'écrire — donc porter de l'élan — sans décider à la place
 * de son auteur.
 *
 * Une première version interdisait tout jugement. Le modèle a obéi en rendant
 * des cases grammaticales vides : « L'histoire m'a », « Visuellement, c'est ».
 * Neutres, et parfaitement inertes : rien là-dedans ne donne envie de finir la
 * phrase.
 *
 * Ce qui débloque le problème, c'est que la note contient déjà un verdict, et
 * que ce verdict est celui de l'auteur. Un 9 sur l'image dit qu'il a été bluffé ;
 * le lui rappeler ne lui met rien dans la bouche. Ce qui doit lui rester, c'est
 * la RAISON. D'où la règle : l'amorce porte l'intensité que la note a posée,
 * jamais son motif.
 *
 * Et l'élan tient à un détail de forme : une amorce qui s'arrête sur « quand »
 * ou « au moment où » tire beaucoup plus fort qu'une qui s'arrête sur un verbe.
 * Le mot suspendu réclame une suite précise, et c'est cette précision qui fait
 * qu'on se met à écrire.
 */
const startersPersona = (context: string) => `Tu aides quelqu'un à commencer l'avis qu'il va écrire sur un film qu'il vient de noter.

Tu produis TROIS amorces de phrase en français, de 4 à 7 mots chacune.

RÈGLE 1 — Tu portes son ÉLAN, jamais sa RAISON.
Ses notes disent déjà s'il a aimé ou non : ce verdict est le sien, tu peux t'y
appuyer. Ce que tu ne peux JAMAIS faire, c'est dire POURQUOI.
- « J'ai décroché au moment où » → correct, le moment lui appartient
- « J'ai décroché à cause du rythme » → interdit, tu as trouvé la raison à sa place
- « Ce qui m'a scotché, c'est » → correct
- « Ce qui m'a scotché, c'est la photo » → interdit

RÈGLE 2 — Chaque amorce commence par une ACTION ou une SENSATION, à la première
personne et au passé. Jamais une case vide comme « L'histoire m'a » ou
« Visuellement, c'est » : ça n'engage à rien, donc personne ne le complète.

RÈGLE 3 — Chaque amorce se termine sur un mot qui RÉCLAME une suite précise :
« quand », « au moment où », « c'est », « parce que », « sauf », « jusqu'à ».
Un mot suspendu tire plus fort qu'un verbe suspendu.

ACCORDE LE TON À SES NOTES :
- Critère noté 8 à 10 → verbe d'enthousiasme
  « J'en ai pris plein les yeux quand » · « Je n'ai pas lâché à partir de »
- Critère noté 0 à 4 → verbe de déception
  « J'ai décroché au moment où » · « Je n'ai jamais cru à »
- Critère noté 5 à 7 → verbe d'hésitation
  « J'ai hésité jusqu'à » · « Ça tenait, sauf quand »

Les trois amorces visent trois critères différents, en commençant par celui dont
la note s'écarte le plus de la moyenne : c'est là qu'il a le plus à dire.

Pas de guillemets, pas de numéro, pas de point final.

Réponds UNIQUEMENT par un objet JSON de la forme :
{"starters": ["amorce une", "amorce deux", "amorce trois"]}

${context}`;

/**
 * Prolongement d'un avis en cours.
 *
 * Une seule phrase, et jamais la dernière : c'est ce qui garde l'auteur aux
 * commandes. Deux phrases d'un coup, et il relit au lieu d'écrire ; une phrase
 * qui conclut, et il n'a plus qu'à valider un texte qui n'est pas le sien.
 */
const continuePersona = (context: string) => `Quelqu'un est en train d'écrire son avis sur un film. Tu ajoutes UNE SEULE phrase à la suite de ce qu'il a déjà écrit.

RÈGLES ABSOLUES :
- UNE phrase. Jamais deux. Jamais un paragraphe.
- Elle prolonge SON idée dans SA direction. Tu ne changes pas de sujet, tu ne le
  contredis pas, tu ne résumes pas ce qu'il vient de dire.
- Tu reprends son niveau de langue, son rythme et son ton. S'il est sec, sois sec.
  S'il est familier, sois familier. Tu n'écris pas mieux que lui, tu écris comme lui.
- Tu ne CONCLUS JAMAIS. Ta phrase laisse la suite ouverte : c'est à lui de finir
  son avis, pas à toi.
- N'invente aucun fait sur le film : ni acteur, ni scène, ni date. Tu prolonges
  une impression, tu ne racontes pas le film.

Réponds UNIQUEMENT par la phrase, sans guillemets et sans introduction.

${context}`;

/**
 * Traduction d'une envie en filtres de recherche.
 *
 * Le modèle ne choisit aucun film et n'écrit aucune phrase : il ne produit que
 * des critères, et c'est TMDB qui répond. Rien ne peut donc être inventé — le
 * pire qu'il puisse faire est de mal comprendre, ce qui se voit immédiatement
 * puisqu'il doit résumer ce qu'il a retenu.
 *
 * La règle la plus importante est celle du silence : un champ que la phrase ne
 * demande pas reste vide. Un filtre ajouté de sa propre initiative écarterait
 * des films pour une raison que personne n'a donnée, et l'absence ne se voit
 * pas — on ne peut pas regretter ce qu'on ne nous a jamais montré.
 */
const discoverPersona = (year: number, context: string) => `Tu traduis l'envie d'un spectateur en filtres de recherche pour la base TMDB.

Tu ne recommandes aucun film et tu n'écris aucune explication : tu produis
uniquement des critères. C'est TMDB qui choisira les titres.

GENRES DISPONIBLES (identifiant — nom) :
28 Action · 12 Aventure · 16 Animation · 35 Comédie · 80 Crime · 99 Documentaire
18 Drame · 10751 Familial · 14 Fantastique · 36 Histoire · 27 Horreur
10402 Musique · 9648 Mystère · 10749 Romance · 878 Science-Fiction · 53 Thriller
10752 Guerre · 37 Western

PLATEFORMES : netflix · prime · disney · canal

RÈGLE PRINCIPALE — ne remplis QUE ce que la phrase demande.
Tout champ non évoqué vaut null. Un filtre ajouté de ta propre initiative écarte
des films pour une raison que personne n'a donnée, et personne ne s'en apercevra.

TRADUCTIONS COURANTES :
- « pas prise de tête », « léger » → genres 35, 12 ou 16, et exclure 18
- « pas trop long » → runtime_lte 110 · « court » → 95 · « long » → runtime_gte 140
- « récent » → year_gte ${year - 3} · « des années 90 » → year_gte 1990, year_lte 1999
- « bien noté », « une valeur sûre » → vote_average_gte 7
- « à deux », « en famille », « entre potes » décrivent une situation : traduis-la
  en genres, jamais en note ni en durée
- « qui fait peur » → 27 · « qui fait réfléchir » → 18, 99 ou 9648

Le champ summary contient 2 à 5 fragments courts en français, séparés par « · »,
qui décrivent EXACTEMENT les filtres posés — c'est ce que le spectateur relira
pour vérifier que tu l'as compris. Rien d'autre, aucune phrase.

Réponds UNIQUEMENT par un objet JSON de cette forme :
{"summary":"comédie · moins de 1h50","media_type":"movie","with_genres":[35],
"without_genres":[18],"runtime_lte":110,"runtime_gte":null,"year_gte":null,
"year_lte":null,"vote_average_gte":null,"provider":null,"sort_by":"popularity.desc"}

sort_by vaut "popularity.desc", "vote_average.desc" ou "primary_release_date.desc".

${context}`;

/**
 * Recommandations personnelles.
 *
 * L'écran existant s'annonçait « IA » mais interrogeait les recommandations
 * TMDB, c'est-à-dire du « ceux qui ont aimé X ont aimé Y ». C'est utile, et
 * parfaitement aveugle au POURQUOI on a aimé X. Un modèle qui lit la grille de
 * notation voit autre chose : que la personne pardonne un scénario faible quand
 * l'image est belle, ou l'inverse. Il peut donc proposer des titres qu'aucun
 * graphe de co-visionnage ne relierait aux siens.
 *
 * Et surtout il peut dire pourquoi. C'est là tout le produit : cinq affiches
 * sans justification ne valent pas mieux que la liste d'avant. La consigne
 * insiste donc pour que la raison s'appuie sur SES notes, et non sur les
 * qualités du film en général — « un chef-d'œuvre incontournable » ne dit rien
 * à personne.
 *
 * Les titres inventés ne sont pas un risque : chacun est ensuite cherché dans
 * TMDB, et ce qui ne s'y trouve pas ne s'affiche pas.
 */
const recommendPersona = (context: string) => `Tu recommandes des films à quelqu'un dont tu connais les notes détaillées, critère par critère.

Tu produis CINQ films, chacun avec une raison d'UNE phrase.

CE QUI FAIT LA VALEUR D'UNE RECOMMANDATION ICI :
- La raison s'appuie sur SES notes à lui, jamais sur la réputation du film.
  « Tu as mis 9 au scénario de X et 4 à son image : celui-ci fait l'inverse »
  vaut mille fois « un chef-d'œuvre incontournable ».
- Cherche ce qui relie ses meilleures notes entre elles, et propose des films qui
  prolongent ce lien. Rester dans le même genre est le réflexe paresseux : ses
  notes disent souvent qu'il aime une QUALITÉ, pas une étiquette.
- Ses notes basses comptent autant : elles disent ce qu'il ne pardonne pas.

RÈGLES :
- Ne propose AUCUN film de la liste des déjà-vus et déjà-en-attente ci-dessous.
- N'invente aucun titre. Dans le doute sur l'existence d'un film, prends-en un autre.
- Varie : pas cinq films de la même décennie, ni du même pays.
- La raison fait 25 mots maximum, en français, en tutoyant.

Réponds UNIQUEMENT par un objet JSON de la forme :
{"recommendations":[{"title":"Titre exact","year":1999,"reason":"..."}]}

${context}`;

/**
 * Portrait de goût.
 *
 * Le danger d'une telle fonction porte un nom : l'horoscope. Une phrase
 * inventée sur quelqu'un se lit exactement comme une phrase vraie, et rien à
 * l'écran ne permet de les distinguer — sauf le chiffre qui la soutient.
 *
 * D'où le partage des rôles : l'application calcule, le modèle rédige. Il ne
 * reçoit que des moyennes et des corrélations, et chaque observation doit citer
 * l'une d'elles. Ce n'est pas une précaution de style : c'est ce qui rend le
 * portrait vérifiable par celui qu'il décrit.
 *
 * La corrélation est la donnée la plus intéressante du lot, et la seule que
 * personne ne peut calculer de tête : une moyenne haute ne dit pas qu'un critère
 * compte, elle dit qu'on le note généreusement. C'est la variation conjointe qui
 * révèle ce sur quoi la note se décide vraiment.
 */
const portraitPersona = (context: string) => `Tu écris le portrait de quelqu'un à partir de ses statistiques de notation de films.

Tu produis TROIS observations. Chacune fait une phrase de 20 mots maximum, en
français, en tutoyant.

RÈGLE ABSOLUE — chaque observation s'appuie sur UN chiffre du relevé ci-dessous,
et ce chiffre apparaît dans la phrase. Tu n'as pas le droit d'affirmer quoi que
ce soit que les chiffres ne montrent pas. Un trait de caractère inventé se lit
comme un trait réel : c'est exactement ce qu'il faut éviter ici.

CE QUI FAIT UNE BONNE OBSERVATION :
- Elle dit quelque chose que la personne ne peut pas voir seule. La corrélation
  est ta meilleure alliée : elle révèle le critère sur lequel la note se décide
  vraiment, qui n'est presque jamais celui qu'on note le plus haut.
- Un écart entre deux chiffres vaut mieux qu'un chiffre seul : « tu notes les
  films longs 1,4 point en dessous des courts » dit plus que « tu aimes le court ».
- Elle est concrète et un peu piquante, jamais flatteuse ni vexante. Un constat,
  pas un compliment.

INTERDIT :
- Parler de films que le relevé ne mentionne pas.
- Employer « peut-être », « sans doute », « il semble » : soit le chiffre le dit,
  soit tu changes d'observation.
- Répéter deux fois la même donnée sous deux formulations.

Réponds UNIQUEMENT par un objet JSON de la forme :
{"traits":[{"text":"...","figure":"6,8/10"},{"text":"...","figure":"..."}]}

Le champ figure reprend le chiffre cité, très court, pour être affiché à côté.

${context}`;

/**
 * Argumentaire d'une proposition, membre par membre.
 *
 * Dans l'espace partagé de l'application, deux films ont été proposés pour six
 * votes. Un film posé sans un mot ne déclenche rien : celui qui le voit ne sait
 * pas si on le lui destine, et dans le doute il passe.
 *
 * L'argument doit donc s'adresser à chacun séparément, et se fonder sur ses
 * notes à lui. Un même film ne se vend pas de la même façon à quelqu'un qui met
 * 9 à l'image et à quelqu'un qui ne pardonne rien au scénario — et c'est
 * précisément cette différence qui fait qu'on clique.
 *
 * L'honnêteté prime sur l'enthousiasme : dire à un membre que le film n'est
 * probablement pas pour lui vaut mieux que trois arguments identiques. Une
 * recommandation qui ne sait pas dire non ne veut plus rien dire quand elle dit
 * oui.
 */
const pitchPersona = (context: string) => `Un film vient d'être proposé à un groupe. Tu écris, pour CHAQUE membre, une phrase qui lui dit si ce film est pour lui.

Une phrase par membre, 20 mots maximum, en français, en tutoyant.

RÈGLES :
- Chaque phrase s'appuie sur LES NOTES DE CE MEMBRE, pas sur les qualités
  générales du film. Le même film ne se défend pas pareil auprès de quelqu'un qui
  note l'image haut et de quelqu'un qui ne pardonne rien au scénario.
- Si le film ne correspond visiblement pas à quelqu'un, DIS-LE. Un argumentaire
  qui ne sait pas dire non ne veut plus rien dire quand il dit oui.
- N'invente aucun fait sur le film : appuie-toi sur le résumé fourni, ou reste
  sur ce que ses notes à lui laissent attendre.
- Pas de superlatif creux : « incontournable », « chef-d'œuvre » ne disent rien
  à personne.

Réponds UNIQUEMENT par un objet JSON de la forme :
{"pitches":[{"name":"Prénom exact","text":"..."}]}

Reprends les prénoms exactement comme ils apparaissent ci-dessous.

${context}`;

/** Réglages propres à chaque usage : longueur et liberté n'ont rien à voir. */
const TUNING: Record<Action, { temperature: number; maxTokens: number; json: boolean }> = {
  assistant: { temperature: 0.8, maxTokens: 700, json: false },
  search: { temperature: 0.4, maxTokens: 700, json: false },
  'review-starters': { temperature: 1.0, maxTokens: 200, json: true },
  'review-continue': { temperature: 0.7, maxTokens: 120, json: false },
  'discover-query': { temperature: 0.2, maxTokens: 300, json: true },
  recommend: { temperature: 0.9, maxTokens: 800, json: true },
  portrait: { temperature: 0.8, maxTokens: 400, json: true },
  'space-pitch': { temperature: 0.8, maxTokens: 400, json: true },
};

const isAction = (value: unknown): value is Action =>
  value === 'assistant' ||
  value === 'search' ||
  value === 'review-starters' ||
  value === 'review-continue' ||
  value === 'discover-query' ||
  value === 'recommend' ||
  value === 'portrait' ||
  value === 'space-pitch';

/** Genres TMDB acceptés. Tout le reste est écarté avant de bâtir une requête. */
const GENRE_IDS = new Set([
  28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 53, 10752, 37,
]);

const PROVIDERS = new Set(['netflix', 'prime', 'disney', 'canal']);
const SORTS = new Set(['popularity.desc', 'vote_average.desc', 'primary_release_date.desc']);

/**
 * Filtre et borne ce que le modèle a produit.
 *
 * Ces valeurs finiront dans une URL appelée par l'application : les accepter
 * telles quelles reviendrait à laisser un texte généré composer nos requêtes.
 * Tout ce qui n'est pas reconnu est écarté plutôt que corrigé — un genre
 * inventé ne se devine pas, et une requête sans lui reste utile.
 */
const parseDiscover = (raw: string) => {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  /**
   * L'absence doit rester l'absence.
   *
   * `Number(null)` vaut 0 et `Number.isFinite(0)` vaut vrai : sans ce premier
   * test, chaque champ laissé vide par le modèle — c'est-à-dire la majorité,
   * puisque la consigne lui demande de ne rien inventer — devenait la borne
   * basse. Toute recherche partait donc avec « durée comprise entre 40 et 40
   * minutes », et ne rendait jamais rien.
   */
  const num = (value: unknown, min: number, max: number): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.min(max, Math.max(min, Math.round(n * 10) / 10));
  };

  const genres = (value: unknown): number[] =>
    Array.isArray(value) ? value.map(Number).filter((n) => GENRE_IDS.has(n)).slice(0, 4) : [];

  const provider = typeof parsed.provider === 'string' ? parsed.provider.toLowerCase() : '';
  const sort = typeof parsed.sort_by === 'string' ? parsed.sort_by : '';

  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 120) : '',
    mediaType: parsed.media_type === 'tv' ? 'tv' : 'movie',
    withGenres: genres(parsed.with_genres),
    withoutGenres: genres(parsed.without_genres),
    runtimeLte: num(parsed.runtime_lte, 40, 400),
    runtimeGte: num(parsed.runtime_gte, 40, 400),
    yearGte: num(parsed.year_gte, 1900, 2100),
    yearLte: num(parsed.year_lte, 1900, 2100),
    voteAverageGte: num(parsed.vote_average_gte, 0, 10),
    provider: PROVIDERS.has(provider) ? provider : null,
    sortBy: SORTS.has(sort) ? sort : 'popularity.desc',
  };
};

/** Les trois traits du portrait, chacun avec le chiffre qui le soutient. */
const parseTraits = (raw: string) => {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const list = Array.isArray(parsed) ? parsed : parsed?.traits;
  if (!Array.isArray(list)) return [];

  return list
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      text: typeof item.text === 'string' ? item.text.slice(0, 200).trim() : '',
      figure: typeof item.figure === 'string' ? item.figure.slice(0, 24).trim() : '',
    }))
    .filter((item) => item.text.length > 0)
    .slice(0, 3);
};

/** Un argument par membre. Les prénoms seront réappariés côté application. */
const parsePitches = (raw: string) => {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const list = Array.isArray(parsed) ? parsed : parsed?.pitches;
  if (!Array.isArray(list)) return [];

  return list
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      name: typeof item.name === 'string' ? item.name.slice(0, 60).trim() : '',
      text: typeof item.text === 'string' ? item.text.slice(0, 200).trim() : '',
    }))
    .filter((item) => item.name.length > 0 && item.text.length > 0)
    .slice(0, 10);
};

/**
 * Lit les cinq propositions.
 *
 * Aucune vérification d'existence ici : c'est TMDB qui tranchera, puisque le
 * client cherche chaque titre avant de l'afficher. Un film inventé ne trouvera
 * pas de fiche et disparaîtra tout seul — mieux vaut cette sélection naturelle
 * qu'une liste blanche impossible à tenir.
 */
const parseRecommendations = (raw: string) => {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const list = Array.isArray(parsed) ? parsed : parsed?.recommendations;
  if (!Array.isArray(list)) return [];

  return list
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => {
      const year = Number(item.year);
      return {
        title: typeof item.title === 'string' ? item.title.slice(0, 120).trim() : '',
        year: Number.isFinite(year) && year > 1880 && year < 2100 ? year : null,
        reason: typeof item.reason === 'string' ? item.reason.slice(0, 240).trim() : '',
      };
    })
    .filter((item) => item.title.length > 0)
    .slice(0, 5);
};

/**
 * Extrait les amorces d'une réponse qui devrait être du JSON.
 *
 * Le mode JSON de Mistral rend l'objet attendu dans l'immense majorité des cas,
 * mais une seule réponse mal formée suffirait à afficher un champ vide au moment
 * précis où l'on cherchait à éviter la page blanche. D'où le repli sur un
 * découpage ligne à ligne : mieux vaut trois amorces imparfaites que rien.
 */
const parseStarters = (raw: string): string[] => {
  const clean = (s: string) =>
    s
      .replace(/^\s*[-*\d.)\]]+\s*/, '')
      .replace(/^["'«»\s]+|["'«»\s]+$/g, '')
      .trim();

  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed?.starters;
    if (Array.isArray(list)) {
      const out = list.filter((s) => typeof s === 'string').map(clean).filter(Boolean);
      if (out.length) return out.slice(0, 3);
    }
  } catch {
    // Pas du JSON : on retombe sur le découpage ci-dessous.
  }

  return raw
    .split('\n')
    .map(clean)
    .filter((s) => s.length > 2 && s.length < 120)
    .slice(0, 3);
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method', 'Méthode non autorisée.');

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SB_PUBLISHABLE_KEY') ?? '';
  const serviceKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SB_SECRET_KEY') ?? '';

  // La vérification du JWT par la plateforme ne suffit pas : la clé anonyme est
  // elle-même un JWT valide et elle est publique. Il faut donc résoudre la
  // session pour savoir si l'appelant est quelqu'un, et non seulement quelque chose.
  const authHeader = req.headers.get('Authorization') ?? '';
  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await asCaller.auth.getUser();
  const user = userData?.user;
  if (userError || !user) {
    return fail(401, 'unauthenticated', 'Connecte-toi pour utiliser le Ciné-Assistant.');
  }

  // L'état de la configuration n'est révélé qu'après l'authentification : un
  // inconnu n'a pas à apprendre si la clé est posée ou non, il n'obtient que
  // le même 401 dans tous les cas.
  const apiKey = Deno.env.get('MISTRAL_API_KEY');
  if (!apiKey) {
    // Volontairement explicite dans les journaux : c'est l'erreur du premier
    // déploiement, et la deviner coûte bien plus cher que de l'annoncer.
    console.error('[ai] MISTRAL_API_KEY absente des secrets de la fonction.');
    return fail(503, 'misconfigured', "L'assistant n'est pas encore configuré.");
  }

  // La requête est validée avant d'être comptée : sinon un corps malformé
  // consommerait un appel du quota sans qu'aucune question n'ait été posée.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'bad_request', 'Requête illisible.');
  }

  const action: Action = isAction(body.action) ? body.action : 'assistant';
  const context = clamp(body.context, LIMITS.context);
  const question = clamp(body.question ?? body.query ?? body.text, LIMITS.question).trim();
  if (!question) return fail(400, 'bad_request', 'Question vide.');

  const limit = Number(Deno.env.get('AI_DAILY_LIMIT') ?? DEFAULT_DAILY_LIMIT);
  const asService = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: quota, error: quotaError } = await asService.rpc('consume_ai_quota', {
    p_user: user.id,
    p_limit: limit,
  });

  const row = Array.isArray(quota) ? quota[0] : quota;

  // Fermé par défaut : compteur en panne ou réponse vide, on refuse. Laisser
  // passer serait revenir précisément à la clé sans plafond qu'on voulait fuir.
  if (quotaError || !row) {
    console.error('[ai] consume_ai_quota :', quotaError?.message ?? 'aucune ligne renvoyée');
    return fail(503, 'upstream', "L'assistant est momentanément indisponible.");
  }

  if (row.allowed === false) {
    return fail(
      429,
      'quota',
      `Tu as atteint tes ${row.quota} questions du jour. Ça repart demain.`
    );
  }

  const messages: { role: 'system' | Role; content: string }[] = [];

  if (action === 'search') {
    messages.push({ role: 'system', content: searchPersona(context) });
  } else if (action === 'review-starters') {
    messages.push({ role: 'system', content: startersPersona(context) });
  } else if (action === 'review-continue') {
    messages.push({ role: 'system', content: continuePersona(context) });
  } else if (action === 'portrait') {
    messages.push({ role: 'system', content: portraitPersona(context) });
  } else if (action === 'space-pitch') {
    messages.push({ role: 'system', content: pitchPersona(context) });
  } else if (action === 'recommend') {
    messages.push({ role: 'system', content: recommendPersona(context) });
  } else if (action === 'discover-query') {
    messages.push({
      role: 'system',
      content: discoverPersona(new Date().getUTCFullYear(), context),
    });
  } else {
    const firstName = clamp(body.firstName, 60) || 'toi';
    messages.push({ role: 'system', content: persona(firstName, context) });

    // On ne garde que la fin de la conversation : le début n'influence presque
    // plus la réponse mais se paie à chaque tour.
    const history = Array.isArray(body.history) ? (body.history as Turn[]) : [];
    for (const turn of history.slice(-LIMITS.historyTurns)) {
      const role: Role = turn?.role === 'assistant' ? 'assistant' : 'user';
      const content = clamp(turn?.content, LIMITS.historyChars);
      if (content) messages.push({ role, content });
    }
  }

  messages.push({ role: 'user', content: question });

  const tuning = TUNING[action];
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(MISTRAL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('MISTRAL_MODEL') ?? DEFAULT_MODEL,
        messages,
        temperature: tuning.temperature,
        max_tokens: tuning.maxTokens,
        ...(tuning.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: abort.signal,
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      console.error(`[ai] Mistral ${upstream.status} : ${detail.slice(0, 400)}`);

      // 401 côté Mistral veut dire que la clé est mauvaise ou révoquée. C'est un
      // problème de configuration, pas une panne : le distinguer évite de
      // chercher une panne réseau pendant une heure.
      if (upstream.status === 401 || upstream.status === 403) {
        return fail(503, 'misconfigured', "La clé de l'assistant a été refusée.");
      }
      if (upstream.status === 429) {
        return fail(429, 'quota', "L'assistant est saturé, réessaie dans un instant.");
      }
      return fail(502, 'upstream', "L'assistant n'a pas répondu.");
    }

    const payload = await upstream.json();
    const text: string = payload?.choices?.[0]?.message?.content ?? '';
    if (!text.trim()) return fail(502, 'upstream', "L'assistant n'a rien répondu.");

    if (action === 'review-starters') {
      const starters = parseStarters(text);
      if (starters.length === 0) return fail(502, 'upstream', "Aucune amorce n'a pu être lue.");
      return json({ starters, usage: payload?.usage ?? null });
    }

    if (action === 'portrait') {
      const traits = parseTraits(text);
      if (traits.length === 0) return fail(502, 'upstream', 'Portrait illisible.');
      return json({ traits, usage: payload?.usage ?? null });
    }

    if (action === 'space-pitch') {
      const pitches = parsePitches(text);
      if (pitches.length === 0) return fail(502, 'upstream', 'Argumentaire illisible.');
      return json({ pitches, usage: payload?.usage ?? null });
    }

    if (action === 'recommend') {
      const picks = parseRecommendations(text);
      if (picks.length === 0) return fail(502, 'upstream', 'Aucune recommandation lisible.');
      return json({ recommendations: picks, usage: payload?.usage ?? null });
    }

    if (action === 'discover-query') {
      const filters = parseDiscover(text);
      if (!filters) return fail(502, 'upstream', "L'envie n'a pas pu être traduite.");
      return json({ filters, usage: payload?.usage ?? null });
    }

    if (action === 'review-continue') {
      // Une phrase, et une seule : le modèle en donne parfois deux malgré la
      // consigne, et c'est justement ce qui ferait basculer l'auteur du rôle de
      // rédacteur à celui de relecteur. On coupe plutôt que d'espérer.
      const first = text.trim().replace(/^["'«»\s]+/, '');
      const cut = first.search(/[.!?…](\s|$)/);
      const single = cut === -1 ? first : first.slice(0, cut + 1);
      return json({ text: single.trim(), usage: payload?.usage ?? null });
    }

    return json({ text, usage: payload?.usage ?? null });
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    console.error('[ai] Appel Mistral échoué :', aborted ? 'délai dépassé' : String(error));
    return aborted
      ? fail(504, 'timeout', "L'assistant met trop de temps à répondre.")
      : fail(502, 'upstream', "L'assistant est injoignable.");
  } finally {
    clearTimeout(timer);
  }
});
