import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Transpile et exécute api/agenda.ts, comme les autres tests de modules livrés. */
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => ({}));
  return exports;
}

const { buildCalendar, escapeText, fold } = load('../api/agenda.ts');

const feed = {
  first_name: 'Micka',
  screenings: [
    {
      id: 'a1',
      title: 'Hope',
      starts_at: '2026-11-08T19:30:00Z',
      cinema_name: 'UGC Rosny',
      cinema_address: '16 rue Konrad Adenauer, Rosny-sous-Bois',
      format: 'VOST',
      status: 'scheduled',
      booking_url: 'https://www.ugc.fr/reservation.html?id=1',
      updated_at: '2026-11-02T10:00:00Z',
    },
    { id: 'b2', title: 'Karma', starts_at: '2026-11-12T20:00:00Z', status: 'pending' },
  ],
};

test('agenda : un événement par séance, à l’heure UTC, 2 h 30 bloquées', () => {
  const ics = buildCalendar(feed, new Date('2026-11-02T12:00:00Z'));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 2);
  assert.ok(ics.includes('UID:a1@thebitter.watch'));
  assert.ok(ics.includes('DTSTART:20261108T193000Z'));
  assert.ok(ics.includes('DTEND:20261108T220000Z'));
  assert.ok(ics.includes('X-WR-CALNAME:Séances de Micka · The Bitter'));
  assert.ok(ics.includes('STATUS:TENTATIVE'));
  assert.ok(ics.includes('LOCATION:UGC Rosny\\, 16 rue Konrad Adenauer\\, Rosny-sous-Bois'));
  // Aucune ligne ne dépasse 75 octets, et toutes finissent par CRLF.
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.ok(!/[^\r]\n/.test(ics));
});

test('agenda : le texte est échappé et les lignes longues repliées', () => {
  assert.equal(escapeText('a, b; c\\d\ne'), 'a\\, b\\; c\\\\d\\ne');
  const long = 'DESCRIPTION:' + 'é'.repeat(80);
  const folded = fold(long);
  assert.ok(folded.includes('\r\n '));
  assert.equal(folded.replace(/\r\n /g, ''), long);
});
