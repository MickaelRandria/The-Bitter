import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * Import de billets : les deux modules purs des fonctions Edge.
 *
 * Même chargeur que `tv.test.mjs` : le fichier TypeScript livré est transpilé
 * et exécuté tel quel. Les données viennent du vrai annuaire UGC et de la vraie
 * grille de l'UGC Talence, relevés le 24 septembre 2026 — titres en majuscules
 * et entités décodées compris, puisque c'est sous cette forme que la fonction
 * les compare.
 */
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => {
    throw new Error('Ces modules doivent rester sans dépendance.');
  });
  return exports;
}

const { resolveCinema, isGenericCinemaName, titleSimilarity, findShowing, normalizeTime, isoToUgcDate } = load(
  '../supabase/functions/cinema-directory/ticketMatch.ts'
);
const { parseTickets } = load('../supabase/functions/ticket-scan/parseTickets.ts');

const CINEMAS = [
  { id: '10', name: 'UGC Ciné Cité Les Halles', city: 'Paris' },
  { id: '12', name: 'UGC Ciné Cité Bercy', city: 'Paris' },
  { id: '37', name: 'UGC Ciné Cité Paris 19', city: 'Paris' },
  { id: '11', name: 'UGC Lyon Bastille', city: 'Paris' },
  { id: '1', name: 'UGC Ciné Cité Bordeaux Gambetta', city: 'Bordeaux' },
  { id: '57', name: 'UGC Ciné Cité Bassins à Flot', city: 'Bordeaux' },
  { id: '42', name: 'UGC Talence', city: 'Bordeaux' },
  { id: '36', name: 'UGC Ciné Cité Confluence', city: 'Lyon' },
  { id: '24', name: "UGC Ciné Cité Villeneuve d'Ascq", city: 'Lille' },
];

const showing = (id, title, time, version) => ({
  id,
  title,
  filmId: title,
  version,
  room: '',
  date: '25/09/2026',
  time,
  endTime: '',
});

const TALENCE = [
  showing('330600285952', 'HEART OF THE BEAST', '19:45', 'VF'),
  showing('330600286036', 'HEART OF THE BEAST', '20:00', 'VOSTF'),
  showing('330600285944', 'HEART OF THE BEAST', '22:00', 'VF'),
  showing('330600285826', 'RESIDENT EVIL', '20:00', 'VOSTF'),
  showing('330600286226', "L'ODYSSÉE", '20:40', 'VOSTF'),
  showing('330600286127', "LA BATAILLE DE GAULLE - PARTIE 2 : J'ÉCRIS TON NOM", '20:30', 'VF'),
  showing('330600285963', 'SPIDER-MAN : BRAND NEW DAY', '20:30', 'VOSTF'),
  showing('330600285916', 'JUSTIN LE JUSTE', '19:30', 'VF'),
];

const ticket = (title, time, version = '') => ({ title, cinema: 'UGC Talence', date: '2026-09-25', time, version });

test('le cinéma lu est retrouvé dans l’annuaire, même abrégé', () => {
  assert.equal(resolveCinema('UGC Talence', CINEMAS)?.id, '42');
  assert.equal(resolveCinema('Talence', CINEMAS)?.id, '42');
  assert.equal(resolveCinema('UGC CINE CITE LES HALLES', CINEMAS)?.id, '10');
  assert.equal(resolveCinema('Les Halles', CINEMAS)?.id, '10');
  assert.equal(resolveCinema('UGC Ciné Cité Paris 19', CINEMAS)?.id, '37');
  assert.equal(resolveCinema('Bassins a flot', CINEMAS)?.id, '57');
  // Une lettre mal lue sur la capture ne fait pas perdre le cinéma…
  assert.equal(resolveCinema('UGC Talance', CINEMAS)?.id, '42');
  assert.equal(resolveCinema('UGC Ciné Cité Confluance', CINEMAS)?.id, '36');
  // …mais un mot court ne se corrige pas : « Paris 18 » n'est pas « Paris 19 ».
  assert.notEqual(resolveCinema('UGC Paris 18', CINEMAS)?.id, '37');
});

test('un billet d’une autre enseigne ne tombe jamais dans un UGC voisin', () => {
  assert.equal(resolveCinema('Pathé Bordeaux', CINEMAS), null);
  assert.equal(resolveCinema('Mégarama Bordeaux', CINEMAS), null);
  assert.equal(resolveCinema('MK2 Bibliothèque', CINEMAS), null);
});

test('« UGC » seul ne désigne aucun cinéma : le billet retombe sur le cinéma habituel', () => {
  assert.equal(isGenericCinemaName('UGC'), true);
  assert.equal(isGenericCinemaName('UGC Ciné Cité'), true);
  assert.equal(isGenericCinemaName(''), true);
  assert.equal(isGenericCinemaName('UGC Talence'), false);
});

test('les titres se reconnaissent malgré la casse, les accents et les suffixes', () => {
  assert.equal(titleSimilarity('Heart of the Beast', 'HEART OF THE BEAST'), 1);
  assert.equal(titleSimilarity("L'Odyssée", "L'ODYSSÉE"), 1);
  assert.equal(titleSimilarity('Spider-Man: Brand New Day', 'SPIDER-MAN : BRAND NEW DAY'), 1);
  assert.ok(titleSimilarity('La Bataille de Gaulle – Partie 2', "LA BATAILLE DE GAULLE - PARTIE 2 : J'ÉCRIS TON NOM") >= 0.9);
  // Une lettre mal lue sur la capture (un zéro pour un O).
  assert.ok(titleSimilarity('HEART 0F THE BEAST', 'HEART OF THE BEAST') >= 0.6);
  assert.ok(titleSimilarity('Resident Evil', 'Justin le juste') < 0.6);
});

