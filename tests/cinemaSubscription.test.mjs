import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Transpile et exécute le module livré, comme `tests/tv.test.mjs`. */
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => ({}));
  return exports;
}

const { attachForgottenSubscriptionSessions, getSubscriptionSessions } = load('../utils/cinemaSubscription.ts');

const ugc = {
  id: 'sub-ugc',
  name: 'UGC Illimité',
  provider: 'ugc',
  active: true,
  startDate: '2026-06-30T22:00:00.000Z',
  monthlyPrice: 11.9,
  referenceTicketPrice: 8,
};

const film = (title, watched_at, viewingContext) => ({
  id: title,
  title,
  status: 'watched',
  ratings: { story: 7, visuals: 7, acting: 7, sound: 7 },
  watches: [{ id: `${title}-1`, watch_number: 1, watched_at, ratings: {}, viewingContext }],
});

test('« Cinéma » chez UGC sans paiement, depuis le début : rattaché à l’abonnement', () => {
  const movies = [film('Verity', '2026-10-07T00:00:00.000Z', { locationType: 'cinema', cinemaProvider: 'ugc' })];
  assert.equal(getSubscriptionSessions(movies, ugc).length, 0);
  const repaired = attachForgottenSubscriptionSessions(movies, ugc);
  assert.equal(repaired.length, 1);
  assert.deepEqual(repaired[0].watches[0].viewingContext, {
    locationType: 'cinema',
    cinemaProvider: 'ugc',
    paymentType: 'subscription',
    subscriptionId: 'sub-ugc',
  });
  assert.equal(getSubscriptionSessions(repaired, ugc).length, 1);
});

test('un paiement choisi, un autre cinéma, la maison ou avant l’abonnement : on ne touche à rien', () => {
  const movies = [
    film('Payé', '2026-10-01T00:00:00.000Z', { locationType: 'cinema', cinemaProvider: 'ugc', paymentType: 'paid' }),
    film('Autre salle', '2026-10-01T00:00:00.000Z', { locationType: 'cinema', cinemaProvider: 'other' }),
    film('Canapé', '2026-10-01T00:00:00.000Z', { locationType: 'home' }),
    film('Avant', '2026-06-01T00:00:00.000Z', { locationType: 'cinema', cinemaProvider: 'ugc' }),
    film('Sans contexte', '2026-10-01T00:00:00.000Z', undefined),
  ];
  assert.deepEqual(attachForgottenSubscriptionSessions(movies, ugc), []);
});

test('un abonnement résilié ne récupère rien', () => {
  const movies = [film('Verity', '2026-10-07T00:00:00.000Z', { locationType: 'cinema', cinemaProvider: 'ugc' })];
  assert.deepEqual(attachForgottenSubscriptionSessions(movies, { ...ugc, active: false }), []);
});

test('une fois réparé, plus rien à faire', () => {
  const movies = [film('Verity', '2026-10-07T00:00:00.000Z', { locationType: 'cinema', cinemaProvider: 'ugc' })];
  const repaired = attachForgottenSubscriptionSessions(movies, ugc);
  assert.deepEqual(attachForgottenSubscriptionSessions(repaired, ugc), []);
});
