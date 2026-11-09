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
  new Function('exports', 'require', compiled)(exports, () => {
    throw new Error('Ce module doit rester sans dépendance.');
  });
  return exports;
}

const { buildCampaignEmail, draftMessages, parseDraft, isSegment } = load('../supabase/functions/cockpit/campaign.ts');
const { buildSnapshot } = load('../supabase/functions/cockpit/logic.ts');

const now = new Date('2026-11-09T12:00:00Z');
const daysAgo = (n) => new Date(now.getTime() - n * 86_400_000).toISOString();
const person = (id, extra = {}) => ({ id, email: `${id}@x.fr`, firstName: id, createdAt: daysAgo(100), confirmed: true, marketingConsent: true, emailNotifications: true, ...extra });
const snapshot = (accounts, extra = {}) => buildSnapshot({ accounts, movies: [], usage: [], screenings: [], pushActive: 0, campaigns: [], sends: [], ...extra }, now);
const canReceive = (accountExtra, inputExtra) => snapshot([person('a', accountExtra)], inputExtra).contacts[0].canReceive;

test('seul un oui explicite ouvre les envois', () => {
  assert.equal(canReceive({}), true);
  assert.equal(canReceive({ marketingConsent: null }), false);
  assert.equal(canReceive({ marketingConsent: false }), false);
});

test('une désinscription, une adresse absente ou non confirmée ferment la porte', () => {
  assert.equal(canReceive({ emailNotifications: false }), false);
  assert.equal(canReceive({ email: null }), false);
  assert.equal(canReceive({ confirmed: false }), false);
});

test('pas de nouvel e-mail pendant 14 jours', () => {
  const sendAt = (ago) => ({ sends: [{ campaignId: 'c', profileId: 'a', sentAt: daysAgo(ago) }] });
  assert.equal(canReceive({}, sendAt(13)), false);
  assert.equal(canReceive({}, sendAt(15)), true);
});

test('le résultat compte les notes dans les 7 jours suivant l’envoi', () => {
  const rated = (ago) => ({ profileId: 'a', tmdbId: 1, title: 'F', ratedAt: daysAgo(ago), createdAt: daysAgo(ago) });
  const input = (movies) =>
    buildSnapshot({
      accounts: [person('a')], movies, usage: [], screenings: [], pushActive: 0,
      campaigns: [{ id: 'c', segment: 'never', subject: 'S', createdAt: daysAgo(10) }],
      sends: [{ campaignId: 'c', profileId: 'a', sentAt: daysAgo(10) }],
    }, now).campaigns[0];
  assert.equal(input([rated(8)]).rated7, 1);
  assert.equal(input([rated(2)]).rated7, 0);
  assert.equal(input([rated(11)]).rated7, 0);
});

test('l’e-mail échappe le contenu et porte la désinscription', () => {
  const email = buildCampaignEmail({ firstName: '<b>Inès</b>', subject: 'Salut', body: 'Un <script>\n\nDeux', appUrl: 'https://a.b', unsubscribeUrl: 'https://a.b/u?t=1' });
  assert.ok(!email.html.includes('<script>'));
  assert.ok(!email.html.includes('<b>Inès'));
  assert.ok(email.html.includes('https://a.b/u?t=1'));
  assert.ok(email.text.includes('Ne plus recevoir'));
  assert.equal((email.html.match(/font-size:15px;line-height:1.5;margin:0 0 12px/g) ?? []).length, 2);
});

test('l’IA ne reçoit aucune donnée personnelle et son brouillon est contrôlé', () => {
  assert.ok(!JSON.stringify(draftMessages('asleep', 'write', '', '')).includes('@'));
  assert.deepEqual(parseDraft('{"subject":" Objet ","body":" Texte "}'), { subject: 'Objet', body: 'Texte' });
  assert.equal(parseDraft('{"subject":"Objet"}'), null);
  assert.equal(parseDraft('pas du json'), null);
  assert.equal(isSegment('asleep'), true);
  assert.equal(isSegment('tous'), false);
});
