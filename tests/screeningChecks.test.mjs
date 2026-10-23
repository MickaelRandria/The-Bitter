import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Remarques sur les séances : doublons, chevauchements, film déjà vu, film absent. */
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => {
    throw new Error('Le module doit rester sans import');
  });
  return exports;
}
const { screeningChecks, otherScreeningOfFilm, parseDismissed } = load('../utils/screeningChecks.ts');

const now = Date.parse('2026-10-23T12:00:00Z');
const at = (iso) => Date.parse(iso);
const s = (id, title, iso, extra = {}) => ({ id, title, startsAt: at(iso), status: 'scheduled', tmdbId: extra.tmdbId, ...extra });
const kinds = (checks) => checks.map((c) => c.kind);

test('le même film deux fois : une remarque qui liste les deux séances', () => {
  const checks = screeningChecks(
    [s('a', 'Hunger Games : La Révolte, partie 1', '2026-10-24T14:15:00Z', { tmdbId: 131631 }), s('b', 'Hunger Games : La Révolte, partie 1', '2026-10-25T14:00:00Z', { tmdbId: 131631 })],
    [{ tmdbId: 131631, title: 'Hunger Games : La Révolte, partie 1', status: 'watchlist' }],
    now,
  );
  assert.deepEqual(kinds(checks), ['duplicate']);
  assert.deepEqual(checks[0].screenings.map((x) => x.id), ['a', 'b']);
});

test('sans fiche TMDB, le titre suffit, accents et casse compris', () => {
  const checks = screeningChecks([s('a', 'Ça', '2026-10-24T18:00:00Z'), s('b', 'ca', '2026-10-26T18:00:00Z')], [], now);
  assert.deepEqual(kinds(checks), ['duplicate']);
});

test('les séances passées ou annulées ne comptent pas', () => {
  const checks = screeningChecks(
    [s('a', 'Karma', '2026-10-18T16:15:00Z', { tmdbId: 1 }), s('b', 'Karma', '2026-10-30T16:15:00Z', { tmdbId: 1 }), s('c', 'Karma', '2026-10-31T16:15:00Z', { tmdbId: 1, status: 'cancelled' })],
    [{ tmdbId: 1, title: 'Karma', status: 'watchlist' }],
    now,
  );
  assert.deepEqual(kinds(checks), []);
});

test('deux films qui se chevauchent, selon la durée du premier', () => {
  const movies = [{ tmdbId: 1, title: 'Long', status: 'watchlist', runtime: 180 }, { tmdbId: 2, title: 'Court', status: 'watchlist' }];
  const overlap = screeningChecks([s('a', 'Long', '2026-10-24T18:00:00Z', { tmdbId: 1 }), s('b', 'Court', '2026-10-24T20:30:00Z', { tmdbId: 2 })], movies, now);
  assert.deepEqual(kinds(overlap), ['overlap']);
  const enchaine = screeningChecks([s('a', 'Court', '2026-10-24T18:00:00Z', { tmdbId: 2 }), s('b', 'Long', '2026-10-24T20:00:00Z', { tmdbId: 1 })], movies, now);
  assert.deepEqual(kinds(enchaine), [], 'deux heures pile après un film sans durée connue : on enchaîne');
});

test('une séance pour un film déjà vu, ou absent de la collection', () => {
  const checks = screeningChecks(
    [s('a', 'Fight Club', '2026-10-28T19:00:00Z', { tmdbId: 550 }), s('b', 'Babylon', '2026-11-03T18:00:00Z', { tmdbId: 615777 })],
    [{ tmdbId: 550, title: 'Fight Club', status: 'watched', dateWatched: at('2026-03-01T20:00:00Z') }],
    now,
  );
  assert.deepEqual(kinds(checks), ['alreadySeen', 'notInCollection']);
  assert.equal(checks[0].seenAt, at('2026-03-01T20:00:00Z'));
});

test('« c’est voulu » fait taire la remarque, et seulement elle', () => {
  const screenings = [s('a', 'X', '2026-10-24T18:00:00Z', { tmdbId: 9 }), s('b', 'X', '2026-10-25T18:00:00Z', { tmdbId: 9 })];
  const [dup] = screeningChecks(screenings, [{ tmdbId: 9, title: 'X', status: 'watchlist' }], now);
  assert.deepEqual(screeningChecks(screenings, [{ tmdbId: 9, title: 'X', status: 'watchlist' }], now, new Set([dup.key])), []);
  assert.deepEqual([...parseDismissed('["a", 3]')], ['a']);
  assert.deepEqual([...parseDismissed('oups')], []);
});

test('avant d’ajouter une séance : une autre du même film à une autre heure', () => {
  const existing = [s('a', 'Hunger Games', '2026-10-25T14:00:00Z', { tmdbId: 7 })];
  assert.equal(otherScreeningOfFilm(existing, { tmdbId: 7, title: 'Hunger Games', startsAt: at('2026-10-24T14:15:00Z') }, now).id, 'a');
  assert.equal(otherScreeningOfFilm(existing, { tmdbId: 7, title: 'Hunger Games', startsAt: at('2026-10-25T14:00:00Z') }, now), undefined, 'la même séance n’est pas une autre');
  assert.equal(otherScreeningOfFilm(existing, { tmdbId: 8, title: 'Autre', startsAt: at('2026-10-24T14:15:00Z') }, now), undefined);
});
