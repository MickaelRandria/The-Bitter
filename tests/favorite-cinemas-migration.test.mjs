import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('migration preserves existing favorites and enforces the array limit', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table public.profiles (id integer primary key, favorite_cinema jsonb);
      insert into public.profiles values
        (1, '{"id":"ugc1","name":"Les Halles","city":"Paris"}'), (2, null);`);
    await db.exec(readFileSync(new URL('../supabase/migrations/20261114183728_favorite_cinemas.sql', import.meta.url), 'utf8'));
    const { rows } = await db.query('select * from public.profiles order by id');
    assert.deepEqual(rows[0].favorite_cinemas, [rows[0].favorite_cinema]);
    assert.equal(rows[1].favorite_cinemas, null);
    await db.exec("update public.profiles set favorite_cinemas = '[1,2,3,4,5]' where id = 2");
    await assert.rejects(db.exec("update public.profiles set favorite_cinemas = '[1,2,3,4,5,6]' where id = 2"));
    await assert.rejects(db.exec("update public.profiles set favorite_cinemas = '{}' where id = 2"));
  } finally {
    await db.close();
  }
});

test('migration is replayable and keeps the list in step with legacy clients', async () => {
  const db = new PGlite();
  const sql = readFileSync(new URL('../supabase/migrations/20261114183728_favorite_cinemas.sql', import.meta.url), 'utf8');
  const H = '{"id":"h","name":"Les Halles","city":"Paris"}';
  const B = '{"id":"b","name":"Bercy","city":"Paris"}';
  const M = '{"id":"m","name":"Montparnasse","city":"Paris"}';
  try {
    await db.exec(`create table public.profiles (id integer primary key, favorite_cinema jsonb);
      insert into public.profiles values (1, '${H}'), (2, null);`);
    await db.exec(sql);
    await db.exec(sql); // rejouée sans erreur
    const ids = async (id) =>
      (await db.query('select favorite_cinemas from public.profiles where id = $1', [id])).rows[0].favorite_cinemas?.map((c) => c.id) ?? null;

    // Nouveau client : écrit les deux colonnes, le déclencheur ne touche à rien.
    await db.exec(`update public.profiles set favorite_cinemas = '[${H},${B},${M}]', favorite_cinema = '${H}' where id = 1`);
    assert.deepEqual(await ids(1), ['h', 'b', 'm']);

    // Ancien client : change le favori seul → il passe en tête, sans doublon.
    await db.exec(`update public.profiles set favorite_cinema = '${M}' where id = 1`);
    assert.deepEqual(await ids(1), ['m', 'b']);

    // Ancien client : retire le favori → la tête de liste disparaît.
    await db.exec(`update public.profiles set favorite_cinema = null where id = 1`);
    assert.deepEqual(await ids(1), ['b']);

    // Ancien client sur un profil vide : la liste naît avec ce cinéma.
    await db.exec(`update public.profiles set favorite_cinema = '${B}' where id = 2`);
    assert.deepEqual(await ids(2), ['b']);
  } finally {
    await db.close();
  }
});
