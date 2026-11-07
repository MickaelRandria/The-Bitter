import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * « Ce qu'en dit Internet » : les chiffres et la vérification du résumé.
 * Module livré tel quel dans l'Edge Function `public-reviews`. Les formes de
 * réponse SensCritique et OMDb ont été relevées le 7 novembre 2026 (Dune :
 * deuxième partie, SensCritique 45424060).
 */
function load(relative) {
  const compiled = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => ({}));
  return exports;
}

const { positiveShare, parseOmdb, fromSensCritique, parseSummary, summaryPrompt, MIN_REVIEWS } = load('../supabase/functions/public-reviews/summary.ts');

test('positiveShare compte les critiques à 7/10 ou plus, et se tait sous 20 notes', () => {
  assert.deepEqual(positiveShare([9, 7, 1, 6, ...Array(20).fill(8)]), { share: 22 / 24, sampled: 24 });
  assert.deepEqual(positiveShare([9, 8, null, undefined, 0, 12]), { share: null, sampled: 2 });
});

test('parseOmdb lit IMDb, Rotten Tomatoes et Metacritic', () => {
  const body = {
    Response: 'True',
    imdbRating: '8.5',
    imdbVotes: '640,123',
    Metascore: '79',
    Ratings: [
      { Source: 'Internet Movie Database', Value: '8.5/10' },
      { Source: 'Rotten Tomatoes', Value: '92%' },
      { Source: 'Metacritic', Value: '79/100' },
    ],
  };
  assert.deepEqual(parseOmdb(body), { imdb: { rating: 8.5, votes: 640123 }, press: { rottenTomatoes: 92, metacritic: 79 } });
  assert.deepEqual(parseOmdb({ Response: 'True', imdbRating: 'N/A', Ratings: [] }), { imdb: null, press: null });
  assert.deepEqual(parseOmdb({ Response: 'False' }), { imdb: null, press: null });
});

test('fromSensCritique garde le titre de la critique devant son texte', () => {
  const s = fromSensCritique(
    { id: 278545164, title: 'Epic faith', bodyShort: 'Aux exécutifs qui se tapent la tête sur leurs tablettes, Dune 2 pourrait apporter une réponse.', rating: 9 },
    'https://www.senscritique.com/film/dune_deuxieme_partie/45424060'
  );
  assert.equal(s.id, 'S278545164');
  assert.equal(s.rating, 9);
  assert.ok(s.text.startsWith('Epic faith. Aux exécutifs'));
  assert.equal(fromSensCritique({ id: 1, bodyShort: 'Trop court.' }, 'x'), null);
});

const sources = [
  { id: 'S1', origin: 'senscritique', author: 'SensCritique', text: 'Epic faith. Des images de désert jamais vues, une musique qui vous cloue au siège.', rating: 9, url: 'https://sc/1' },
  { id: 'B2', origin: 'bluesky', author: '@maya.bsky.social', text: 'Je suis sortie de la salle en silence, la dernière demi-heure court un peu.', url: 'https://bsky/2' },
];

test('parseSummary garde les citations exactes et jette les inventées', () => {
  const raw = JSON.stringify({
    verdict: 'Un sommet visuel. Le dernier acte divise un peu.',
    overview: 'Presque tout le monde sort ébloui.',
    loved: ['Les images', 'La musique', 'Le souffle', 'Un quatrième de trop'],
    divides: ['Le dernier acte'],
    disappoints: [],
    criteria: { image: { tone: 'unanime', text: 'Saluée partout.' }, scenario: { tone: 'mitigé', text: 'x' }, interpretation: { tone: 'Divisé', text: 'Le casting partage.' }, sound: { tone: 'apprécié', text: 'Musique citée.' } },
    quotes: [
      { id: 'S1', text: '« Des images de désert jamais vues »' },
      { id: 'B2', text: 'Un chef-d’œuvre absolu de toute la décennie' },
      { id: 'S1', text: 'une musique qui vous cloue au siège' },
    ],
  });
  const s = parseSummary(raw, sources);
  assert.equal(s.verdict, 'Un sommet visuel. Le dernier acte divise un peu.');
  assert.equal(s.loved.length, 3);
  assert.deepEqual(Object.keys(s.criteria).sort(), ['image', 'interpretation', 'sound'], 'ton inconnu « mitigé » écarté ; « Divisé » et « apprécié » acceptés');
  assert.equal(s.criteria.interpretation.tone, 'divise');
  assert.equal(s.criteria.sound.tone, 'apprecie');
  assert.equal(s.quotes.length, 1, 'citation inventée et deuxième citation du même avis écartées');
  assert.equal(s.quotes[0].text, 'Des images de désert jamais vues');
  assert.equal(s.quotes[0].url, 'https://sc/1');
  assert.equal(parseSummary('pas du json', sources), null);
  assert.equal(parseSummary({ overview: 'sans verdict' }, sources), null);
});

test('summaryPrompt transmet les avis avec leur note, et demande la langue de l’app', () => {
  const { system, user } = summaryPrompt({ title: 'Dune', year: '2024' }, sources, 'en');
  assert.match(system, /Write in English/);
  assert.match(system, /no spoilers/);
  const payload = JSON.parse(user);
  assert.equal(payload.film, 'Dune (2024)');
  assert.deepEqual(payload.reviews[0], { id: 'S1', rating: '9/10', text: sources[0].text });
  assert.equal(MIN_REVIEWS, 30);
});

const { criterionFocus } = load('../utils/criterionFocus.ts');

const film = (weights, values, weighted) => ({
  status: 'watched',
  adaptiveRating: {
    weightedRating: weighted,
    criteria: ['scenario', 'image', 'interpretation', 'sound'].map((key, i) => ({ key, weight: weights[i], value: values[i] })),
  },
});

test('criterionFocus : le poids que je donne d’abord, sinon ce qui suit ma note, sinon rien', () => {
  assert.equal(criterionFocus(Array.from({ length: 6 }, () => film([1, 1.6, 1, 1], [7, 7, 7, 7], 7))), 'image');
  // Poids égaux : l'image suit la note finale, le reste est plat.
  const trend = Array.from({ length: 10 }, (_, i) => film([1, 1, 1, 1], [6, 3 + i * 0.6, 6, 6], 4 + i * 0.5));
  assert.equal(criterionFocus(trend), 'image');
  assert.equal(criterionFocus(Array.from({ length: 10 }, () => film([1, 1, 1, 1], [7, 7, 7, 7], 7))), null, 'rien de net');
  assert.equal(criterionFocus(Array.from({ length: 3 }, () => film([1, 2, 1, 1], [7, 7, 7, 7], 7))), null, 'trop peu de films');
  assert.equal(criterionFocus([{ status: 'watchlist' }]), null);
});
