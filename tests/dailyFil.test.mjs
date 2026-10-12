import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Le Fil du jour : le même pour tous, tiré de la date. */
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => { throw new Error('dépendance'); });
  return exports;
}
const fil = load('../utils/dailyFil.ts');
const { DAILY_FILMS } = load('../config/dailyFilms.ts');

test('numéro du Fil et jour de Paris', () => {
  assert.equal(fil.filNumber('2026-10-13'), 1);
  assert.equal(fil.filNumber('2026-11-12'), 31);
  // 23h30 à Paris le 13, soit 21h30 UTC : encore le 13.
  assert.equal(fil.parisDay(Date.UTC(2026, 9, 13, 21, 30)), '2026-10-13');
  assert.equal(fil.parisDay(Date.UTC(2026, 9, 13, 22, 30)), '2026-10-14');
});

test('même jour, même Fil ; quatre propositions dont la bonne, sans doublon', () => {
  const a = fil.planFor(DAILY_FILMS, '2026-10-20');
  const b = fil.planFor(DAILY_FILMS, '2026-10-20');
  assert.equal(a.mystery.film.id, b.mystery.film.id);
  assert.equal(a.mystery.options.length, 4);
  assert.ok(a.mystery.options.some((o) => o.id === a.mystery.film.id));
  assert.equal(new Set(a.mystery.options.map((o) => o.id)).size, 4);
  const qIds = a.questions.flatMap((q) => [q.a.id, q.b.id]);
  assert.equal(new Set(qIds).size, 4);
  assert.ok(!qIds.includes(a.mystery.film.id));
});

test('le film mystère ne revient pas avant un tour complet de la réserve', () => {
  const seen = new Set();
  for (let i = 0; i < DAILY_FILMS.length; i++) {
    const day = new Date(Date.UTC(2026, 9, 13) + i * 864e5).toISOString().slice(0, 10);
    seen.add(fil.planFor(DAILY_FILMS, day).mystery.film.id);
  }
  assert.equal(seen.size, DAILY_FILMS.length);
});

test('série : comptée jusqu’à hier tant que le Fil du jour n’est pas fait', () => {
  const done = new Set(['2026-10-10', '2026-10-11', '2026-10-12']);
  assert.equal(fil.streakOf(done, '2026-10-13'), 3);
  done.add('2026-10-13');
  assert.equal(fil.streakOf(done, '2026-10-13'), 4);
  assert.equal(fil.streakOf(new Set(['2026-10-10']), '2026-10-13'), 0);
});
