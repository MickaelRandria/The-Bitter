-- D'où vient le quiz d'une série dans `series_trivia` :
--   'data' : construit sans IA depuis Wikidata et TMDB (fonction series-trivia, quiz.ts) ;
--   'ai'   : écrit par Mistral, faute de données pour une manche de 4 questions ;
--   null   : ligne préparée avant le quiz des bases. Au prochain « Le saviez-vous + »,
--            la fonction construit le quiz des bases, sans Mistral, et la met à jour.

alter table public.series_trivia add column if not exists quiz_origin text
  check (quiz_origin in ('data', 'ai'));
