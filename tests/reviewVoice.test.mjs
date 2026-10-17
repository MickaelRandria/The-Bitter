import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** La part sans réseau de la fonction Edge `review-voice`, transpilée telle quelle. */
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

const { biasTerms, tidyTranscript, acceptPolish, unwrapPolish, MAX_BIAS_TERMS } = load(
  '../supabase/functions/review-voice/polish.ts'
);

test('bias terms keep full names and their surnames, once each', () => {
  assert.deepEqual(biasTerms(['Dune : Deuxième partie', 'Denis Villeneuve', 'Timothée Chalamet, Zendaya']), [
    'Dune : Deuxième partie',
    'Dune',
    'Deuxième',
    'Denis Villeneuve',
    'Denis',
    'Villeneuve',
    'Timothée Chalamet',
    'Timothée',
    'Chalamet',
    'Zendaya',
  ]);
});

test('bias terms drop the placeholder director, junk and overflow', () => {
  assert.deepEqual(biasTerms(['Inconnu', 42, null, ' ', 'A']), []);
  assert.deepEqual(biasTerms('Dune'), []);
  const many = Array.from({ length: 150 }, (_, i) => `Nom${i}`);
  assert.equal(biasTerms(many).length, MAX_BIAS_TERMS);
});

test('tidy removes French hesitations and doubled words', () => {
  assert.equal(
    tidyTranscript("euh franchement le le film il est euh trop long mais bah la fin c'est c'est fou"),
    "Franchement le film il est trop long mais la fin c'est fou."
  );
});

test('tidy keeps existing punctuation and handles English', () => {
  assert.equal(tidyTranscript('Um, honestly? It was great.', 'en'), 'Honestly? It was great.');
  assert.equal(tidyTranscript('euh'), '');
});

test('polish is refused when it adds words or summarises', () => {
  const raw = "euh franchement le film il est un peu long mais la fin elle est vraiment folle";
  assert.equal(acceptPolish(raw, 'Franchement, le film est un peu long, mais la fin est vraiment folle.'), true);
  assert.equal(
    acceptPolish(raw, "Franchement, le film est un peu long, mais la fin est vraiment folle, un chef-d'œuvre visuel et sonore."),
    false
  );
  assert.equal(acceptPolish(raw, 'Fin folle.'), false);
  assert.equal(acceptPolish(raw, 'Voici le texte corrigé : Franchement…'), false);
  assert.equal(acceptPolish(raw, ''), false);
  // Même longueur, mais un jugement que la personne n'a pas porté.
  assert.equal(acceptPolish(raw, 'Franchement, le film est un peu ennuyeux, mais la fin est sublime.'), false);
});

test('polish may fix names from the film and grammar', () => {
  const raw = 'euh le film de vile neuve il est trop beau les acteur sont incroyable';
  assert.equal(
    acceptPolish(raw, 'Le film de Villeneuve est trop beau, les acteurs sont incroyables.', ['Denis Villeneuve']),
    true
  );
});

test('unwrap strips quotes and fences the model sometimes adds', () => {
  assert.equal(unwrapPolish('« Un film magnifique. »'), 'Un film magnifique.');
  assert.equal(unwrapPolish('"Great film."'), 'Great film.');
  assert.equal(unwrapPolish('```\nUn film.\n```'), 'Un film.');
});
