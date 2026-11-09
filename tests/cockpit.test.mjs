import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Le module pur du cockpit, transpilé et exécuté tel quel. */
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => {
    throw new Error('Ce module doit rester sans dépendance.');
  });
  return exports;
}

const { buildSnapshot, isTestAccount, statusOf, OWNER_EMAIL } = load('../supabase/functions/cockpit/logic.ts');

const now = new Date('2026-11-09T12:00:00Z');
const daysAgo = (n) => new Date(now.getTime() - n * 86_400_000).toISOString();
const account = (id, email, joined = 100, firstName = id) => ({ id, email, firstName, createdAt: daysAgo(joined), confirmed: true });
const rated = (profileId, ago, tmdbId = 1) => ({ profileId, tmdbId, title: `Film ${tmdbId}`, ratedAt: daysAgo(ago), createdAt: daysAgo(ago) });
const several = (profileId, count, ago) => Array.from({ length: count }, (_, i) => rated(profileId, ago, i + 1));
const snapshot = (accounts, movies, extra = {}) =>
  buildSnapshot({ accounts, movies, usage: [], screenings: [], pushActive: 0, ...extra }, now);

test('les comptes de test sont reconnus', () => {
  for (const email of ['a+test1@gmail.com', 'x@yopmail.com', 'review@thebitter.watch', 'demo.camille@thebitter.watch']) {
    assert.equal(isTestAccount(email), true, email);
  }
  assert.equal(isTestAccount('marie@yahoo.fr'), false);
  assert.equal(isTestAccount(null), false);
});

test('le statut suit les notes récentes puis le total', () => {
  assert.equal(statusOf(1, 1), 'active');
  assert.equal(statusOf(5, 0), 'asleep');
  assert.equal(statusOf(4, 0), 'trial');
  assert.equal(statusOf(0, 0), 'never');
});

test('les comptes de test ne comptent nulle part', () => {
  const result = snapshot([account('a', 'a@x.fr'), account('t', 'x@yopmail.com')], [rated('t', 1)]);
  assert.equal(result.kpis.accounts, 1);
  assert.equal(result.excludedTests, 1);
  assert.equal(result.kpis.notes30, 0);
  assert.equal(result.days.reduce((sum, day) => sum + day.count, 0), 0);
});

test('le parcours ne compte comme encore là que les comptes engagés', () => {
  const result = snapshot(
    [account('o', OWNER_EMAIL), account('b', 'b@x.fr'), account('c', 'c@x.fr'), account('d', 'd@x.fr')],
    [...several('o', 6, 2), ...several('b', 6, 90), rated('c', 3)]
  );
  assert.deepEqual(result.funnel, { created: 4, firstNote: 3, fiveNotes: 2, stillHere: 1 });
  assert.equal(result.groups.asleep, 1);
  assert.equal(result.groups.never, 1);
  assert.equal(result.kpis.othersActive30, 1);
  assert.equal(result.kpis.ownerNotes30, 6);
});

test('un prénom par défaut laisse la place à l’adresse', () => {
  const result = snapshot([account('a', 'jean.d@x.fr', 100, 'Utilisateur')], []);
  assert.equal(result.contacts[0].name, 'jean.d');
});

test('une séance passée sans note est signalée, une séance future non', () => {
  const result = snapshot([account('a', 'a@x.fr')], [rated('a', 1, 7)], {
    screenings: [
      { profileId: 'a', tmdbId: 7, startsAt: daysAgo(2) },
      { profileId: 'a', tmdbId: 8, startsAt: daysAgo(3) },
      { profileId: 'a', tmdbId: 9, startsAt: daysAgo(-3) },
    ],
  });
  assert.equal(result.groups.screenings, 2);
  assert.equal(result.groups.screeningsUnrated, 1);
});

test('les appels IA sont cumulés et le pic lu par jour', () => {
  const result = snapshot([account('o', OWNER_EMAIL), account('b', 'b@x.fr')], [], {
    usage: [
      { userId: 'o', day: daysAgo(1).slice(0, 10), calls: 4 },
      { userId: 'b', day: daysAgo(1).slice(0, 10), calls: 2 },
      { userId: 'o', day: daysAgo(2).slice(0, 10), calls: 3 },
    ],
  });
  assert.deepEqual(result.ai, { total: 9, owner: 7, peak: 6 });
});
