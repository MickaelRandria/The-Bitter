import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Le quiz sans IA de la fonction Edge `series-trivia`, transpilé tel quel. */
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => ({}));
  return exports;
}

const { buildDataQuiz, MIN_DATA_QUESTIONS } = load('../supabase/functions/series-trivia/quiz.ts');

const breakingBad = {
  title: 'Breaking Bad',
  creators: ['Vince Gilligan'],
  composers: ['Dave Porter'],
  networks: ['AMC'],
  locations: ['Albuquerque', '3828 Piermont Drive Northeast'],
  countries: ['États-Unis'],
  awards: ['Peabody Awards', 'Primetime Emmy Award de la meilleure série télévisée dramatique', 'Q12345'],
  year: 2008,
  cast: [
    { character: 'Walter White', actor: 'Bryan Cranston' },
    { character: 'Jesse Pinkman', actor: 'Aaron Paul' },
    { character: 'Skyler White', actor: 'Anna Gunn' },
    { character: 'Himself', actor: 'Someone' },
  ],
};

test('enough questions for several rounds from data alone', () => {
  const quiz = buildDataQuiz(breakingBad, 'fr');
  assert.ok(quiz.length >= 2 * MIN_DATA_QUESTIONS, `seulement ${quiz.length} questions`);
  for (const q of quiz) {
    assert.equal(q.options.length, 3);
    assert.equal(new Set(q.options).size, 3);
    assert.ok(q.answer >= 0 && q.answer <= 2);
    assert.equal(q.origin, 'data');
  }
});

test('the right answer is where the answer index says', () => {
  const quiz = buildDataQuiz(breakingBad, 'fr');
  const creator = quiz.find((q) => q.question.startsWith('Qui a créé'));
  assert.equal(creator.options[creator.answer], 'Vince Gilligan');
  const walter = quiz.find((q) => q.question.includes('Walter White'));
  if (walter) assert.equal(walter.options[walter.answer], 'Bryan Cranston');
  const year = quiz.find((q) => q.question.startsWith('En quelle année'));
  assert.equal(year.options[year.answer], '2008');
});

test('addresses, bare identifiers and "Himself" never become answers', () => {
  const text = JSON.stringify(buildDataQuiz(breakingBad, 'fr'));
  assert.doesNotMatch(text, /Piermont/);
  assert.doesNotMatch(text, /Q12345/);
  assert.doesNotMatch(text, /Himself/);
});

test('a wrong option is never another true answer, nor a near-duplicate', () => {
  const quiz = buildDataQuiz(
    { ...breakingBad, title: 'X', networks: ['Apple TV'], creators: ['Baran bo Odar', 'Jantje Friese'], cast: [] },
    'fr'
  );
  const network = quiz.find((q) => q.question.startsWith('Sur quelle'));
  assert.ok(!network.options.some((o, i) => i !== network.answer && /apple/i.test(o)));
  const creator = quiz.find((q) => q.question.startsWith('Qui a créé'));
  assert.ok(!creator.options.includes('Jantje Friese') || creator.options[creator.answer] === 'Jantje Friese');
});

test('the same series always gives the same quiz', () => {
  assert.deepEqual(buildDataQuiz(breakingBad, 'fr'), buildDataQuiz(breakingBad, 'fr'));
});

test('a US show gets no country question, a German one does', () => {
  assert.ok(!buildDataQuiz(breakingBad, 'fr').some((q) => q.question.startsWith('De quel pays')));
  const dark = buildDataQuiz({ ...breakingBad, title: 'Dark', countries: ['Allemagne'] }, 'fr');
  const country = dark.find((q) => q.question.startsWith('De quel pays'));
  assert.equal(country.options[country.answer], 'Allemagne');
});

test('a series with almost nothing known yields too few questions for a round', () => {
  const quiz = buildDataQuiz(
    { title: 'Obscure', creators: [], composers: [], networks: ['Netflix'], locations: [], countries: [], awards: [], cast: [] },
    'fr'
  );
  assert.ok(quiz.length < MIN_DATA_QUESTIONS);
});
