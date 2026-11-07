import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * Les avis du public : ce qu'on garde, dans quel ordre, et en quelle langue.
 * Module livré tel quel dans l'Edge Function `public-reviews`. Les formes de
 * posts Bluesky ont été relevées sur api.bsky.app le 7 novembre 2026.
 */
function load(relative) {
  const compiled = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => ({}));
  return exports;
}

const { isReview, criteriaOf, detectLang, rankReviews, fromYoutubeThread, fromBlueskyPost, mentionsFilm, normalizeLang, blueskyQueries } = load(
  '../supabase/functions/public-reviews/logic.ts'
);

const review = (over) => ({
  id: over.id ?? String(Math.random()),
  source: 'youtube',
  author: 'a',
  url: 'https://x',
  text: 'Un avis assez long pour être gardé, vraiment.',
  likes: 0,
  replies: 0,
  at: '2026-11-01T10:00:00Z',
  lang: 'fr',
  criteria: [],
  ...over,
});

test('isReview écarte ce qui n’est pas un avis', () => {
  assert.equal(isReview('Le plan de la fin, sans musique, juste le bruit de la ville.'), true);
  assert.equal(isReview('Trop bien !!!'), false, 'trop court');
  assert.equal(isReview('🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥'), false, 'émojis seuls');
  assert.equal(isReview('Ma critique complète du film ici : https://example.com/critique'), false, 'lien');
  assert.equal(isReview('Abonne-toi à ma chaîne pour plus de critiques de films !'), false, 'autopromo');
  assert.equal(isReview('Who is watching this in 2026? Still the best trailer ever'), false);
  assert.equal(isReview('Vu ce soir #cinema #film #movie #imax #dune #nolan'), false, 'que des hashtags');
  assert.equal(isReview('One battle after another: Trump’s turbulent 21 months ft.trib.al/VKEU6pb'), false, 'lien raccourci');
});

test('criteriaOf reconnaît les quatre critères, en français et en anglais', () => {
  assert.deepEqual(criteriaOf('Le scénario est faible mais la photographie est sublime'), ['story', 'visuals']);
  assert.deepEqual(criteriaOf('Incredible acting and that soundtrack!'), ['acting', 'sound']);
  assert.deepEqual(criteriaOf('Son jeu est incroyable'), ['acting'], '« son » possessif n’est pas le son');
  assert.deepEqual(criteriaOf('Trop hâte de le voir'), []);
});

test('detectLang distingue les langues courantes et ne devine pas au hasard', () => {
  assert.equal(detectLang("Vu en avant-première : c'est vraiment le meilleur de la saga, et de loin."), 'fr');
  assert.equal(detectLang('Saw it at an early screening: the trailer spoils nothing, and it is great.'), 'en');
  assert.equal(detectLang('La película es muy buena pero el final es lo peor.'), 'es');
  assert.equal(detectLang('Esse filme é muito bom, não consigo parar de pensar nele.'), 'pt');
  assert.equal(detectLang('この映画は最高でした'), 'ja');
  assert.equal(detectLang('Wow wow wow'), 'und');
});

test('rankReviews dédoublonne, filtre et classe par pertinence ou par date', () => {
  const items = [
    review({ id: 'a', text: 'Un avis moyen mais correct sur le film.', likes: 3, at: '2026-11-03T00:00:00Z' }),
    review({ id: 'b', text: 'Le scénario tient debout et le jeu des acteurs est superbe.', likes: 500, replies: 20, at: '2026-11-01T00:00:00Z' }),
    review({ id: 'c', text: 'Un avis moyen mais correct sur le film !!', likes: 1, at: '2026-11-04T00:00:00Z' }),
    review({ id: 'd', text: 'nul', likes: 9999 }),
  ];
  const relevant = rankReviews(items, 'relevance');
  assert.deepEqual(relevant.map((r) => r.id), ['b', 'a'], 'doublon « c » et avis trop court écartés');
  assert.deepEqual(relevant[0].criteria, ['story', 'acting']);
  assert.deepEqual(rankReviews(items, 'recent').map((r) => r.id), ['a', 'b']);
  const joke = review({ id: 'j', text: 'Not me watching the trailer for the tenth time today lol', likes: 80 });
  const real = review({ id: 'r', text: 'Vu hier soir : 8/10, la tempête du deuxième acte est folle.', likes: 6 });
  assert.equal(rankReviews([joke, real], 'relevance')[0].id, 'r', 'un vrai avis passe devant une blague très likée');
  const unseen = review({ id: 'u', text: "Anora won best picture and respectfully I didn't watch it, it was not a big movie", likes: 74 });
  const seen = review({ id: 's', text: 'Revu Dune hier, la mise en scène reste immense malgré les longueurs.', likes: 2 });
  assert.equal(rankReviews([unseen, seen], 'relevance')[0].id, 's', '« pas vu » passe derrière');
  assert.equal(rankReviews(Array.from({ length: 60 }, (_, i) => review({ id: `x${i}`, text: `Avis numéro ${i} : un vrai avis sur ce film.` })), 'relevance').length, 40);
});

