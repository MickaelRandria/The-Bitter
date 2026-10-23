import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Stories avec photo : placement du bloc, zones d'Instagram, voile, cadrage. */
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
const {
  STORY_W,
  STORY_H,
  SAFE_TOP,
  SAFE_BOTTOM,
  STICKER_MAX_SCALE,
  clampPlacement,
  snapToCenter,
  veilAlpha,
  coverRect,
  defaultPlacement,
  criteriaRowMetrics,
  shortDate,
  wrapLines,
  parseStoryChoice,
  verdictWord,
  autoColor,
  cycle,
  isFlick,
  isTap,
  RELEVE_STYLES,
} = load('../utils/photoStory.ts');

const box = { width: 900, height: 640 };

test('le bloc ne passe jamais sous les bandes d’Instagram', () => {
  const high = clampPlacement({ cx: 540, cy: 0, scale: 1 }, box);
  assert.equal(high.cy - box.height / 2, SAFE_TOP);
  const low = clampPlacement({ cx: 540, cy: STORY_H, scale: 1 }, box);
  assert.equal(low.cy + box.height / 2, STORY_H - SAFE_BOTTOM);
});

test('le bloc reste dans la largeur et sa taille est bornée', () => {
  const p = clampPlacement({ cx: -500, cy: 900, scale: 9 }, { width: 400, height: 300 });
  assert.equal(p.scale, STICKER_MAX_SCALE);
  assert.ok(p.cx - (400 * p.scale) / 2 >= 0);
});

test('un bloc trop grand pour la zone visible reste centré', () => {
  const p = clampPlacement({ cx: 100, cy: 100, scale: 1.25 }, { width: 1000, height: 1400 });
  assert.equal(p.cx, STORY_W / 2);
  assert.equal(p.cy, (SAFE_TOP + STORY_H - SAFE_BOTTOM) / 2);
});

test('le bloc s’aimante sur l’axe du milieu, pas au-delà', () => {
  assert.deepEqual(snapToCenter(560), { cx: 540, snapped: true });
  assert.deepEqual(snapToCenter(600), { cx: 600, snapped: false });
});

test('le voile se renforce sur une photo claire', () => {
  assert.ok(veilAlpha('releve', 0.65) > veilAlpha('releve', 0.05));
  assert.equal(veilAlpha('releve', 0), 0.18);
  assert.ok(veilAlpha('releve', 1) <= 0.42, 'jamais une tache noire sur une photo claire');
  assert.ok(veilAlpha('seance', 0) >= 0.55);
});

test('la photo couvre toujours toute la story, même décalée', () => {
  const r = coverRect({ width: 4000, height: 3000 }, { zoom: 1, panX: 99999, panY: -99999 });
  assert.ok(r.x <= 0 && r.x + r.width >= STORY_W);
  assert.ok(r.y <= 0 && r.y + r.height >= STORY_H);
  assert.equal(r.height, STORY_H);
  const zoomed = coverRect({ width: 1080, height: 1920 }, { zoom: 0.2, panX: 0, panY: 0 });
  assert.equal(zoomed.framing.zoom, 1);
});

test('placements de départ : relevé au milieu, séance au-dessus de la signature', () => {
  assert.equal(defaultPlacement('releve', box).cx, STORY_W / 2);
  const seance = defaultPlacement('seance', box);
  assert.ok(seance.cy + box.height / 2 < STORY_H - SAFE_BOTTOM);
});

test('les notes du relevé tiennent sur une ligne, de 4 à 6 critères', () => {
  for (const n of [3, 4, 5, 6]) {
    const m = criteriaRowMetrics(n);
    assert.ok(n * m.itemWidth + (n - 1) * m.gap <= STORY_W - 80, `${n} critères`);
  }
});

test('date courte et choix mémorisé', () => {
  assert.equal(shortDate(new Date(2026, 8, 13).getTime()), '13.09.26');
  assert.equal(parseStoryChoice('releve'), 'releve');
  assert.equal(parseStoryChoice('autre'), null);
  assert.equal(parseStoryChoice(null), null);
});

test('un avis trop long est coupé à trois lignes, avec points de suspension', () => {
  const measure = (s) => s.length;
  const lines = wrapLines('un deux trois quatre cinq six sept huit neuf dix onze douze', 12, 3, measure);
  assert.equal(lines.length, 3);
  assert.ok(lines[2].endsWith('…'));
  assert.ok(lines.every((l) => l.length <= 12));
  assert.deepEqual(wrapLines('court', 12, 3, measure), ['court']);
});

test('le verdict en un mot suit la note', () => {
  assert.equal(verdictWord(9.4), 'CHEF-D’ŒUVRE');
  assert.equal(verdictWord(8), 'COUP DE CŒUR');
  assert.equal(verdictWord(7.0), 'VALIDÉ');
  assert.equal(verdictWord(6.9), 'SYMPA, SANS PLUS');
  assert.equal(verdictWord(5.2), 'MITIGÉ');
  assert.equal(verdictWord(4), 'DÉÇU');
  assert.equal(verdictWord(1.5), 'NAVET');
});

test('texte noir seulement sur une photo claire', () => {
  assert.equal(autoColor(0.8), 'noir');
  assert.equal(autoColor(0.3), 'blanc');
});

test('les styles défilent en boucle dans les deux sens', () => {
  assert.equal(cycle(RELEVE_STYLES, 'badge'), 'ligne');
  assert.equal(cycle(RELEVE_STYLES, 'ligne', -1), 'badge');
  assert.equal(cycle(RELEVE_STYLES, 'ligne'), 'compact');
});

test('balayage, toucher et déplacement ne se confondent pas', () => {
  assert.ok(isFlick(160, 20, 180));
  assert.ok(!isFlick(160, 20, 600), 'trop lent : c’est un déplacement');
  assert.ok(!isFlick(60, 5, 120), 'trop court');
  assert.ok(!isFlick(140, 120, 150), 'trop vertical');
  assert.ok(isTap(4, 3, 120));
  assert.ok(!isTap(40, 0, 120));
});

test('le badge part dans le coin bas gauche, le compact en bas', () => {
  const small = { width: 363, height: 363 };
  const badge = defaultPlacement('releve', small, 'badge');
  assert.ok(badge.cx < STORY_W / 2);
  assert.ok(badge.cy + small.height / 2 <= STORY_H - SAFE_BOTTOM);
  const compact = defaultPlacement('releve', box, 'compact');
  assert.ok(compact.cy > defaultPlacement('releve', box, 'ligne').cy);
});
