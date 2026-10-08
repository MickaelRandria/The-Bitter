-- Ta note perso apparaît dans tes espaces, pour les films vus ensemble.
--
-- Une note donnée depuis l'accueil n'arrivait dans un espace que si l'on
-- répondait « oui » à la question « Ta note dans X aussi ? ». Relevé le
-- 8 octobre 2026 : sur des films déjà « vus ensemble », des membres les avaient
-- notés dans leur collection sans que l'espace affiche leur verdict.
--
-- Règle : sur un film **vu ensemble** d'un espace dont tu es membre actif, ta
-- note perso est ta note d'espace. Elle y arrive et s'y tient à jour, côté
-- serveur, d'où qu'elle vienne (tout appareil, import, correction).
--
-- Ce qui ne change pas :
-- - un film encore « à voir ensemble » ne reçoit rien automatiquement. Un
--   verdict y ferait basculer le film en « vu » pour tout le groupe
--   (`movie_ratings_marks_watched`) alors que le membre l'a peut-être vu seul :
--   l'app continue de poser la question ;
-- - un film retiré du fil des espaces (`shared_to_feed = false`) n'est jamais publié ;
-- - une note d'espace n'est jamais effacée par une suppression perso.
--
-- Deux déclencheurs et un rattrapage :
-- 1. `user_movies` : poser ou changer sa note perso met à jour ses verdicts
--    d'espace sur ce film, s'il y est vu ensemble ;
-- 2. `shared_movies` : quand un film entre « vu » dans un espace, ou y passe en
--    « vu », les membres qui l'avaient déjà noté y apportent leur note — sans
--    écraser un verdict déjà posé dans l'espace ;
-- 3. le rattrapage applique la règle 2 à l'existant.

-- Le verdict perso, prêt à entrer dans `movie_ratings`. `comment` et non
-- `review` : dans `user_movies`, `review` porte le synopsis TMDB.
create or replace function private.personal_verdict_is_shareable(um public.user_movies)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select um.status = 'watched'
     and um.deleted_at is null
     and um.season_number is null
     and um.tmdb_id is not null
     and coalesce(um.shared_to_feed, true)
     and (um.adaptive_rating is not null
          or coalesce(um.story, 0) + coalesce(um.visuals, 0) + coalesce(um.acting, 0) + coalesce(um.sound, 0) > 0);
$$;

-- 1. La note perso suit dans les espaces où le film a été vu ensemble.
create or replace function private.on_personal_verdict_to_spaces()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.personal_verdict_is_shareable(new) then
    return new;
  end if;

  insert into public.movie_ratings as r (
    movie_id, profile_id, story, visuals, acting, sound,
    vibe_story, vibe_emotion, vibe_fun, vibe_visual, vibe_tension,
    review, smartphone_factor, hype, adaptive_rating, rating_mode, rated_at, updated_at
  )
  select s.id, new.profile_id, new.story, new.visuals, new.acting, new.sound,
         new.vibe_story, new.vibe_emotion, new.vibe_fun, new.vibe_visual, new.vibe_tension,
         nullif(btrim(new.comment), ''), new.smartphone_factor, new.hype, new.adaptive_rating,
         case when new.adaptive_rating is not null then 'bitter_plus' else 'bitter' end,
         coalesce(new.rated_at, now()), now()
    from public.shared_movies s
    join public.space_members m
      on m.space_id = s.space_id and m.profile_id = new.profile_id and m.is_active
   where s.tmdb_id = new.tmdb_id
     and coalesce(s.media_type, 'movie') = coalesce(new.media_type, 'movie')
     and s.season_number is null
     and s.status = 'watched'
  on conflict (movie_id, profile_id) do update
     set story = excluded.story,
         visuals = excluded.visuals,
         acting = excluded.acting,
         sound = excluded.sound,
         vibe_story = excluded.vibe_story,
         vibe_emotion = excluded.vibe_emotion,
         vibe_fun = excluded.vibe_fun,
         vibe_visual = excluded.vibe_visual,
         vibe_tension = excluded.vibe_tension,
         -- Un avis écrit dans l'espace ne disparaît pas faute d'avis perso.
         review = coalesce(excluded.review, r.review),
         smartphone_factor = excluded.smartphone_factor,
         hype = excluded.hype,
         adaptive_rating = excluded.adaptive_rating,
         rating_mode = excluded.rating_mode,
         updated_at = now()
   -- Rien à écrire si l'espace a déjà ce verdict : évite des mises à jour à vide.
   where (r.story, r.visuals, r.acting, r.sound, r.adaptive_rating, r.review)
         is distinct from
         (excluded.story, excluded.visuals, excluded.acting, excluded.sound, excluded.adaptive_rating, coalesce(excluded.review, r.review));

  return new;
