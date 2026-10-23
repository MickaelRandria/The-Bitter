import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
function load(path, deps = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', code.replaceAll('import.meta.env.DEV', 'false'))(exports, name => { if (!deps[name]) throw Error(name); return deps[name]; });
  return exports;
}
const work = load('../utils/workKey.ts');
const rules = load('../utils/collectionRules.ts', { './workKey': work });
const history = load('../utils/ratingHistory.ts');
const agenda = load('../utils/calendarAgenda.ts');
const followup = load('../utils/screeningFollowup.ts', { './collectionRules': rules, './ratingHistory': history, './calendarAgenda': agenda });
const notifications = load('../utils/notifications.ts', { './ratingHistory': history, './screeningFollowup': followup });
const sync = load('../services/movieSync.ts', { './supabase': { supabase: null }, '../utils/workKey': work, '../utils/collectionRules': rules });
const now = Date.parse('2026-10-14T18:00:00Z');
const film = { id: 'owned', tmdbId: 603, mediaType: 'movie', title: 'The Matrix', status: 'watchlist', dateAdded: now - 7 * 86400000, ratings: { story: 0, visuals: 0, acting: 0, sound: 0 } };
const screening = { id: 'screening-1', tmdbId: 603, title: 'The Matrix', status: 'scheduled', startsAt: now - 5 * 3600000 };

test('une ancienne copie à voir ne remet pas un film vu dans les deux listes', () => {
  const watched = { ...film, id: 'rated', status: 'watched', ratings: { ...film.ratings, story: 8 } };
  const copies = [film, watched];
  assert.deepEqual(rules.uniqueCollection(copies), [watched]);
  assert.equal(rules.findCollectionWork(copies, film).id, 'rated');
  assert.equal(copies.length, 2, 'les anciennes données restent conservées');
});
test('noter une fiche à voir retrouve la même identité au lieu de créer une deuxième fiche', () => {
  assert.equal(rules.findCollectionWork([film], { tmdbId: 603, mediaType: 'movie' }).id, film.id);
  assert.equal(rules.findCollectionWork([film], { tmdbId: 603, mediaType: 'tv' }), undefined);
});

test('la reconnexion conserve la copie vue parmi les doublons locaux et respecte le serveur', () => {
  const watched = { ...film, id: 'rated', status: 'watched', ratings: { ...film.ratings, story: 8 } };
  assert.deepEqual(sync.mergeRemoteAndLocal([], [film, watched]), [watched]);
  assert.deepEqual(sync.mergeRemoteAndLocal([watched], [film]), [watched]);
});
test('films, séries, saisons et saisies manuelles gardent des identités séparées', () => {
  const rows = [film, { ...film, id: 'series', mediaType: 'tv' }, { ...film, id: 'season', mediaType: 'tv', seasonNumber: 1 },
    { ...film, id: 'manual1', tmdbId: undefined }, { ...film, id: 'manual2', tmdbId: undefined }];
  assert.equal(rules.uniqueCollection(rows).length, 5);
});

test('supprimer un film ne fait pas ressurgir son ancien doublon à voir et garde la série homonyme', () => {
  const watched = { ...film, id: 'rated', status: 'watched' };
  const series = { ...film, id: 'series', mediaType: 'tv' };
  assert.deepEqual(rules.removeCollectionWork([film, watched, series], watched), [series]);
  const manual = { ...film, id: 'manual', tmdbId: undefined };
  assert.deepEqual(rules.removeCollectionWork([film, manual], manual), [film]);
});
test('une série en cours n’est pas vue en entier parce qu’une saison est notée', () => {
  const series = { ...film, mediaType: 'tv', status: 'watched', tvProgress: { state: 'watching' } };
  assert.equal(rules.isWatchedWork(series), false);
  assert.equal(rules.isWatchedWork({ ...series, tvProgress: { state: 'completed' } }), true);
  assert.ok(!rules.watchedWorkKeys([series]).has('tv:603'));
});
test('le rappel attend la fin estimée et ignore les séances annulées ou non confirmées', () => {
  assert.equal(followup.screeningRatingDue([screening], [film], now).length, 1);
  for (const status of ['pending', 'cancelled']) assert.equal(followup.screeningRatingDue([{ ...screening, status }], [film], now).length, 0);
  assert.equal(followup.screeningRatingDue([{ ...screening, startsAt: now - 3600000 }], [film], now).length, 0);
  assert.equal(followup.screeningRatingDue([screening], [{ ...film, runtime: 360 }], now).length, 0);
});
test('une note du jour ne prouve pas à quelle séance elle correspond', () => {
  const rated = { ...film, status: 'watched', dateWatched: Date.parse('2026-10-14T00:00:00Z'), ratings: { ...film.ratings, story: 8 } };
  assert.equal(followup.screeningRatingDue([screening], [rated], now).length, 1);
  const confirmed = { ...screening, ratingConfirmedAt: now };
  assert.equal(followup.screeningRatingDue([confirmed], [rated], now).length, 0);
  assert.equal(followup.screeningRatingDue([confirmed], [{ ...rated, ratings: film.ratings, adaptiveRating: { weightedRating: 0 } }], now).length, 0);
});
test('une ancienne note n’annule pas la relance d’une nouvelle séance de rewatch', () => {
  const rated = { ...film, status: 'watched', dateWatched: now - 7 * 86400000, ratings: { ...film.ratings, story: 8 } };
  assert.equal(followup.screeningRatingDue([screening], [rated], now).length, 1);
  assert.equal(followup.screeningRatingDue([screening], [{ ...rated, watches: [{ watched_at: '2026-10-14T00:00:00Z', ratings: rated.ratings }] }], now).length, 1);
});

