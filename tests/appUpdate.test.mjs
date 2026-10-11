import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Écran de mise à jour : seules les erreurs dues à une ancienne version le déclenchent. */
const compiled = ts.transpileModule(readFileSync(new URL('../utils/appUpdate.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = {};
new Function('exports', 'require', compiled)(mod, () => ({}));

test('erreurs de fichier d’une version précédente', () => {
  for (const message of [
    'Failed to fetch dynamically imported module: https://thebitter.watch/assets/SharedSpaceView-BG4nlwfz.js',
    'Importing a module script failed.',
    'error loading dynamically imported module',
    'Unable to preload CSS for /assets/index-abc.css',
  ]) {
    assert.equal(mod.isChunkLoadError(new Error(message)), true, message);
  }
});

test('les vraies erreurs gardent leur écran', () => {
  assert.equal(mod.isChunkLoadError(new Error("Cannot read properties of undefined (reading 'map')")), false);
  assert.equal(mod.isChunkLoadError(new TypeError('Failed to fetch')), false);
  assert.equal(mod.isChunkLoadError(null), false);
});
