import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Profil de critique et plateformes : deux modules purs. */
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, (name) => {
    throw new Error(`Dépendance inattendue : ${name}`);
  });
  return exports;
}

const critic = load('../utils/criticProfile.ts');
const platforms = load('../utils/platforms.ts');

test('exigence : rien sous cinq films comparés, ni avec des notes manquantes', () => {
  const four = [7, 6, 5, 8].map((mine) => ({ mine, public: 7.5 }));
  assert.equal(critic.severityVsPublic(four), null);
  assert.equal(critic.severityVsPublic([...four, { mine: 6, public: NaN }]), null);
});

test('exigence : plus sévère que le public, part et écart moyen', () => {
  const pairs = [
    { mine: 6, public: 7.5 },
    { mine: 5, public: 7 },
    { mine: 8, public: 7.9 }, // écart sous le seuil : pas « plus sévère »
    { mine: 6.5, public: 7.2 },
    { mine: 9, public: 8 },
  ];
  const r = critic.severityVsPublic(pairs);
  assert.equal(r.count, 5);
  assert.equal(r.harsherShare, 0.6);
  assert.ok(Math.abs(r.meanGap - -0.62) < 1e-9);
  assert.ok(r.position > 0.5 && r.position < 1);
  assert.deepEqual(critic.severityKey(r), { key: 'critic.harsher', percent: 60 });
});

test('exigence : généreux et aligné, réglette bornée', () => {
  const kind = critic.severityVsPublic([1, 2, 3, 4, 5].map(() => ({ mine: 10, public: 5 })));
  assert.equal(kind.position, 0);
  assert.deepEqual(critic.severityKey(kind), { key: 'critic.kinder', percent: 100 });
  const same = critic.severityVsPublic([1, 2, 3, 4, 5].map(() => ({ mine: 7, public: 7.1 })));
  assert.equal(critic.severityKey(same).key, 'critic.aligned');
  assert.equal(same.position > 0.5 && same.position < 0.53, true);
});

test('patience : trois phrases selon le calibrage', () => {
  assert.equal(critic.patienceKey(2), 'critic.patienceSlow');
  assert.equal(critic.patienceKey(undefined), 'critic.patienceMiddle');
  assert.equal(critic.patienceKey(8), 'critic.patienceFast');
});

test('plateformes : identifiants historiques, requête TMDB et offres', () => {
  for (const id of ['netflix', 'prime', 'disney', 'canal']) assert.ok(platforms.platformById(id), id);
  assert.equal(platforms.providerQuery(['canal', 'netflix', 'inconnue']), '8|1796|381');
  assert.equal(platforms.providerQuery([]), '');
  assert.equal(platforms.isMyProvider(1796, ['netflix']), true);
  assert.equal(platforms.isMyProvider(119, ['netflix']), false);
  assert.equal(platforms.platformOfProvider(99999), undefined);
});
