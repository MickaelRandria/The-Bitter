import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * « Le film que tu attends est là » : ce qui fait une nouvelle. Module livré tel
 * quel dans l'Edge Function `availability`. Les formes de réponse viennent de
 * TMDB, relevées le 26 septembre 2026 (Dune : deuxième partie, id 693134).
 */
function load(relative) {
  const compiled = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => ({}));
  return exports;
}

const { frenchTheatricalDate, frenchStreaming, parisToday, decide } = load('../supabase/functions/availability/logic.ts');

const dune = {
  release_date: '2024-02-27',
  release_dates: {
    results: [
      { iso_3166_1: 'US', release_dates: [{ type: 3, release_date: '2024-03-01T00:00:00.000Z' }] },
      {
        iso_3166_1: 'FR',
        release_dates: [
          { type: 1, release_date: '2024-02-12T00:00:00.000Z' },
          { type: 3, release_date: '2024-02-28T00:00:00.000Z' },
          { type: 5, release_date: '2024-07-10T00:00:00.000Z' },
        ],
      },
    ],
  },
  'watch/providers': {
    results: {
      FR: { flatrate: [{ provider_name: 'Netflix' }, { provider_name: 'Canal+' }, { provider_name: 'Netflix' }], rent: [{ provider_name: 'Apple TV' }] },
      US: { flatrate: [{ provider_name: 'Max' }] },
    },
  },
};

test('la sortie en salle est la date française, pas la date « principale » de TMDB', () => {
  assert.equal(frenchTheatricalDate(dune), '2024-02-28');
  assert.equal(frenchTheatricalDate({ release_dates: { results: [{ iso_3166_1: 'FR', release_dates: [{ type: 2, release_date: '2026-10-01T00:00:00Z' }] }] } }), '2026-10-01');
  assert.equal(frenchTheatricalDate({}), null);
});

test('le streaming ne compte que les abonnements en France, sans doublon', () => {
  assert.deepEqual(frenchStreaming(dune), ['Canal+', 'Netflix']);
  assert.deepEqual(frenchStreaming({}), []);
});

test('aujourd’hui se compte à Paris', () => {
  assert.equal(parisToday(new Date('2026-09-26T22:30:00Z')), '2026-09-27');
  assert.equal(parisToday(new Date('2026-09-26T21:30:00Z')), '2026-09-26');
});

test('une nouvelle, c’est une sortie aujourd’hui ou une plateforme de plus que la veille', () => {
  assert.deepEqual(decide({ known: false, providers: [] }, '2026-09-27', ['Netflix'], '2026-09-27'), { release: true, newProviders: [] },
    'premier passage : la sortie compte, pas le streaming déjà là');
  assert.deepEqual(decide({ known: true, providers: ['Netflix'] }, null, ['Canal+', 'Netflix'], '2026-09-27'), { release: false, newProviders: ['Canal+'] });
  assert.deepEqual(decide({ known: true, providers: ['Netflix'] }, '2024-02-28', ['Netflix'], '2026-09-27'), { release: false, newProviders: [] });
});
