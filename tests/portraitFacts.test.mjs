import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Les constats du portrait : calculés par l'app, jamais par le modèle. */
function load(relative, deps = {}) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, (name) => {
    if (deps[name]) return deps[name];
    throw new Error(`Dépendance inattendue : ${name}`);
  });
  return exports;
}
const verdict = load('../utils/verdict.ts');
const { computeFacts, describeFact, cleanSentence, MIN_FILMS } = load('../utils/portraitFacts.ts', { './verdict': verdict });
const NOW = Date.UTC(2026, 9, 12);

const film = (i, o = {}) => ({ id: `f${i}`, title: `Film ${i}`, score: 7, criteria: null, at: NOW - i * 864e5, ...o });

test('pas de portrait sous le seuil', () => {
  assert.deepEqual(computeFacts(Array.from({ length: MIN_FILMS - 1 }, (_, i) => film(i, { score: 5 + (i % 5) })), NOW), []);
});

test('critère décisif : le scénario suit la note, les autres non', () => {
  const films = Array.from({ length: 12 }, (_, i) => {
    const s = i % 2 ? 9 : 5;
    return film(i, { score: s, criteria: { story: s, visuals: 7 + (i % 3) - 1, acting: 7, sound: i % 4 < 2 ? 6 : 8 } });
  });
  const facts = computeFacts(films, NOW);
  const decisive = facts.find((f) => f.kind === 'decisive');
  assert.ok(decisive, 'constat décisif attendu');
  assert.equal(decisive.figure, '10 sur 10');
  assert.match(decisive.fallback, /scénario/);
  assert.equal(decisive.evidence.length, 2);
});

test('films longs : écart négatif, avec l’exception comme second film', () => {
  const films = [
    ...[0, 1, 2].map((i) => film(i, { runtime: 160, score: 5 })),
    film(3, { runtime: 170, score: 9.4 }),
    ...[4, 5, 6, 7].map((i) => film(i, { runtime: 95, score: 8 })),
    ...[8, 9, 10].map((i) => film(i, { runtime: 120, score: 7 })),
  ];
  const fact = computeFacts(films, NOW).find((f) => f.kind === 'length');
  assert.ok(fact);
  assert.ok(fact.figure.startsWith('−'));
  assert.equal(fact.evidence[1].id, 'f3');
  assert.match(fact.evidence[1].detail, /exception/);
});

test("au plus trois constats, jamais public et genre-public ensemble, une demande par constat", () => {
  const films = Array.from({ length: 20 }, (_, i) => film(i, {
    score: i < 10 ? 9 : 5, publicScore: 7, genre: i < 10 ? 'Drame' : 'Action', director: i < 4 ? 'Céline Sciamma' : 'X',
    runtime: i < 10 ? 95 : 150,
    criteria: { story: i < 10 ? 9 : 5, visuals: 7, acting: 7, sound: 4 },
  }));
  const facts = computeFacts(films, NOW);
  assert.ok(facts.length <= 3 && facts.length >= 1);
  const kinds = facts.map((f) => f.kind);
  assert.ok(!(kinds.includes('public') && kinds.includes('genrePublic')));
  const text = describeFact(facts[0]);
  assert.match(text, /Constat : /);
  assert.ok(text.includes(facts[0].figure));
});

test('phrase du modèle : nettoyée, et refusée si elle invente un nombre', () => {
  const fact = { claim: 'Tes films de 2h20 et plus ont une note inférieure de 1,4 point.', figure: '−1,4 pt' };
  assert.equal(cleanSentence('**Au-delà de 2h20**, un film te coûte 1,4 point', fact), 'Au-delà de 2h20, un film te coûte 1,4 point.');
  assert.equal(cleanSentence('Tu donnes 1,8 point de plus aux films sortis après 2015', fact), null);
  assert.equal(cleanSentence('  « Les longs films te lassent. »  ', fact), 'Les longs films te lassent.');
  assert.equal(cleanSentence('', fact), null);
});
