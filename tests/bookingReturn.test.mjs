import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const load = (path) => {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => ({}));
  return exports;
};

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const { rememberBookingTrip, takeBookingTrip } = load('../services/bookingReturn.ts');
const { socialMessage } = load('../supabase/functions/notify/messages.ts');

test('la question ne s’ouvre qu’au vrai retour, une seule fois', () => {
  const t0 = 1_000_000;
  rememberBookingTrip('s1', t0);
  assert.equal(takeBookingTrip(t0 + 3_000), null, 'onglet UGC à peine ouvert : pas encore');
  assert.equal(takeBookingTrip(t0 + 60_000), 's1');
  assert.equal(takeBookingTrip(t0 + 70_000), null, 'déjà posée');
});

test('trop tard au retour : la carte du calendrier et la notification prennent le relais', () => {
  const t0 = 5_000_000;
  rememberBookingTrip('s2', t0);
  assert.equal(takeBookingTrip(t0 + 4 * 3_600_000), null);
  assert.equal(takeBookingTrip(t0 + 4 * 3_600_000 + 1), null, 'et le départ est oublié');
});

test('la notification de la veille dit le film, l’heure et la salle', () => {
  const message = socialMessage({
    kind: 'booking_check',
    title: 'Scrooge',
    payload: { screening_id: 'x', starts_at: '2026-11-18T19:15:00Z', cinema_name: 'UGC Talence' },
  });
  assert.equal(message.title, 'Tu as bien tes places pour Scrooge ?');
  assert.match(message.body, /UGC Talence/);
  assert.match(message.body, /20 h 15/);
  assert.match(message.body, /Confirme en un geste/);
});
