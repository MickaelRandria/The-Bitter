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

const { inTheaters, guessMoment, momentInstant, pickShowtime, sameTitle, catchupCandidates } = load('../utils/seance.ts');

const at = (d, h, m = 0) => new Date(2026, 10, d, h, m).getTime();

test('séance : encore en salle pendant dix semaines', () => {
  assert.ok(inTheaters('2026-10-01', at(2, 12)));
  assert.ok(!inTheaters('2026-07-01', at(2, 12)));
  assert.ok(!inTheaters(undefined, at(2, 12)));
});

test('séance : le moment deviné d’après l’heure de la note', () => {
  assert.deepEqual(guessMoment(at(2, 9)), { day: 'yesterday', moment: 'evening' });
  assert.deepEqual(guessMoment(at(2, 23, 30)), { day: 'today', moment: 'night' });
  assert.equal(new Date(momentInstant('yesterday', 'evening', at(2, 9))).getDate(), 1);
  assert.equal(new Date(momentInstant('2026-10-20', 'afternoon', at(2, 9))).getHours(), 15);
});

test('séance : la dernière séance finie avant la note, film de 2 h', () => {
  const shows = [{ startsAt: at(1, 16) }, { startsAt: at(1, 20, 45) }, { startsAt: at(1, 22, 10) }];
  // Noté à 23 h 10 : la séance de 22 h 10 n'est pas finie, c'était celle de 20 h 45.
  assert.equal(pickShowtime(shows, at(1, 23, 10), 120).startsAt, at(1, 20, 45));
  assert.equal(pickShowtime(shows, at(1, 17), 120), null);
  assert.ok(sameTitle('Hunger Games : Lever de soleil', 'HUNGER GAMES – LEVER DE SOLEIL'));
});

test('rattrapage : vus au cinéma, ou pendant leur sortie, sans séance', () => {
  const films = [
    { id: 'a', tmdbId: 1, status: 'watched', dateAdded: at(1, 20), location: 'cinema' },
    { id: 'b', tmdbId: 2, status: 'watched', dateAdded: at(1, 20), releaseDate: '2026-10-15' },
    { id: 'c', tmdbId: 3, status: 'watched', dateAdded: at(1, 20), releaseDate: '2026-10-15', location: 'home' },
    { id: 'd', tmdbId: 4, status: 'watched', dateAdded: at(1, 20), location: 'cinema' },
    { id: 'e', tmdbId: 5, status: 'watched', dateAdded: at(1, 20), releaseDate: '2001-01-01' },
    { id: 'f', tmdbId: 6, status: 'watched', dateAdded: at(1, 20), location: 'cinema' },
  ];
  const out = catchupCandidates(films, new Set([4]), new Set(['f']));
  assert.deepEqual(out.map((m) => m.id).sort(), ['a', 'b']);
});
