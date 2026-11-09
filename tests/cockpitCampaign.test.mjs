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

const { buildEmail, tmdbImage, scoreOf, frenchNote, shortNews, draftMessages, parseDraft, isSegment } = load('../supabase/functions/cockpit/campaign.ts');
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

const poster = 'https://image.tmdb.org/t/p/w780/abc.jpg';
const base = { firstName: '<b>Inès</b>', subject: 'Salut', line: 'Un <script>', appUrl: 'https://a.b', unsubscribeUrl: 'https://a.b/u?t=1' };
const empty = { wall: [], best: null, spaceNotes: [], popular: [], news: [], backdrop: null };
const build = (format, content) => buildEmail({ ...base, format, content: { ...empty, ...content } });

test('le mur compte les films de la personne et échappe tout', () => {
  const email = build('wall', { wall: [{ title: 'A', poster }, { title: 'B', poster }] });
  assert.ok(email.html.includes('2 films attendent ta note'));
  assert.ok(email.html.includes('/t/p/w342/abc.jpg'));
  assert.ok(!email.html.includes('<script>'));
  assert.ok(!email.html.includes('<b>Inès'));
  assert.ok(email.html.includes('https://a.b/u?t=1'));
  assert.ok(email.text.includes('Ne plus recevoir'));
});

test('sans liste, le mur prend les films populaires', () => {
  const email = build('wall', { popular: [{ title: 'P', poster }] });
  assert.ok(email.html.includes('Par quoi tu commences'));
  assert.equal(build('wall', {}), null);
});

test('le format notes exige une note récente', () => {
  assert.equal(build('notes', {}), null);
  const email = build('notes', { best: { title: 'F', poster, note: 9.2 }, spaceNotes: [{ title: 'G', poster, who: 'Nora', note: 8 }] });
  assert.ok(email.html.includes('9,2'));
  assert.ok(email.html.includes('8,0'));
  assert.ok(email.html.includes('Nora'));
});

test('le format nouveautés exige du contenu', () => {
  assert.equal(build('news', {}), null);
  const email = build('news', { news: [{ title: 'N', text: 'T' }], backdrop: poster });
  assert.ok(email.html.includes('Quoi de neuf'));
  assert.ok(email.html.includes('/t/p/w780/abc.jpg'));
});

test('seules les images TMDB passent', () => {
  assert.equal(tmdbImage('https://evil.example/x.jpg', 'w342'), null);
  assert.equal(tmdbImage(poster, 'w154'), 'https://image.tmdb.org/t/p/w154/abc.jpg');
});

test('la note suit la règle de l’app', () => {
  assert.equal(scoreOf({ adaptive_rating: { weightedRating: 7.4 }, story: 1, visuals: 1, acting: 1, sound: 1 }), 7.4);
  assert.equal(scoreOf({ adaptive_rating: null, story: '8', visuals: '6', acting: '7', sound: '9' }), 7.5);
  assert.equal(scoreOf({ adaptive_rating: null }), null);
  assert.equal(frenchNote(9), '9,0');
});

test('une nouveauté se réduit à sa première phrase', () => {
  assert.equal(shortNews('Court. Et la suite.'), 'Court.');
  assert.ok(shortNews('x'.repeat(200)).length <= 90);
});

test('l’IA ne reçoit aucune donnée personnelle et son brouillon est contrôlé', () => {
  assert.ok(!JSON.stringify(draftMessages('asleep', 'write', '', '')).includes('@'));
  assert.deepEqual(parseDraft('{"subject":" Objet ","body":" Texte "}'), { subject: 'Objet', body: 'Texte' });
  assert.equal(parseDraft('{"subject":"Objet"}'), null);
  assert.equal(parseDraft('pas du json'), null);
  assert.equal(isSegment('asleep'), true);
  assert.equal(isSegment('active'), true);
  assert.equal(isSegment('tous'), false);
});
