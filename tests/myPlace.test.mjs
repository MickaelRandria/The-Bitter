import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const source = readFileSync(new URL('../utils/myPlace.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function('exports', 'require', compiled)(exports, () => ({}));
const { myScreeningFor, isSameScreening, slotFromScreening } = exports;

const now = new Date(2026, 10, 15, 12, 0).getTime();
const at = (d, h, m = 0) => new Date(2026, 10, d, h, m).getTime();
const s = (o) => ({ id: 'x', status: 'scheduled', tmdbId: 1, startsAt: at(18, 19, 30), ...o });

test('finds my next screening for the film, cancelled and old ones left out', () => {
  const list = [s({ id: 'late', startsAt: at(20, 20) }), s({ id: 'soon' }), s({ id: 'gone', status: 'cancelled', startsAt: at(16, 20) }), s({ id: 'past', startsAt: at(10, 20) }), s({ id: 'other', tmdbId: 2, startsAt: at(16, 20) })];
  assert.equal(myScreeningFor(list, 1, now).id, 'soon');
  assert.equal(myScreeningFor(list, 3, now), null);
  assert.equal(myScreeningFor(list, null, now), null);
  // Une séance commencée il y a une heure compte encore.
  assert.equal(myScreeningFor([s({ id: 'running', startsAt: now - 3_600_000 })], 1, now).id, 'running');
});

test('same screening: a quarter of an hour, same cinema when both say it', () => {
  assert.equal(isSameScreening({ startsAt: at(18, 19, 30), cinemaName: 'UGC Ciné Cité Bercy' }, { startsAt: at(18, 19, 40), cinemaName: 'ugc cine cite bercy' }), true);
  assert.equal(isSameScreening({ startsAt: at(18, 19, 30), cinemaName: 'UGC Bercy' }, { startsAt: at(18, 19, 30), cinemaName: 'UGC Les Halles' }), false);
  assert.equal(isSameScreening({ startsAt: at(18, 19, 30) }, { startsAt: at(18, 20, 0) }), false);
  assert.equal(isSameScreening({ startsAt: at(18, 19, 30) }, { startsAt: at(18, 19, 30), cinemaName: 'UGC Bercy' }), true);
});

test('slot from screening', () => {
  const slot = slotFromScreening(s({ cinemaName: 'UGC Bercy', format: 'VF', bookingUrl: 'https://www.ugc.fr/x' }));
  assert.equal(slot.starts_at, new Date(at(18, 19, 30)).toISOString());
  assert.equal(slot.cinema_name, 'UGC Bercy');
  assert.equal(slot.version, 'VF');
});

test('space_screening_matches only reveals screenings matching mine, to members', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema auth;
      create table public.current (id uuid);
      create function auth.uid() returns uuid language sql as 'select id from public.current limit 1';
      create role authenticated; create role anon;
      create table public.space_members (space_id uuid, profile_id uuid, is_active boolean default true);
      create table public.cinema_screenings (id serial, profile_id uuid, tmdb_id int, starts_at timestamptz, cinema_name text, status text default 'scheduled');
    `);
    await db.exec(readFileSync(new URL('../supabase/migrations/20261115120000_space_screening_matches.sql', import.meta.url), 'utf8'));
    const me = '00000000-0000-0000-0000-000000000001';
    const marie = '00000000-0000-0000-0000-000000000002';
    const stranger = '00000000-0000-0000-0000-000000000003';
    const space = '00000000-0000-0000-0000-0000000000aa';
    await db.exec(`
      insert into public.current values ('${me}');
      insert into public.space_members values ('${space}', '${me}', true), ('${space}', '${marie}', true);
      insert into public.cinema_screenings (profile_id, tmdb_id, starts_at, cinema_name) values
        ('${me}', 1, now() + interval '3 days', 'UGC Bercy'),
        ('${marie}', 1, now() + interval '3 days' + interval '10 minutes', 'ugc bercy'),
        ('${marie}', 2, now() + interval '5 days', 'UGC Bercy'),
        ('${marie}', 1, now() + interval '4 days', 'UGC Bercy'),
        ('${stranger}', 1, now() + interval '3 days', 'UGC Bercy');
    `);
    const { rows } = await db.query(`select tmdb_id, profile_id from public.space_screening_matches('${space}')`);
    assert.deepEqual(rows, [{ tmdb_id: 1, profile_id: marie }]);
    // Hors de l'espace : rien.
    await db.exec(`update public.current set id = '${stranger}'`);
    const none = await db.query(`select * from public.space_screening_matches('${space}')`);
    assert.equal(none.rows.length, 0);
    await db.exec(readFileSync(new URL('../supabase/migrations/20261115120000_space_screening_matches.sql', import.meta.url), 'utf8'));
  } finally {
    await db.close();
  }
});
