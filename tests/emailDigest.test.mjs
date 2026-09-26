import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * L'e-mail de secours, tel que l'Edge Function `email-digest` le construit.
 * Chargé avec sa dépendance réelle (`notify/messages.ts`), pas une copie.
 */
function load(relative, from = import.meta.url) {
  const url = new URL(relative, from);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, (id) => load(id, url));
  return exports;
}

const { buildDigestEmail } = load('../supabase/functions/email-digest/email.ts');
const base = { appUrl: 'https://thebitter.watch', unsubscribeUrl: 'https://thebitter.watch/api/unsubscribe?t=abc' };
const invite = {
  id: 'n1', kind: 'watch_invite', title: 'Dune', poster_url: 'https://image.tmdb.org/t/p/w780/x.jpg',
  actor: 'Mika', guest_name: null, rating: null, payload: null,
};

test('une seule invitation : son titre fait le sujet', () => {
  const email = buildDigestEmail({ ...base, firstName: 'Léa', items: [invite] });
  assert.equal(email.subject, 'Mika veut voir Dune avec toi');
  assert.match(email.html, /Salut Léa,/);
  assert.match(email.html, /https:\/\/thebitter\.watch\/\?notif=n1/);
  assert.match(email.html, /\/t\/p\/w154\/x\.jpg/, 'affiche réduite');
  assert.match(email.text, /Ne plus recevoir ces e-mails : https:\/\/thebitter\.watch\/api\/unsubscribe\?t=abc/);
});

test('plusieurs réponses : qui attend, en toutes lettres', () => {
  const email = buildDigestEmail({
    ...base,
    firstName: '',
    items: [invite, { ...invite, id: 'n2', kind: 'plan_proposed', actor: 'Tom', payload: { slots: [{ starts_at: '2026-10-03T18:30:00Z' }] } }],
  });
  assert.equal(email.subject, 'Mika et Tom t’attendent sur The Bitter');
  assert.match(email.html, /Salut,/);
  assert.match(email.html, /Tom propose une séance pour Dune/);
});

test('rien de ce qui vient de la base n’entre brut dans le HTML', () => {
  const email = buildDigestEmail({ ...base, firstName: '<b>Léa</b>', items: [{ ...invite, title: '<img src=x onerror=alert(1)>', poster_url: 'javascript:alert(1)' }] });
  assert.doesNotMatch(email.html, /<img src=x/);
  assert.doesNotMatch(email.html, /<b>Léa/);
  assert.doesNotMatch(email.html, /javascript:/);
});
