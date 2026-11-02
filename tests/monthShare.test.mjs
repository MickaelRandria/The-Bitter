import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Transpile et exécute le module livré, comme les autres tests. */
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => ({}));
  return exports;
}

const { monthScreenings, monthGrid, formatTime } = load('../utils/monthShare.ts');

const at = (d, h = 20, min = 30) => new Date(2026, 10, d, h, min).getTime();
const now = at(2, 12, 0);
const screenings = [
  { id: 'old', title: 'Hope', startsAt: at(1, 18, 0), status: 'completed' },
  { id: 'a', title: 'Karma', startsAt: at(5), status: 'scheduled' },
  { id: 'x', title: 'Annulé', startsAt: at(6), status: 'cancelled' },
  { id: 'b', title: 'Kraken', startsAt: at(12, 21, 0), status: 'pending' },
  { id: 'dec', title: 'Décembre', startsAt: new Date(2026, 11, 3, 20).getTime(), status: 'scheduled' },
];

test('mois : les séances du mois, sans les annulées, les passées au choix', () => {
  assert.deepEqual(monthScreenings(screenings, '2026-11', false, now).map((s) => s.id), ['a', 'b']);
  assert.deepEqual(monthScreenings(screenings, '2026-11', true, now).map((s) => s.id), ['old', 'a', 'b']);
});

test('mois : la grille commence lundi, la séance sur son jour', () => {
  const cells = monthGrid('2026-11', screenings, now);
  // Le 1er novembre 2026 est un dimanche : six cases vides avant.
  assert.equal(cells.filter((c) => c.day === 0).length, 6);
  assert.equal(cells.length, 36);
  assert.equal(cells.find((c) => c.day === 5).screening.id, 'a');
  assert.ok(cells.find((c) => c.day === 1).past);
  assert.ok(cells.find((c) => c.day === 2).today);
});

test('mois : l’heure à la française', () => {
  assert.equal(formatTime(at(5), 'fr'), '20 h 30');
  assert.equal(formatTime(at(12, 21, 0), 'fr'), '21 h');
});