test('la séance réservée est retrouvée à l’heure près, la version départage', () => {
  const vostf = findShowing(ticket('Heart of the Beast', '20:00', 'VOSTF'), TALENCE);
  assert.equal(vostf.status, 'matched');
  assert.equal(vostf.showing.id, '330600286036');

  const sameHourOtherFilm = findShowing(ticket('Resident Evil', '20:00'), TALENCE);
  assert.equal(sameHourOtherFilm.showing.id, '330600285826');

  const longTitle = findShowing(ticket('La Bataille de Gaulle', '20:30'), TALENCE);
  assert.equal(longTitle.status, 'matched');
  assert.equal(longTitle.showing.id, '330600286127');
});

test('une heure mal lue propose les horaires du film, du plus proche au plus lointain', () => {
  const result = findShowing(ticket('Heart of the Beast', '19:50'), TALENCE);
  assert.equal(result.status, 'time-mismatch');
  assert.equal(result.showing, null);
  assert.deepEqual(result.alternatives.map((item) => item.time), ['19:45', '20:00', '22:00']);
});

test('un film absent de la grille n’est jamais rapproché d’un autre', () => {
  const result = findShowing(ticket('Dune : troisième partie', '20:00'), TALENCE);
  assert.equal(result.status, 'not-found');
  assert.deepEqual(result.alternatives, []);
});

test('heures et dates sont remises dans la forme attendue', () => {
  assert.equal(normalizeTime('9:05'), '09:05');
  assert.equal(normalizeTime('21h30'), '21:30');
  assert.equal(normalizeTime('21 H 30'), '21:30');
  assert.equal(normalizeTime('25:00'), null);
  assert.equal(normalizeTime('demain'), null);
  assert.equal(isoToUgcDate('2026-09-25'), '25/09/2026');
  assert.equal(isoToUgcDate('25/09/2026'), null);
});

test('la réponse du modèle est bornée, dédoublonnée, et les billets incomplets écartés', () => {
  const raw = JSON.stringify({
    tickets: [
      { title: 'HEART OF THE BEAST', cinema: 'UGC Talence', date: '2026-09-25', time: '20h00', version: 'VOSTF', room: 'Salle 7', seats: 2 },
      { title: 'HEART OF THE BEAST', cinema: 'UGC Talence', date: '2026-09-25', time: '20:00', version: 'VOSTF', room: '', seats: null },
      { title: 'Resident Evil', cinema: '', date: '2026-09-27', time: '22:10', version: '', room: '', seats: null },
      { title: 'Sans heure', cinema: 'UGC Talence', date: '2026-09-26', time: '', version: '', room: '', seats: 1 },
      { title: 'Date impossible', cinema: 'UGC Talence', date: '2026-02-31', time: '20:00', version: '', room: '', seats: 1 },
      { title: 'Année devinée de travers', cinema: 'UGC Talence', date: '2025-09-26', time: '20:00', version: '', room: '', seats: 1 },
    ],
  });
  const tickets = parseTickets(raw, '2026-09-24');
  assert.equal(tickets.length, 2);
  assert.deepEqual(tickets[0], {
    title: 'HEART OF THE BEAST',
    cinema: 'UGC Talence',
    date: '2026-09-25',
    time: '20:00',
    version: 'VOSTF',
    room: 'Salle 7',
    seats: 2,
  });
  // L'absence de places reste « une place », pas zéro.
  assert.equal(tickets[1].seats, 1);
  assert.equal(tickets[1].cinema, '');
});

test('une réponse enrobée de texte ou vide ne casse rien', () => {
  const wrapped = 'Voici les billets : {"tickets":[{"title":"Garance","cinema":"UGC Talence","date":"2026-09-25","time":"20:45"}]} Bon film !';
  assert.equal(parseTickets(wrapped, '2026-09-24').length, 1);
  assert.deepEqual(parseTickets('{"tickets":[]}', '2026-09-24'), []);
  assert.deepEqual(parseTickets('rien à voir', '2026-09-24'), []);
  assert.deepEqual(parseTickets('{"autre":1}', '2026-09-24'), []);
});

/**
 * Les deux ressorties du propriétaire, relevées sur l'app UGC le 10 octobre
 * 2026 : un titre court, « HUNGER GAMES », et un titre qui le prolonge,
 * « HUNGER GAMES : L'EMBRASEMENT », tous deux à 18:00 à l'UGC Talence.
 */
const RESSORTIES = [
  showing('400000000001', 'HUNGER GAMES', '18:00', 'VOSTF'),
  showing('400000000002', "HUNGER GAMES : L'EMBRASEMENT", '18:00', 'VOSTF'),
  showing('400000000003', "HUNGER GAMES : L'EMBRASEMENT", '20:45', 'VF'),
];

test('un titre court ne vole pas la séance d’un titre qui le prolonge', () => {
  const short = findShowing(ticket('HUNGER GAMES', '18:00', 'VOSTF'), RESSORTIES);
  assert.equal(short.status, 'matched');
  assert.equal(short.showing.id, '400000000001');

  const long = findShowing(ticket("Hunger Games : l'Embrasement", '18:00', 'VOSTF'), RESSORTIES);
  assert.equal(long.status, 'matched');
  assert.equal(long.showing.id, '400000000002');
});

test('le nom du cinéma en capitales, sur l’image partagée, reste reconnu', () => {
  assert.equal(resolveCinema('UGC TALENCE', CINEMAS)?.id, '42');
});