test('une séance après minuit à Paris exige le lien explicite, quelle que soit la date de note', () => {
  const night = { ...screening, startsAt: Date.parse('2026-10-13T23:30:00Z') };
  const rated = { ...film, status: 'watched', ratings: { ...film.ratings, story: 8 } };
  assert.equal(followup.screeningRatingDue([night], [{ ...rated, dateWatched: Date.parse('2026-10-14T00:00:00Z') }], now).length, 1);
  assert.equal(followup.screeningRatingDue([night], [{ ...rated, dateWatched: Date.parse('2026-10-13T00:00:00Z') }], now).length, 1);
});
test('confirmer la séance ne confirme pas les autres séances du même film', () => {
  const second = { ...screening, id: 'screening-2', startsAt: screening.startsAt - 86400000 };
  assert.deepEqual(followup.screeningRatingDue([{ ...screening, ratingConfirmedAt: now }, second], [film], now).map(row => row.id), [second.id]);
  assert.equal(followup.screeningRatingDue([{ ...screening, ratingConfirmedAt: NaN }], [film], now).length, 1);
});
test('la même référence de série ne répond pas au rappel d’un film', () => {
  const series = { ...film, mediaType: 'tv', status: 'watched', dateWatched: now, ratings: { ...film.ratings, story: 8 } };
  assert.equal(followup.screeningRatingDue([screening], [series], now).length, 1);
});
test('une simple envie de la watchlist ne prétend pas attendre une note', () => {
  const prefs = { streak: false, monthly: false, weekly: false, unrated: true };
  assert.deepEqual(notifications.computeNotifications([film], prefs), []);
  const current = { ...screening, startsAt: Date.now() - 5 * 3600000 };
  const result = notifications.computeNotifications([film], prefs, [current]);
  assert.equal(result.length, 1); assert.equal(result[0].screeningId, current.id);
  assert.deepEqual(notifications.computeNotifications([film], { ...prefs, unrated: false }, [current]), []);
});

test('l’avis et le réglage du fil survivent à un aller-retour par le serveur', () => {
  const movie = {
    id: 'x', tmdbId: 42, title: 'Karma', director: 'A', actors: '', year: 2026, genre: 'Drame',
    ratings: { story: 7, visuals: 7, acting: 4, sound: 6 }, review: 'Synopsis TMDB', comment: 'Très mal joué.',
    dateAdded: Date.parse('2026-10-18T10:00:00Z'), theme: 'black', status: 'watched', shareToFeed: false,
  };
  const back = sync.rowToMovie({ id: 'x', ...sync.movieToRow(movie, 'u') });
  assert.equal(back.comment, 'Très mal joué.');
  assert.equal(back.review, 'Synopsis TMDB');
  assert.equal(back.shareToFeed, false);
  const shared = sync.rowToMovie({ id: 'y', ...sync.movieToRow({ ...movie, shareToFeed: undefined, comment: '' }, 'u') });
  assert.equal(shared.comment, undefined);
  assert.notEqual(shared.shareToFeed, false);
});
