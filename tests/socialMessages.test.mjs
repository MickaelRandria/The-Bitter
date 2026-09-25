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
  const hidden = socialMessage({ kind: 'verdict_given', actor: 'Tom', title: 'Alien', rating: null });
  assert.equal(hidden.title, 'Tom a noté Alien');
  assert.equal(hidden.body, 'Note-le pour découvrir sa note.', 'pas de note : elle reste cachée');
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

test('séance : la date se lit à l’heure de Paris, et la bonne phrase selon le cas', () => {
  const { formatWhen, formatSlot } = load('../supabase/functions/notify/messages.ts');
  const now = new Date('2026-09-26T08:00:00Z'); // samedi 10 h à Paris
  assert.equal(formatWhen('2026-09-26T18:30:00Z', now), 'ce soir, 20 h 30');
  assert.equal(formatWhen('2026-09-26T12:00:00Z', now), 'aujourd’hui, 14 h 00');
  assert.equal(formatWhen('2026-09-27T18:30:00Z', now), 'demain, 20 h 30');
  assert.equal(formatWhen('2026-10-03T18:30:00Z', now), 'samedi 3 octobre, 20 h 30');
  assert.equal(formatSlot({ starts_at: '2026-10-03T18:30:00Z', cinema_name: 'UGC Talence' }, now), 'samedi 3 octobre, 20 h 30 · UGC Talence');

  const slots = [{ id: 'a', starts_at: '2026-10-03T18:30:00Z', cinema_name: 'UGC Talence' }, { id: 'b', starts_at: '2026-10-04T14:00:00Z' }];
  assert.equal(socialMessage({ kind: 'watch_invite', actor: 'Mika', title: 'Dune', payload: { slots } }).body, '2 créneaux au choix. Ça te dit ?');
  assert.equal(socialMessage({ kind: 'plan_proposed', actor: 'Léa', title: 'Dune', payload: { slots } }).title, 'Léa propose une séance pour Dune');
  const agreed = socialMessage({ kind: 'plan_agreed', actor: 'Léa', title: 'Dune', payload: { slots, chosen_slot_id: 'b' } });
  assert.equal(agreed.title, 'C’est calé : Dune');
  assert.match(agreed.body, /dimanche 4 octobre, 16 h 00 avec Léa\. Pense à réserver ta place\./);
  assert.equal(socialMessage({ kind: 'plan_rate', actor: 'Léa', title: 'Dune' }).body, 'Note-le pour découvrir la note de Léa.');
});

test('le film que tu attends : envie commune, sortie et streaming', () => {
  const { listNames } = load('../supabase/functions/notify/messages.ts');
  assert.equal(listNames(['Léa', 'Tom', 'Sam']), 'Léa, Tom et Sam');
  assert.equal(socialMessage({ kind: 'common_wish', actor: 'Léa', title: 'Dune' }).title, 'Léa veut aussi voir Dune');
  assert.deepEqual(socialMessage({ kind: 'release_today', title: 'Dune', payload: { also: ['Léa', 'Tom'] } }), {
    title: 'Dune sort aujourd’hui en salle',
    body: 'Léa et Tom veulent aussi le voir. On y va ensemble ?',
  });
  assert.equal(socialMessage({ kind: 'release_today', title: 'Dune', payload: { also: [] } }).body, 'Il était dans ta liste. C’est le moment.');
  assert.deepEqual(socialMessage({ kind: 'now_streaming', title: 'Alien', payload: { providers: ['Canal+'], also: ['Léa'] } }), {
    title: 'Alien est maintenant sur Canal+',
    body: 'Léa veut aussi le voir. Soirée ciné à la maison ?',
  });
});
