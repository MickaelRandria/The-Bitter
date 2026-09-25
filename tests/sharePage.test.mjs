import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Page du lien (`api/share.ts`) : son script vit dans un gabarit de texte.
 *
 * Dans un gabarit, `\/` et `\.` perdent leur barre oblique inverse : une
 * expression régulière écrite comme dans un fichier .js arrive cassée dans le
 * navigateur, et toute la page cesse de répondre, sans erreur à la compilation.
 * On rejoue donc le gabarit tel que le serveur l'envoie, puis on le fait lire
 * par le moteur JavaScript.
 */
test('le script envoyé par la page du lien est du JavaScript valide', () => {
  const source = readFileSync(new URL('../api/share.ts', import.meta.url), 'utf8');
  const match = source.match(/const SCRIPT = `([\s\S]*?)`;/);
  assert.ok(match, 'le script de la page est introuvable');
  const served = eval('`' + match[1] + '`');
  assert.doesNotThrow(() => new Function(served));
});

test('la page du lien écrit les dates comme les notifications', async () => {
  const ts = (await import('typescript')).default;
  const load = (relative) => {
    const compiled = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    new Function('exports', 'require', 'process', compiled)(exports, () => ({}), { env: {} });
    return exports;
  };
  const page = load('../api/share.ts');
  const messages = load('../supabase/functions/notify/messages.ts');
  const now = new Date('2026-09-26T08:00:00Z');
  for (const iso of ['2026-09-26T18:30:00Z', '2026-09-26T12:00:00Z', '2026-09-27T18:30:00Z', '2026-10-03T18:30:00Z', '2026-12-31T23:15:00Z']) {
    const slot = { starts_at: iso, cinema_name: 'UGC Talence' };
    assert.equal(page.formatSlot(slot, now), messages.formatSlot(slot, now), iso);
  }
});
