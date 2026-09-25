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
