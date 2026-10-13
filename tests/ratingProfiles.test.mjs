import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Transpile et exécute le module livré, comme `tests/constats.test.mjs`. */
function load(relative, deps = {}) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, (name) => deps[name] ?? {});
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

const config = load('../config/ratingProfiles.ts');
const { buildCriteriaForProfile, buildSimpleCriteria, calculateWeightedRating, isStandardSimpleGrid } =
  load('../utils/rating.ts', { '../config/ratingProfiles': config });

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

test('tous les critères de base ont une famille, les critères de genre restent hors des familles', () => {
  for (const profile of Object.values(RATING_PROFILES)) {
    for (const c of profile.criteria) {
      if (c.group === 'base') assert.ok(criterionFamily(c.key), `${profile.id}:${c.key}`);
      else assert.equal(criterionFamily(c.key), undefined, `${profile.id}:${c.key}`);
    }
  }
});

test('les quatre grilles validées gardent leurs critères et leurs poids', () => {
  const expected = {
    animation: [['scenario', 1], ['image', 1.4], ['animated_characters', 1], ['sound', 1], ['animation', 1.8]],
    music: [['scenario', 0.7], ['image', 1], ['interpretation', 1.4], ['musical_sound', 1], ['musical_pieces', 1.8]],
    action: [['scenario', 0.7], ['image', 1.4], ['interpretation', 1], ['sound', 1.4], ['action', 1.8]],
    horror: [['scenario', 1], ['image', 1.4], ['interpretation', 1], ['sound', 1.4], ['horror_atmosphere', 1.4], ['fear', 1.8]],
  };
  for (const [id, rows] of Object.entries(expected)) {
    assert.deepEqual(RATING_PROFILES[id].criteria.map(c => [c.key, c.weight]), rows, id);
    for (const c of RATING_PROFILES[id].criteria) {
      assert.match(c.description, /^Tu .+ \?$/, `${id}:${c.key}`);
      assert.ok(!c.description.includes('\n'));
    }
  }
  assert.equal(config.ADAPTIVE_RATING_VERSION, 3);
});

test('les anciennes notes gardent leurs clés, leurs poids et leur moyenne, même avec Sans objet', () => {
  const oldWeights = {
    animation: [1, 1.4, 1, 1, 1.8],
    music: [0.7, 1, 1.4, 1.8, 1.8],
    horror: [1, 1.4, 1, 1.8, 1.8],
  };
  for (const [id, weights] of Object.entries(oldWeights)) {
    const oldKeys = ['scenario', 'image', 'interpretation', 'sound', { animation: 'animation', music: 'songs', horror: 'fear' }[id]];
    const values = [8, 6, 9, 3, 10];
    for (const skipped of [[], ['interpretation', 'sound'], oldKeys.slice(0, 4)]) {
      const stored = oldKeys.flatMap((key, i) => skipped.includes(key) ? [] : [{ key, value: values[i] }]);
      const resolved = resolveStoredProfileId(id, stored, 2, skipped);
      assert.equal(resolved, `${id}_legacy`);
      const restored = buildCriteriaForProfile(resolved, Object.fromEntries(stored.map(c => [c.key, c.value])))
        .filter(c => !skipped.includes(c.key));
      assert.deepEqual(restored.map(c => c.key), stored.map(c => c.key));
      const original = oldKeys.flatMap((key, i) => skipped.includes(key) ? [] : [{ value: values[i], weight: weights[i] }]);
      assert.equal(calculateWeightedRating(restored), calculateWeightedRating(original), id);
      assert.deepEqual(restored.map(c => c.weight), original.map(c => c.weight));
      // Une note déjà réenregistrée avec le profil legacy et la version 3 reste legacy.
      assert.equal(resolveStoredProfileId(resolved, stored, 3, skipped), resolved);
    }
    assert.ok(!PROFILE_OPTIONS.some(p => p.id === `${id}_legacy`));
  }
  assert.equal(resolveStoredProfileId('action', [{ key: 'action' }], 2), 'action');
});

test('une nouvelle note reste dans sa grille si les critères distinctifs sont écartés', () => {
  for (const [id, keys] of Object.entries({
    animation: ['animated_characters'], music: ['musical_sound', 'musical_pieces'], horror: ['horror_atmosphere'],
  })) {
    const rest = RATING_PROFILES[id].criteria.filter(c => !keys.includes(c.key));
    assert.equal(resolveStoredProfileId(id, rest, 3), id);
    assert.equal(resolveStoredProfileId(id, rest, undefined, keys), id);
    assert.equal(resolveStoredProfileId(id, RATING_PROFILES[id].criteria), id);
  }
  // Bitter simple Horreur ne contient jamais Atmosphère ; sa version suffit.
  assert.equal(resolveStoredProfileId('horror', buildSimpleCriteria('horror'), 3), 'horror');
});

test('Bitter simple utilise les personnages et le son musical, à quatre poids égaux', () => {
  for (const id of ['animation', 'music', 'action', 'horror']) {
    const simple = buildSimpleCriteria(id);
    assert.equal(simple.length, 4);
    assert.ok(simple.every(c => c.weight === 1 && c.group === 'base'));
    assert.ok(!simple.some(c => c.key === 'horror_atmosphere'));
  }
  assert.equal(isStandardSimpleGrid('animation'), false);
  assert.equal(isStandardSimpleGrid('music'), false);
  assert.equal(isStandardSimpleGrid('horror'), true);
  assert.equal(isStandardSimpleGrid('action'), true);
});

test('les nouveaux critères alimentent les bonnes familles des statistiques', () => {
  assert.equal(familyValue([{ key: 'animated_characters', value: 9 }], 'interpretation'), 9);
  assert.equal(familyValue([{ key: 'musical_sound', value: 8 }], 'sound'), 8);
  assert.equal(familyValue([{ key: 'image', value: 6 }, { key: 'horror_atmosphere', value: 10 }], 'image'), 8);
  assert.equal(familyValue([{ key: 'musical_pieces', value: 10 }], 'sound'), undefined);
});
