import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Transpile et exécute le module livré, comme `tests/tv.test.mjs`. */
function load(relative, deps = {}) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, (name) => deps[name] ?? {});
  return exports;
}

// `hasVerdict` simplifié : seule la présence d'une note compte ici.
const { buildTodo, personalVerdicts } = load('../services/spaceTodo.ts', {
  '../utils/rating': { hasVerdict: (m) => !!m.adaptiveRating || m.ratings.story > 0 },
});

const ME = 'me';
const LEA = 'lea';
const TOM = 'tom';
const future = new Date(Date.now() + 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();

const movie = (id, extra = {}) => ({
  id,
  space_id: 's1',
  title: id,
  director: '',
  year: 2024,
  genre: '',
  status: 'watchlist',
  added_by: LEA,
  added_at: '2026-10-01T00:00:00Z',
  tmdb_id: 100,
  media_type: 'movie',
  ...extra,
});
const mine = (tmdbId, extra = {}) => ({
  tmdbId,
  mediaType: 'movie',
  status: 'watched',
  ratings: { story: 7, visuals: 7, acting: 7, sound: 7 },
  ...extra,
});
const run = (input) =>
  buildTodo({ votes: [], ratings: [], plans: [], userId: ME, personal: new Map(), ...input }).map((i) => i.key);

test('une proposition d’un autre, sans réponse de ma part, est une demande', () => {
  assert.deepEqual(run({ movies: [movie('a')] }), ['watch:a']);
});

test('ma propre proposition, ou une proposition déjà votée, ne demande rien', () => {
  assert.deepEqual(run({ movies: [movie('a', { added_by: ME })] }), []);
  assert.deepEqual(
    run({ movies: [movie('a')], votes: [{ movie_id: 'a', profile_id: ME, interested: false }] }),
    []
  );
});

test('un film vu ne demande ma note que si je l’ai vu ou voulu voir', () => {
  const seen = movie('a', { status: 'watched' });
  assert.deepEqual(run({ movies: [seen] }), [], 'jamais vu : on ne demande pas de noter');
  assert.deepEqual(
    run({ movies: [seen], personal: personalVerdicts([mine(100)]) }),
    ['rate:a'],
    'noté seul : on propose de publier'
  );
  assert.deepEqual(
    run({ movies: [seen], votes: [{ movie_id: 'a', profile_id: ME, interested: true }] }),
    ['rate:a'],
    'partant : on demande la note'
  );
  assert.deepEqual(
    run({ movies: [seen], personal: personalVerdicts([mine(100)]), ratings: [{ movie_id: 'a', profile_id: ME }] }),
    [],
    'déjà noté dans l’espace'
  );
});

test('une série et un film de même numéro TMDB ne se confondent pas', () => {
  const series = movie('a', { status: 'watched', media_type: 'tv' });
  assert.deepEqual(run({ movies: [series], personal: personalVerdicts([mine(100)]) }), []);
});

test('une séance proposée par un autre, à venir, passe avant le reste', () => {
  const plan = {
    id: 'p1',
    proposer_id: TOM,
    space_id: 's1',
    shared_movie_id: 'b',
    status: 'open',
    chosen_slot_id: null,
    participant_ids: [TOM, ME],
    created_at: '',
    slots: [{ id: 'x', position: 0, starts_at: future }],
  };
  const keys = run({ movies: [movie('a'), movie('b')], plans: [plan] });
  assert.deepEqual(keys, ['plan:p1', 'watch:a'], 'le film de la séance ne revient pas en « partant ? »');
  assert.deepEqual(
    run({ movies: [movie('b')], plans: [{ ...plan, slots: [{ id: 'x', position: 0, starts_at: past }] }] }),
    ['watch:b'],
    'une séance passée ne se confirme plus'
  );
  assert.deepEqual(run({ movies: [movie('b')], plans: [{ ...plan, proposer_id: ME }] }), [], 'ma séance : j’attends');
});

test('une demande écartée ou venant d’une personne bloquée disparaît', () => {
  assert.deepEqual(run({ movies: [movie('a')], skipped: new Set(['watch:a']) }), []);
  assert.deepEqual(run({ movies: [movie('a')], blocked: new Set([LEA]) }), []);
});

// ─── Le talon du billet ─────────────────────────────────────────────────────
const { stubStateOf, missingMembers } = load('../services/spaceTodo.ts', {
  '../utils/rating': { hasVerdict: () => false },
});
const overview = (over = {}) => ({
  pending: 0, toVote: [], waiting: [], stale: [], reminded: new Map(), votedBy: new Map(), posters: [], members: [], ...over,
});
const waitingOn = (id, missing) => ({ movie: { id }, missing, ageDays: 4 });

test('talon : on m’attend passe avant tout le reste', () => {
  assert.equal(stubStateOf(overview({ pending: 1, waiting: [waitingOn('m1', [LEA])] })), 'me');
});

test('talon : une proposition sans réponse depuis 30 jours passe avant l’attente', () => {
  const w = waitingOn('m1', [LEA]);
  assert.equal(stubStateOf(overview({ waiting: [w], stale: [w] })), 'stale');
});

test('talon : « on attend » tant qu’une personne n’a pas été relancée depuis 5 jours', () => {
  const recent = new Date(Date.now() - 2 * 86400000);
  const old = new Date(Date.now() - 6 * 86400000);
  const w = waitingOn('m1', [LEA, TOM]);
  assert.equal(stubStateOf(overview({ waiting: [w], reminded: new Map([['m1:lea', recent]]) })), 'wait');
  assert.equal(stubStateOf(overview({ waiting: [w], reminded: new Map([['m1:lea', recent], ['m1:tom', recent]]) })), 'waitReminded');
  assert.equal(stubStateOf(overview({ waiting: [w], reminded: new Map([['m1:lea', recent], ['m1:tom', old]]) })), 'wait');
});

test('talon : à jour quand plus personne ne doit rien', () => {
  assert.equal(stubStateOf(overview()), 'ok');
  assert.equal(stubStateOf(undefined), 'ok');
});

test('talon : les absents, sans doublon, dans l’ordre', () => {
  assert.deepEqual(missingMembers(overview({ waiting: [waitingOn('a', [LEA, TOM]), waitingOn('b', [TOM])] })), [LEA, TOM]);
});
