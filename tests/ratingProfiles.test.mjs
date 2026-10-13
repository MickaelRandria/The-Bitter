import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Transpile et exécute le module livré, comme `tests/constats.test.mjs`. */
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => ({}));
  return exports;
}

const {
  RATING_PROFILES,
  PROFILE_OPTIONS,
  familyValue,
  criterionFamily,
  resolveStoredProfileId,
  simpleCriteriaKeys,
  currentCriterionLabel,
} = load('../config/ratingProfiles.ts');

test('le documentaire a six critères en Bitter+, sans Scénario ni Jeu des acteurs', () => {
  const keys = RATING_PROFILES.documentary.criteria.map((c) => c.key);
  assert.equal(keys.length, 6);
  assert.ok(!keys.includes('scenario'));
  assert.ok(!keys.includes('interpretation'));
  // Le critère du genre reste le dernier, c'est lui qui ne s'écarte pas.
  assert.equal(RATING_PROFILES.documentary.criteria.at(-1).group, 'specific');
});

test('chaque grille a exactement un critère propre au genre, en dernier', () => {
  for (const [id, profile] of Object.entries(RATING_PROFILES)) {
    if (id === 'standard' || id === 'custom') continue;
    const specific = profile.criteria.filter((c) => c.group === 'specific');
    assert.equal(specific.length, 1, id);
    assert.equal(profile.criteria.at(-1).group, 'specific', id);
  }
});

test('la notation à quatre critères garde un critère par famille, pris dans la grille', () => {
  for (const id of Object.keys(RATING_PROFILES)) {
    const keys = simpleCriteriaKeys(id);
    assert.equal(keys.length, 4, id);
    const families = keys.map(criterionFamily).sort();
    assert.deepEqual(families, ['image', 'interpretation', 'scenario', 'sound'], id);
    const own = RATING_PROFILES[id].criteria.map((c) => c.key);
    const standard = RATING_PROFILES.standard.criteria.map((c) => c.key);
    for (const k of keys) assert.ok(own.includes(k) || standard.includes(k), `${id}:${k}`);
  }
  assert.deepEqual(simpleCriteriaKeys('documentary'), ['propos', 'parole', 'doc_images', 'sound']);
  assert.deepEqual(simpleCriteriaKeys('horror'), ['scenario', 'image', 'interpretation', 'sound']);
});

test('familyValue fait la moyenne des critères d’une famille et ignore les absents', () => {
  const criteria = [
    { key: 'propos', value: 9 },
    { key: 'construction', value: 7 },
    { key: 'parole', value: 8 },
    { key: 'impact', value: 10 },
  ];
  assert.equal(familyValue(criteria, 'scenario'), 8);
  assert.equal(familyValue(criteria, 'interpretation'), 8);
  // Son mis « Sans objet » : pas enregistré, donc pas de valeur — jamais un zéro.
  assert.equal(familyValue(criteria, 'sound'), undefined);
  assert.equal(familyValue(undefined, 'sound'), undefined);
});

test('une ancienne note Documentaire se rouvre dans sa grille d’origine', () => {
  const old = [{ key: 'scenario' }, { key: 'image' }, { key: 'interpretation' }, { key: 'sound' }, { key: 'impact' }];
  assert.equal(resolveStoredProfileId('documentary', old), 'documentary_legacy');
  assert.equal(resolveStoredProfileId('documentary', [{ key: 'propos' }, { key: 'impact' }]), 'documentary');
  assert.equal(resolveStoredProfileId('standard_legacy', []), 'standard');
  assert.equal(resolveStoredProfileId('inconnu', []), 'standard');
  assert.equal(resolveStoredProfileId(undefined, []), null);
});

test('l’ancienne grille n’est pas proposée dans le sélecteur, les spectacles oui', () => {
  const ids = PROFILE_OPTIONS.map((o) => o.id);
  assert.ok(!ids.includes('documentary_legacy'));
  assert.ok(ids.includes('standup'));
  assert.ok(ids.includes('concert'));
});

test('une clé partagée entre grilles garde un seul libellé', () => {
  // LABEL_BY_KEY garde le dernier libellé rencontré : deux libellés pour une
  // même clé renommeraient en silence les anciennes notes.
  const byKey = new Map();
  for (const profile of Object.values(RATING_PROFILES)) {
    for (const c of profile.criteria) {
      if (byKey.has(c.key)) assert.equal(byKey.get(c.key), c.label, c.key);
      byKey.set(c.key, c.label);
    }
  }
  assert.equal(currentCriterionLabel('Sonore', 'sound'), 'Son & musique');
});
