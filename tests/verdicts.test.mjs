import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * Verdicts des espaces et « Nos stats » : les deux modules purs.
 *
 * `spaceStats.ts` importe `verdict.ts`, et lui seul : le chargeur le lui fournit.
 */
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
const stats = load('../utils/spaceStats.ts', { './verdict': verdict });
const { expectedRaters, verdictState, agreementOf, betResult, criteriaOf, criteriaGap, guessLeaderboard, ratingValue } = verdict;

const rating = (movie, profile, value, extra = {}) => ({
  id: `${movie}-${profile}`,
  movie_id: movie,
  profile_id: profile,
  story: value,
  visuals: value,
  acting: value,
  sound: value,
  ...extra,
});

test('attendus : la séance calée prime sur les membres, les « pas vu » sortent', () => {
  const active = ['lea', 'mika', 'sam', 'ines'];
  assert.deepEqual(expectedRaters({ activeIds: active, raterIds: [], skipIds: ['sam'] }).sort(), ['ines', 'lea', 'mika']);
  assert.deepEqual(
    expectedRaters({ activeIds: active, planParticipants: ['lea', 'mika'], raterIds: ['ines'], skipIds: [] }).sort(),
    ['ines', 'lea', 'mika']
  );
  // Un ancien membre ne bloque jamais un verdict.
  assert.deepEqual(expectedRaters({ activeIds: ['lea', 'mika'], raterIds: ['ancien'], skipIds: [] }).sort(), ['lea', 'mika']);
});

test('état : à toi, en attente, verdict, pas vu', () => {
  const expected = ['lea', 'mika', 'sam'];
  assert.equal(verdictState({ me: 'lea', expected, raterIds: ['mika'], skipIds: [] }), 'turn');
  assert.equal(verdictState({ me: 'lea', expected, raterIds: ['mika', 'lea'], skipIds: [] }), 'wait');
  assert.equal(verdictState({ me: 'lea', expected, raterIds: ['mika', 'lea', 'sam'], skipIds: [] }), 'done');
  assert.equal(verdictState({ me: 'sam', expected: ['lea', 'mika'], raterIds: ['mika'], skipIds: ['sam'] }), 'skip');
  // Une seule note n'est pas un verdict.
  assert.equal(verdictState({ me: 'lea', expected: ['lea'], raterIds: ['lea'], skipIds: [] }), 'wait');
});

test('accord et paris : les seuils de la maquette', () => {
  assert.equal(agreementOf(1), 'agree');
  assert.equal(agreementOf(2.5), 'close');
  assert.equal(agreementOf(2.6), 'split');
  assert.equal(betResult(7, 7.5), 'hit');
  assert.equal(betResult(7, 8.5), 'near');
  assert.equal(betResult(4, 8), 'miss');
});

test('critères : la grille Bitter+ prime, les colonnes recopiées ne disent rien', () => {
  assert.equal(criteriaOf(rating('m', 'a', 7)), null);
  const adaptive = rating('m', 'a', 7, {
    adaptive_rating: {
      weightedRating: 7.4,
      criteria: [
        { key: 'scenario', value: 8 },
        { key: 'image', value: 6 },
        { key: 'interpretation', value: 7 },
        { key: 'sound', value: 9 },
        { key: 'fear', value: 3 },
      ],
    },
  });
  assert.deepEqual(criteriaOf(adaptive), { story: 8, visuals: 6, acting: 7, sound: 9 });
  assert.equal(ratingValue(adaptive), 7.4);
  const gap = criteriaGap([
    { story: 8, visuals: 6, acting: 7, sound: 9 },
    { story: 7, visuals: 9.5, acting: 7, sound: 8 },
  ]);
  assert.equal(gap.key, 'visuals');
  assert.equal(gap.gap, 3.5);
});

test('qui connaît le mieux qui : seuls les paris résolus comptent', () => {
  const notes = { 'f1|mika': 8, 'f1|lea': 6, 'f2|mika': 5, 'f2|lea': 7 };
  const actual = (movie, profile) => notes[`${movie}|${profile}`] ?? null;
  const board = guessLeaderboard(
    [
      { movie_id: 'f1', guesser_id: 'lea', target_id: 'mika', guess: 7.5 },
      { movie_id: 'f2', guesser_id: 'lea', target_id: 'mika', guess: 6 },
      { movie_id: 'f1', guesser_id: 'mika', target_id: 'lea', guess: 9 },
      { movie_id: 'f3', guesser_id: 'mika', target_id: 'lea', guess: 1 },
    ],
    actual
  );
  assert.deepEqual(board.map((b) => [b.guesser, b.error, b.count]), [
    ['lea', 0.75, 2],
    ['mika', 3, 1],
  ]);
});

test('paire : écarts, accord par mois, film du tournant', () => {
  const films = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, title: id, status: 'watched', genres: ['Drame'] }));
  const ratings = [
    // Mai : deux films, un seul d'accord.
    rating('a', 'lea', 8, { rated_at: '2026-05-03' }), rating('a', 'mika', 4, { rated_at: '2026-05-03' }),
    rating('b', 'lea', 7, { rated_at: '2026-05-10' }), rating('b', 'mika', 7.5, { rated_at: '2026-05-10' }),
    // Juin : trois films d'accord.
    rating('c', 'lea', 9, { rated_at: '2026-06-02' }), rating('c', 'mika', 9, { rated_at: '2026-06-02' }),
    rating('d', 'lea', 6, { rated_at: '2026-06-09' }), rating('d', 'mika', 6.5, { rated_at: '2026-06-09' }),
    rating('e', 'lea', 5, { rated_at: '2026-06-20' }), rating('e', 'mika', 5.5, { rated_at: '2026-06-20' }),
    // Noté par un seul : hors de la paire.
    rating('f', 'lea', 3, { rated_at: '2026-06-21' }),
  ];
  const rows = stats.pairRows(films, ratings, 'lea', 'mika');
  assert.equal(rows.length, 5);
  assert.deepEqual(stats.agreementSplit(rows), { close: 4, above: 0, below: 1 });
  const months = stats.agreementByMonth(rows);
  assert.deepEqual(months.map((m) => [m.month, m.pct]), [['2026-05', 50], ['2026-06', 100]]);
  const turn = stats.turningFilm(rows, months);
  assert.equal(turn.month, '2026-06');
  assert.equal(turn.row.film.id, 'c');
  const defs = stats.definers(rows);
  assert.equal(defs.worst.film.id, 'a');
  assert.equal(defs.bestAgree.film.id, 'c');
});

test('mois précédent, y compris en janvier', () => {
  assert.equal(stats.previousMonth(new Date(2026, 9, 10)), '2026-09');
  assert.equal(stats.previousMonth(new Date(2027, 0, 1)), '2026-12');
  assert.equal(stats.shiftMonth('2026-01', -1), '2025-12');
});
