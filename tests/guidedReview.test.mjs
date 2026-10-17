import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** L'avis guidé : le choix des questions, la lecture d'un resserrage, le jeton d'avis. */
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => {
    throw new Error('Ce module doit rester sans dépendance.');
  });
  return exports;
}

const { guidedQuestions, compareTightened, formatScore } = load('../utils/guidedReview.ts');
const { acceptTighten, acceptPolish, joinAnswers } = load('../supabase/functions/review-voice/polish.ts');
const { mintToken, verifyToken, TOKEN_TTL_MS } = load('../supabase/functions/review-voice/token.ts');

const dune = [
  { label: 'Histoire', value: 4 },
  { label: 'Visuels', value: 9.5 },
  { label: 'Jeu', value: 8 },
  { label: 'Son', value: 10 },
];

test('a wide gap asks what went wrong, then about the peak, then the verdict', () => {
  const [gap, peak, verdict] = guidedQuestions(dune, 8.1);
  assert.equal(gap.kind, 'gap');
  assert.deepEqual(gap.params, { top: 'Son', low: 'histoire', lowValue: '4' });
  assert.deepEqual(gap.chips.map((c) => [c.label, c.value, c.tone]), [
    ['Histoire', '4', 'low'],
    ['Son', '10', 'neutral'],
  ]);
  assert.equal(peak.kind, 'peak');
  assert.deepEqual(peak.params, { label: 'Son', labelLower: 'son', value: '10' });
  assert.equal(verdict.kind, 'verdict');
});

test('a flat rating asks what stood out, or what lost you when it is low', () => {
  const flat = dune.map((c) => ({ ...c, value: 7 }));
  assert.equal(guidedQuestions(flat, 7)[0].kind, 'marked');
  const bad = dune.map((c) => ({ ...c, value: 3 }));
  const questions = guidedQuestions(bad, 3);
  assert.equal(questions[0].kind, 'dropped');
  assert.equal(questions[1].kind, 'save');
  assert.equal(questions.length, 3);
});

test('scores read the French way', () => {
  assert.equal(formatScore(9.5), '9,5');
  assert.equal(formatScore(9.5, 'en'), '9.5');
  assert.equal(formatScore(8), '8');
});

test('the tightened comparison lists cut passages and added words', () => {
  const full =
    "L'histoire traîne au milieu, on sent qu'ils étirent pour la suite. Le son te prend aux tripes, les basses font trembler le siège.";
  const tight = "L'histoire traîne au milieu. Mais le son te prend aux tripes.";
  const { removed, added } = compareTightened(full, tight);
  assert.deepEqual(removed, ["on sent qu'ils étirent pour la suite", 'les basses font trembler le siège']);
  assert.deepEqual(added, ['Mais']);
});

test('tightening must cut without adding or summarising', () => {
  const full = "L'histoire traîne au milieu, on sent qu'ils étirent pour la suite. Le son te prend aux tripes, les basses font trembler le siège. À voir en salle.";
  assert.equal(acceptTighten(full, "L'histoire traîne au milieu. Mais le son te prend aux tripes. À voir en salle."), true);
  assert.equal(acceptTighten(full, full), false);
  assert.equal(acceptTighten(full, 'Bien.'), false);
  assert.equal(acceptTighten(full, "L'histoire est bancale et laborieuse, mais la bande-son grandiose reste magistrale."), false);
});

test('assembling may add a few linking words, not an opinion', () => {
  const answers = [
    "L'histoire traîne au milieu et Feyd arrive trop tard.",
    "Le combat dans l'arène, j'avais des frissons.",
    'À voir en salle.',
  ];
  const joined = joinAnswers(answers);
  const limits = { slack: 8, minRatio: 0.6, addedRatio: 0.12 };
  assert.equal(
    acceptPolish(joined, "L'histoire traîne au milieu et Feyd arrive trop tard. Par contre, le combat dans l'arène, j'avais des frissons. À voir en salle.", [], limits),
    true
  );
  assert.equal(
    acceptPolish(joined, "L'histoire traîne et Feyd arrive tard, mais la photographie somptueuse et la partition magistrale font un spectacle total. À voir en salle.", [], limits),
    false
  );
});

test('long guided reviews are split into paragraphs', () => {
  const long = Array.from({ length: 3 }, (_, i) => `Réponse ${i} ` + 'mot '.repeat(25).trim() + '.');
  assert.match(joinAnswers(long), /\n\n/);
  assert.doesNotMatch(joinAnswers(['Court.', 'Aussi.']), /\n/);
});

test('the review token is bound to its user and expires', async () => {
  const now = Date.now();
  const token = await mintToken('secret', 'user-1', now);
  assert.equal(await verifyToken('secret', 'user-1', token, now + 1000), true);
  assert.equal(await verifyToken('secret', 'user-2', token, now + 1000), false);
  assert.equal(await verifyToken('other', 'user-1', token, now + 1000), false);
  assert.equal(await verifyToken('secret', 'user-1', token, now + TOKEN_TTL_MS + 1), false);
  assert.equal(await verifyToken('secret', 'user-1', token.slice(0, -2) + 'xx', now), false);
  assert.equal(await verifyToken('secret', 'user-1', null, now), false);
});
