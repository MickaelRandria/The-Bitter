import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** La logique de la fonction Edge `series-trivia`, transpilée telle quelle. */
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => ({}));
  return exports;
}

const { makingOfSections, nameTokens, introducedNames, mentionedSeason, parseTrivia, visibleTrivia } = load(
  '../supabase/functions/series-trivia/logic.ts'
);

const article = [
  'Intro paragraph that is long enough to be a real lead section of the article.',
  '== Premise ==',
  'Carmy inherits the sandwich shop after his brother dies, and everything goes wrong from there.',
  '== Production ==',
  '',
  '=== Development ===',
  'The series was created by Christopher Storer, who drew on his sister’s experience as a chef in Chicago.',
  '=== Season 2 ===',
  'Second-season filming moved to a real restaurant space in River North for several weeks.',
  '== Reception ==',
  '=== Season 2 ===',
  'Critics praised the second season, especially the episode where a major character leaves.',
  '== Music ==',
  'The soundtrack leans heavily on Wilco, Pearl Jam and R.E.M. needle drops across every episode.',
].join('\n');

test('only the making-of sections reach the model', () => {
  const text = makingOfSections(article, 10_000);
  assert.match(text, /Christopher Storer/);
  assert.match(text, /River North/); // « Season 2 » sous « Production »
  assert.match(text, /Wilco/);
  assert.doesNotMatch(text, /inherits the sandwich shop/); // synopsis
  assert.doesNotMatch(text, /major character leaves/); // « Season 2 » sous « Reception »
});

test('the extract is capped', () => {
  assert.ok(makingOfSections(article, 120).length <= 120);
});

test('name tokens keep proper names and drop generic roles', () => {
  assert.deepEqual(nameTokens(["Carmen 'Carmy' Berzatto", 'Chef Terry', 'Self']).sort(), ['Berzatto', 'Carmen', 'Carmy', 'Terry']);
});

test('a name belongs to the season where it first appears', () => {
  const introduced = introducedNames({
    1: ["Carmen 'Carmy' Berzatto", 'Jeremy Allen White'],
    2: ["Carmen 'Carmy' Berzatto", 'Claire Dunlap', 'Molly Gordon'],
  });
  assert.ok(introduced[1].includes('Carmy'));
  assert.ok(introduced[2].includes('Claire'));
  assert.ok(!introduced[2].includes('Carmy'));
});

test('season mentions in French and English', () => {
  assert.equal(mentionedSeason('Tournée pendant la saison 3, puis en S4.'), 4);
  assert.equal(mentionedSeason('Filmed for season 2 in Chicago.'), 2);
  assert.equal(mentionedSeason('Tournée à Chicago.'), null);
});

test('malformed model output is dropped, not repaired', () => {
  const items = parseTrivia({
    items: [
      { type: 'fact', season: 1, text: 'La série a été tournée dans un vrai restaurant de Chicago.', source: 'en' },
      { type: 'fact', text: 'Trop court' },
      { type: 'quiz', question: 'Où ?', options: ['Chicago', 'New York'], answer: 0, explanation: 'x' },
      { type: 'quiz', question: 'Qui a créé la série ?', options: ['Christopher Storer', 'Joanna Calo', 'Ramy Youssef'], answer: 0, explanation: 'Christopher Storer en est le créateur.', source: 'fr' },
      { type: 'quiz', question: 'Doublon ?', options: ['A', 'A', 'B'], answer: 1, explanation: 'x' },
    ],
  });
  assert.equal(items.length, 2);
  assert.equal(items[0].type, 'fact');
  assert.equal(items[1].type, 'quiz');
  assert.equal(items[1].source, 'fr');
});

test('a season named in the text wins over the declared one', () => {
  const [item] = parseTrivia({
    items: [{ type: 'fact', season: 1, text: 'Pour la saison 3, l’équipe a reconstruit la cuisine en studio.', source: 'fr' }],
  });
  assert.equal(item.season, 3);
});

test('nothing from a later season, nothing naming someone who arrives later', () => {
  const introduced = { 1: ['Carmy', 'Richie'], 2: ['Claire'], 3: ['Luca'] };
  const items = [
    { type: 'fact', season: null, text: 'Créée par Christopher Storer, la série est tournée à Chicago.', source: 'en' },
    { type: 'fact', season: 3, text: 'La troisième saison a été tournée en un seul bloc.', source: 'en' },
    { type: 'fact', season: null, text: 'Le rôle de Claire a été écrit pour Molly Gordon.', source: 'en' },
    { type: 'quiz', season: 1, question: 'Qui joue Richie ?', options: ['Ebon Moss-Bachrach', 'Luca Marinelli', 'Oliver Platt'], answer: 0, explanation: 'Ebon Moss-Bachrach joue Richie.', source: 'fr' },
  ];
  const s1 = visibleTrivia(items, introduced, 1);
  assert.deepEqual(s1.map((i) => i.type === 'fact' ? i.text.slice(0, 10) : 'quiz'), ['Créée par ']);
  const s2 = visibleTrivia(items, introduced, 2);
  assert.equal(s2.length, 2); // Claire est connue en saison 2 ; le quiz nomme Luca, qui arrive en 3
  const s3 = visibleTrivia(items, introduced, 3);
  assert.equal(s3.length, 4);
});

test('an episode title from a later season never shows up', () => {
  const { visibleTrivia: visible } = load('../supabase/functions/series-trivia/logic.ts');
  const items = [
    { type: 'fact', season: null, text: 'Les scénarios étaient longs (75 pages pour Search Committee).', source: 'en' },
    { type: 'fact', season: null, text: 'Le pilote reprend la version britannique.', source: 'en' },
  ];
  const titles = { 1: ['Pilot', 'Diversity Day'], 7: ['Search Committee'] };
  assert.equal(visible(items, {}, 3, titles).length, 1);
  assert.equal(visible(items, {}, 7, titles).length, 2);
  // « Pilot » est trop courant pour être banni, même s'il revenait plus tard.
  assert.equal(visible([{ type: 'fact', season: null, text: 'Le Pilot a été tourné en 2004.', source: 'en' }], {}, 1, { 5: ['Pilot'] }).length, 1);
});
