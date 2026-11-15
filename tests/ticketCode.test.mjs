import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { PGlite } from '@electric-sql/pglite';

const source = readFileSync(new URL('../utils/ticketCode.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
new Function('exports', 'require', compiled)(exports, () => ({}));
const { encodeTicketCode, decodeTicketCode, isTicketDay } = exports;

/** Dessine le QR comme l'app (segment octets), puis le relit comme l'app (jsQR). */
const redrawAndRead = (bytes) => {
  const qr = QRCode.create([{ data: bytes, mode: 'byte' }], { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const scale = 6, margin = 4, px = (size + margin * 2) * scale;
  const rgba = new Uint8ClampedArray(px * px * 4).fill(255);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!qr.modules.get(y, x)) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const i = (((y + margin) * scale + dy) * px + (x + margin) * scale + dx) * 4;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
    }
  }
  return jsQR(rgba, px, px);
};

test('encode / decode keeps the exact bytes', () => {
  const bytes = Uint8Array.from([0, 255, 128, 65, 66, 0xe9, 10]);
  const code = encodeTicketCode(bytes);
  assert.match(code, /^b:/);
  assert.deepEqual([...decodeTicketCode(code)], [...bytes]);
  assert.equal(encodeTicketCode([]), null);
  assert.equal(decodeTicketCode('nimporte'), null);
  assert.equal(decodeTicketCode(null), null);
});

test('a redrawn QR reads back the same bytes, text or binary', () => {
  for (const sample of [
    new TextEncoder().encode('UGC|1234567890|2026-11-18T19:30|SALLE 7|F12'),
    Uint8Array.from({ length: 120 }, (_, i) => (i * 37 + 11) % 256),
  ]) {
    const read = redrawAndRead(sample);
    assert.ok(read, 'QR illisible');
    const stored = encodeTicketCode(Uint8Array.from(read.binaryData));
    assert.deepEqual([...decodeTicketCode(stored)], [...sample]);
  }
});

test('ticket day window', () => {
  const start = Date.UTC(2026, 10, 18, 18, 30);
  assert.equal(isTicketDay(start, start - 2 * 86_400_000), false);
  assert.equal(isTicketDay(start, start - 3_600_000), true);
  assert.equal(isTicketDay(start, start + 4 * 3_600_000), false);
});

test('migration: column, size limit, purge of past codes, replayable', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create table public.cinema_screenings (id serial primary key, starts_at timestamptz);
      insert into public.cinema_screenings (starts_at) values (now() - interval '3 days'), (now() + interval '2 days');`);
    const sql = readFileSync(new URL('../supabase/migrations/20261115150000_screening_ticket_code.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    await db.exec(`update public.cinema_screenings set ticket_code = 'b:QUJD'`);
    await assert.rejects(db.exec(`update public.cinema_screenings set ticket_code = repeat('x', 4001) where id = 1`));
    const { rows } = await db.query('select public.purge_past_ticket_codes() as n');
    assert.equal(rows[0].n, 1);
    const left = await db.query('select id, ticket_code from public.cinema_screenings order by id');
    assert.deepEqual(left.rows.map((r) => r.ticket_code), [null, 'b:QUJD']);
  } finally {
    await db.close();
  }
});
