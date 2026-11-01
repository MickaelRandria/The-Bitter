import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Transpile et exécute le module livré, comme `tests/problemReport.test.mjs`. */
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => ({}));
  return exports;
}

const { pointsFor, trackWeight, QUESTION_COUNT, MAX_POINTS } = load('../services/blindTest.ts');

test('blind test : chaque indice retire un point', () => {
  assert.equal(pointsFor(0), 3);
  assert.equal(pointsFor(6999), 3);
  assert.equal(pointsFor(7000), 2);
  assert.equal(pointsFor(14000), 1);
  assert.equal(pointsFor(20000), 1);
});

test('blind test : le total tient sous le plafond de 20 de la table', () => {
  assert.ok(QUESTION_COUNT * MAX_POINTS <= 20);
});

test('blind test : un titre de thème passe devant un morceau un peu plus écouté', () => {
  const theme = trackWeight({ title: 'Main Theme', rank: 400000 }, 'Inception');
  const cue = trackWeight({ title: 'Dream Is Collapsing', rank: 600000 }, 'Inception');
  const named = trackWeight({ title: 'Interstellar', rank: 300000 }, 'Interstellar');
  assert.ok(theme > cue);
  assert.ok(named > cue / 2 && named > trackWeight({ title: 'Cornfield Chase', rank: 500000 }, 'Interstellar'));
});
