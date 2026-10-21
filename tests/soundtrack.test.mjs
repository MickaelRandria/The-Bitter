import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Transpile et exécute le module livré, comme `tests/navActions.test.mjs`. */
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => ({}));
  return exports;
}

const match = load('../api/_soundtrack-match.ts');
const tags = load('../utils/soundtrackTags.ts');
const hit = (id, title, artist) => ({ id, title, artist: { name: artist } });

test('le compositeur confirme le bon album, même réédité', () => {
  const film = { titles: ['The Matrix', 'Matrix'], year: 1999, composers: ['Don Davis'] };
  const albums = match.pickAlbums(
    [
      hit(1, 'The Matrix Resurrections (Original Motion Picture Soundtrack)', 'Johnny Klimek'),
      hit(2, 'The Matrix (Original Motion Picture Score)', 'Don Davis'),
    ],
    film
  );
  assert.equal(albums[0].id, 2);
  assert.equal(albums[0].needsYear, false);
});

test('les faux positifs mesurés sont écartés', () => {
  const cases = [
    [{ titles: ['Avatar'], year: 2009, composers: ['James Horner'] }, hit(1, 'Avatar: Frontiers of Pandora (Original Game Soundtrack)', 'Pinar Toprak')],
    [{ titles: ['The Mask'], year: 1994, composers: ['Randy Edelman'] }, hit(2, 'Son Of The Mask (Original Motion Picture Soundtrack)', 'Various Artists')],
    [{ titles: ['Karma'], year: 2026, composers: ['Some Composer'] }, hit(3, 'KARMA (VIVINOS - ALNST Original Soundtrack Part.10)', 'RUBYEYE')],
    [{ titles: ['The Housemaid', 'La Femme de ménage'], year: 2025, composers: ['Theodore Shapiro'] }, hit(4, 'The Housemaid (Unofficial Motion Picture Soundtrack)', 'Various')],
    [{ titles: ['Spider-Man: Brand New Day'], year: 2026, composers: ['Michael Giacchino'] }, hit(5, 'The Amazing Spider-Man 2 (The Original Motion Picture Soundtrack) [Deluxe]', 'Various Artists')],
    [{ titles: ['Memento'], year: 2000, composers: ['David Julyan'] }, hit(6, 'MementoMori Original Soundtrack', 'Bank of Innovation, Inc.')],
  ];
  for (const [film, album] of cases) assert.deepEqual(match.pickAlbums([album], film), [], album.title);
});

test('les albums français et les chansons du film sont reconnus', () => {
  const cocorico = match.pickAlbums([hit(1, 'Cocorico 2 (Bande originale du film)', 'Mateï Bratescot')], { titles: ['Cocorico 2'], year: 2026, composers: [] });
  assert.equal(cocorico.length, 1);
  assert.equal(cocorico[0].needsYear, true);

  const michael = match.pickAlbums(
    [
      hit(1, 'Michael: Songs From The Motion Picture', 'Michael Jackson'),
      hit(2, 'Michael (Original Motion Picture Score)', 'Rupert Gregson-Williams'),
    ],
    { titles: ['Michael'], year: 2026, composers: ['Rupert Gregson-Williams'] }
  );
  assert.deepEqual(michael.map((a) => [a.id, a.kind]), [[2, 'score'], [1, 'songs']]);
});

test('un album « Titre (Original Soundtrack) » passe, sous l’année du film', () => {
  const marty = match.pickAlbums([hit(1, 'Marty Supreme (Original Soundtrack)', 'Daniel Lopatin')], { titles: ['Marty Supreme'], year: 2025, composers: ['Oneohtrix Point Never'] });
  assert.equal(marty.length, 1);
  assert.equal(marty[0].needsYear, true);
});

test('la recherche essaie le titre local en bande originale', () => {
  const queries = match.searchQueries({ titles: ['The Blow', 'La Frappe'], year: 2026, composers: [] });
  assert.ok(queries.includes('La Frappe bande originale'));
  assert.ok(queries.length <= 6);
});

test('le nom de famille suffit, accents compris', () => {
  assert.equal(match.composerSigns('Ludwig Goransson', ['Ludwig Göransson']), true);
  assert.equal(match.composerSigns('Hans Zimmer & Lisa Gerrard', ['Hans Zimmer']), true);
  assert.equal(match.composerSigns('Various Artists', ['Hans Zimmer']), false);
});

test('sans compositeur, l’année de l’album doit coller au film', () => {
  assert.equal(match.confirmYear('2026-03-01', 2026), true);
  assert.equal(match.confirmYear('2012-01-01', 2009), false);
  assert.equal(match.confirmYear(undefined, 2020), false);
});

test('l’avis sur la BO vit dans les tags sans toucher aux autres', () => {
  let list = ['perso'];
  list = tags.withVerdict(list, 'memorable');
  list = tags.toggleFavorite(list, 123);
  list = tags.toggleFavorite(list, 456);
  assert.deepEqual(tags.readSoundtrack(list), { verdict: 'memorable', favorites: [123, 456] });
  list = tags.toggleFavorite(list, 123);
  list = tags.withVerdict(list, null);
  assert.deepEqual(tags.readSoundtrack(list), { verdict: null, favorites: [456] });
  assert.ok(list.includes('perso'));
  assert.deepEqual(tags.readSoundtrack(undefined), { verdict: null, favorites: [] });
});

const score = load('../utils/soundScore.ts');

test('la note Son vient du critère sound, jamais d’une note plate', () => {
  const flat = { ratings: { story: 7, visuals: 7, acting: 7, sound: 7 } };
  assert.equal(score.soundScore(flat), null);
  assert.equal(score.soundScore({ ratings: { story: 6, visuals: 8.5, acting: 7, sound: 5.5 } }), 5.5);
  const adaptive = { ratings: { story: 8.9, visuals: 8.9, acting: 8.9, sound: 8.9 }, adaptiveRating: { criteria: [{ key: 'scenario', value: 9 }, { key: 'sound', value: 9.5 }] } };
  assert.equal(score.soundScore(adaptive), 9.5);
  const skipped = { ratings: { story: 6, visuals: 8, acting: 7, sound: 5 }, adaptiveRating: { criteria: [{ key: 'scenario', value: 6 }], skipped: ['sound'] } };
  assert.equal(score.soundScore(skipped), null);
});

test('l’avis se découpe en fragments de mots entiers', () => {
  const parts = score.reviewFragments('J’ai senti mon souffle coupé jusqu’à ce que les questions de Caleb se transforment en un miroir tendu vers mes propres certitudes.');
  assert.equal(parts.length, 4);
  assert.ok(parts.every((p) => p.length > 0 && !p.startsWith(' ')));
  assert.equal(parts.join(' ').split(' ').length, 22);
  assert.deepEqual(score.reviewFragments('Génial.'), ['Génial.']);
  assert.deepEqual(score.reviewFragments(''), []);
});
