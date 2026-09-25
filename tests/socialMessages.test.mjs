import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * Textes des notifications sociales : le module livré, transpilé tel quel. Il
 * est partagé par la fonction Edge `notify` (push) et par la cloche de l'app ;
 * une faute ici part à la fois sur l'écran verrouillé et dans l'app.
 */
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => ({}));
  return exports;
}

const { socialMessage, formatRating } = load('../supabase/functions/notify/messages.ts');

test('les notes venues de Postgres arrivent en texte et s’écrivent à la française', () => {
  assert.equal(formatRating('6.5'), '6,5');
  assert.equal(formatRating('7.0'), '7');
  assert.equal(formatRating(8.25), '8,3');
  assert.equal(formatRating(null), null);
  assert.equal(formatRating(''), null);
  assert.equal(formatRating('abc'), null);
});

test('invitation et réponse : le prénom, le film, jamais d’accord de genre', () => {
  const invite = socialMessage({ kind: 'watch_invite', actor: 'Mika', title: 'Dune' });
  assert.equal(invite.title, 'Mika veut voir Dune avec toi');
  const yes = socialMessage({ kind: 'watch_accepted', actor: 'Léa', title: 'Dune' });
  assert.equal(yes.title, 'Léa dit oui pour Dune');
  for (const message of [invite, yes]) {
    assert.doesNotMatch(`${message.title} ${message.body}`, /·e|partant/);
  }
});

test('un verdict rendu donne l’écart avec sa propre note', () => {
  const given = socialMessage({ kind: 'verdict_given', actor: 'Tom', title: 'Alien', rating: '6.3', ownRating: 8.5 });
  assert.equal(given.title, 'Tom a mis 6,3 à Alien');
  assert.equal(given.body, 'Toi : 8,5. Vous en parlez ?');
  const noOwn = socialMessage({ kind: 'verdict_given', actor: 'Tom', title: 'Alien', rating: null });
  assert.equal(noOwn.title, 'Tom a noté Alien');
});

test('réponses reçues par lien, sans compte', () => {
  assert.equal(
    socialMessage({ kind: 'link_answered', guestName: 'Sam', title: 'Dune', linkKind: 'watch' }).title,
    'Sam dit oui pour Dune'
  );
  assert.equal(
    socialMessage({ kind: 'link_answered', guestName: 'Sam', title: 'Dune', linkKind: 'verdict', rating: 6.5, ownRating: 8 }).body,
    'Toi : 8. Réponse reçue par ton lien.'
  );
  assert.equal(
    socialMessage({ kind: 'link_answered', guestName: 'Sam', title: 'Dune', linkKind: 'verdict' }).title,
    'Sam n’a pas encore vu Dune'
  );
});

test('un prénom absent ne laisse jamais de trou dans la phrase', () => {
  const message = socialMessage({ kind: 'link_joined', actor: '   ', title: 'Dune' });
  assert.equal(message.title, 'Quelqu’un a suivi ton lien');
});
