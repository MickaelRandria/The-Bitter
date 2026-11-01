import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Transpile et exécute le module livré, comme `tests/soundtrack.test.mjs`. Chaque appel rend un module neuf. */
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => ({}));
  return exports;
}

test('« Un souci ? » : un même message une fois par session, une proposition par minute au plus', () => {
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    const report = load('../utils/problemReport.ts');
    const shown = [];
    report.subscribeProblem((problem) => problem && shown.push(problem.message));

    report.signalProblem('Le serveur ne répond pas.');
    now += 10_000;
    report.signalProblem('Une autre erreur'); // moins d'une minute après : rien
    now += 60_000;
    report.signalProblem('  Le serveur   ne répond pas. '); // déjà proposé : rien
    report.signalProblem('Une autre erreur'); // une minute passée : oui
    now += 60_000;
    report.signalProblem('ok'); // trop court pour être un message d'erreur

    assert.deepEqual(shown, ['Le serveur ne répond pas.', 'Une autre erreur']);
  } finally {
    Date.now = realNow;
  }
});

test('« Un souci ? » : ignorer efface la proposition', () => {
  const report = load('../utils/problemReport.ts');
  const states = [];
  report.subscribeProblem((problem) => states.push(problem ? problem.message : null));
  report.signalProblem('La séance n’a pas pu être enregistrée.');
  report.dismissProblem();
  assert.deepEqual(states, ['La séance n’a pas pu être enregistrée.', null]);
});