test('fromYoutubeThread lit un fil commentThreads', () => {
  const thread = {
    id: 'Ugx123',
    snippet: {
      totalReplyCount: 4,
      topLevelComment: {
        snippet: {
          authorDisplayName: '@nathan.toile',
          authorProfileImageUrl: 'https://yt3.ggpht.com/a',
          textOriginal: 'Le plan de la fin, sans musique, juste le bruit de la ville.',
          likeCount: 12000,
          publishedAt: '2026-11-05T09:00:00Z',
        },
      },
    },
  };
  const r = fromYoutubeThread(thread, 'dQw4w9WgXcQ');
  assert.equal(r.author, 'nathan.toile');
  assert.equal(r.handle, '@nathan.toile');
  assert.equal(r.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&lc=Ugx123');
  assert.equal(r.likes, 12000);
  assert.equal(r.replies, 4);
  assert.equal(r.lang, 'fr');
  assert.equal(fromYoutubeThread({}, 'x'), null);
});

test('fromBlueskyPost lit un post et écarte les flux relayés et les posts signalés', () => {
  const post = {
    uri: 'at://did:plc:abc/app.bsky.feed.post/3mzg5uyqcus2b',
    author: { handle: 'flannelqueen.bsky.social', displayName: 'Flannel Queen' },
    record: { text: "Frankenstein's creature is finally here, del Toro did it", langs: ['en'], createdAt: '2026-11-07T08:00:00Z' },
    likeCount: 4,
    replyCount: 1,
    labels: [],
  };
  const r = fromBlueskyPost(post);
  assert.equal(r.url, 'https://bsky.app/profile/flannelqueen.bsky.social/post/3mzg5uyqcus2b');
  assert.equal(r.lang, 'en');
  assert.equal(r.handle, '@flannelqueen.bsky.social');
  assert.equal(fromBlueskyPost({ ...post, author: { handle: 'whats-on-netflix.com.web.brid.gy' } }), null);
  assert.equal(fromBlueskyPost({ ...post, labels: [{ val: 'porn' }] }), null);
  assert.equal(normalizeLang('pt-BR'), 'pt');
});

test('mentionsFilm exige le titre, et un indice de plus pour un titre court', () => {
  const frank = { titles: ['Frankenstein'], director: 'Guillermo del Toro', year: '2025' };
  assert.equal(mentionsFilm('Took the answer right outta my chest', frank), false, 'le titre n’est que dans l’image');
  assert.equal(mentionsFilm('I love Frankenstein, the novel is so good', frank), false, 'un titre court seul ne suffit pas');
  assert.equal(mentionsFilm('Frankenstein by del Toro is a masterpiece', frank), true);
  assert.equal(mentionsFilm('Just watched Frankenstein, wow', frank), false, 'un seul mot : réalisateur ou année exigés');
  assert.equal(mentionsFilm('This week: Frankenstein (1931), Halloween (1978), del Toro next', frank), false, 'un autre Frankenstein');
  assert.equal(mentionsFilm('Frankenstein (2025) is gorgeous', frank), true);
  assert.deepEqual(blueskyQueries(frank), ['"Frankenstein" Toro', '"Frankenstein"']);
  const obaa = { titles: ['Une bataille après l’autre', 'One Battle After Another'] };
  assert.equal(mentionsFilm('One Battle After Another is the best film of the year', obaa), true);
  assert.equal(mentionsFilm('Vu Une bataille après l’autre au cinéma : quel final !', obaa), true, 'apostrophe typographique');
  assert.equal(
    mentionsFilm('Aujourd’hui je n’ai aucune certitude. Une bataille après l’autre, on verra bien.', obaa),
    false,
    'l’expression, pas le film'
  );
  assert.equal(mentionsFilm('One Battle After Another (2025)', { ...obaa, year: '2025' }), true);
  assert.deepEqual(blueskyQueries(obaa), ['"Une bataille après l’autre"', '"One Battle After Another"']);
});