end;
$$;

drop trigger if exists user_movies_verdict_to_spaces on public.user_movies;
create trigger user_movies_verdict_to_spaces
  after insert or update of status, story, visuals, acting, sound, adaptive_rating, comment, deleted_at, shared_to_feed
  on public.user_movies
  for each row execute function private.on_personal_verdict_to_spaces();

-- 2. Un film vu ensemble récupère les notes que ses membres avaient déjà.
create or replace function private.on_watched_together_collect_verdicts()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.status <> 'watched' or new.season_number is not null or new.tmdb_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'watched' then
    return new;
  end if;

  insert into public.movie_ratings (
    movie_id, profile_id, story, visuals, acting, sound,
    vibe_story, vibe_emotion, vibe_fun, vibe_visual, vibe_tension,
    review, smartphone_factor, hype, adaptive_rating, rating_mode, rated_at, updated_at
  )
  select new.id, um.profile_id, um.story, um.visuals, um.acting, um.sound,
         um.vibe_story, um.vibe_emotion, um.vibe_fun, um.vibe_visual, um.vibe_tension,
         nullif(btrim(um.comment), ''), um.smartphone_factor, um.hype, um.adaptive_rating,
         case when um.adaptive_rating is not null then 'bitter_plus' else 'bitter' end,
         coalesce(um.rated_at, now()), now()
    from public.space_members m
    join public.user_movies um
      on um.profile_id = m.profile_id
     and um.tmdb_id = new.tmdb_id
     and coalesce(um.media_type, 'movie') = coalesce(new.media_type, 'movie')
   where m.space_id = new.space_id
     and m.is_active
     and private.personal_verdict_is_shareable(um)
  -- Un verdict déjà posé dans l'espace est celui que la personne y a voulu.
  on conflict (movie_id, profile_id) do nothing;

  return new;
end;
$$;

drop trigger if exists shared_movies_collect_verdicts on public.shared_movies;
create trigger shared_movies_collect_verdicts
  after insert or update of status
  on public.shared_movies
  for each row execute function private.on_watched_together_collect_verdicts();

-- 3. Rattrapage : les films déjà vus ensemble récupèrent les notes manquantes.
insert into public.movie_ratings (
  movie_id, profile_id, story, visuals, acting, sound,
  vibe_story, vibe_emotion, vibe_fun, vibe_visual, vibe_tension,
  review, smartphone_factor, hype, adaptive_rating, rating_mode, rated_at, updated_at
)
select s.id, um.profile_id, um.story, um.visuals, um.acting, um.sound,
       um.vibe_story, um.vibe_emotion, um.vibe_fun, um.vibe_visual, um.vibe_tension,
       nullif(btrim(um.comment), ''), um.smartphone_factor, um.hype, um.adaptive_rating,
       case when um.adaptive_rating is not null then 'bitter_plus' else 'bitter' end,
       coalesce(um.rated_at, now()), now()
  from public.shared_movies s
  join public.space_members m on m.space_id = s.space_id and m.is_active
  join public.user_movies um
    on um.profile_id = m.profile_id
   and um.tmdb_id = s.tmdb_id
   and coalesce(um.media_type, 'movie') = coalesce(s.media_type, 'movie')
 where s.status = 'watched'
   and s.season_number is null
   and private.personal_verdict_is_shareable(um)
on conflict (movie_id, profile_id) do nothing;
