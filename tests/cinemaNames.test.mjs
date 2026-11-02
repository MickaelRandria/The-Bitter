import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => ({}));
  return exports;
}

const { canonicalName, brandOf, suggestCinemas, similarity } = load('../utils/cinemaNames.ts');

test('cinémas : l’enseigne bien écrite, le reste avec ses majuscules', () => {
  assert.equal(canonicalName('pathe wepler'), 'Pathé Wepler');
  assert.equal(canonicalName('ugc cine cite les halles'), 'UGC Cine Cite Les Halles');
  assert.equal(canonicalName('cgr  Bordeaux'), 'CGR Bordeaux');
  assert.equal(canonicalName('le champo'), 'Le Champo');
  assert.equal(canonicalName('cinema de la plage'), 'Cinema de la Plage');
  assert.equal(brandOf('MK2 bibliothèque').brand, 'MK2');
});

test('cinémas : retrouvés malgré la casse, les accents ou une faute', () => {
  const known = ['UGC Ciné Cité Rosny', 'Pathé Wepler', 'Le Champo', 'MK2 Bibliothèque'];
  assert.deepEqual(suggestCinemas('pathe weppler', known).slice(0, 1), ['Pathé Wepler']);
  assert.deepEqual(suggestCinemas('ugc rosny', known).slice(0, 1), ['UGC Ciné Cité Rosny']);
  assert.deepEqual(suggestCinemas('champo', known).slice(0, 1), ['Le Champo']);
  assert.ok(similarity('mk2 biblio', 'MK2 Bibliothèque') >= 0.8);
  assert.deepEqual(suggestCinemas('gaumont', known), []);
});
