-- Films en commun : à l'arrivée dans un espace, ajouter d'un geste les films que
-- l'on a notés et qu'un autre membre a notés aussi ; et, sur les cartes de la
-- collection, la note des membres de ses espaces pour un film vu des deux côtés.
--
-- Trois pièces :
-- 1. `check_verdict` se tait pendant un ajout groupé (réglage de transaction
--    `bitter.quiet_verdicts`) : vingt films ajoutés ne doivent pas faire vingt
--    notifications « verdict tombé ». Le reste de la fonction est inchangé
--    (relevé en prod le 2026-11-27).
-- 2. `common_films_preview` / `add_common_films` : le compte, puis l'ajout.
-- 3. `get_common_ratings` : pour les cartes de la collection.

-- 1. ─────────────────────────────────────────────────────────────────────────
create or replace function private.check_verdict(p_movie uuid, p_actor uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_movie public.shared_movies;
  v_space text;
  v_expected int;
  v_rated int;
  v_avg numeric;
begin
  if exists (select 1 from public.space_verdicts where movie_id = p_movie) then
    return;
  end if;
  select * into v_movie from public.shared_movies where id = p_movie;
  if v_movie.id is null or v_movie.status <> 'watched' then
    return;
  end if;

  select count(*), count(*) filter (where private.has_rated(p_movie, e))
    into v_expected, v_rated
    from private.expected_raters(p_movie) e;
  -- Une seule note n'est pas un verdict.
  if v_rated < 2 or v_rated < v_expected then
    return;
  end if;

  insert into public.space_verdicts (movie_id) values (p_movie) on conflict do nothing;
  if not found then
    return;
  end if;

  -- Ajout groupé de films déjà vus (add_common_films) : le verdict est posé,
  -- personne n'est prévenu film par film.
  if coalesce(current_setting('bitter.quiet_verdicts', true), '') = 'on' then
    return;
  end if;

  select round(avg(private.overall_rating(r.story, r.visuals, r.acting, r.sound, r.adaptive_rating)), 1)
    into v_avg
    from public.movie_ratings r
   where r.movie_id = p_movie and r.profile_id in (select private.expected_raters(p_movie));
  select name into v_space from public.shared_spaces where id = v_movie.space_id;

  -- « X a mis 7 » arrive au même moment : le verdict complet le remplace.
  update public.notifications set read_at = coalesce(read_at, now())
   where kind = 'verdict_given' and shared_movie_id = p_movie and read_at is null;

  insert into public.notifications (recipient_id, actor_id, kind, space_id, shared_movie_id, title, poster_url, rating, payload)
  select e, null, 'verdict_complete', v_movie.space_id, p_movie, v_movie.title, v_movie.poster_url, v_avg,
         jsonb_build_object('space', coalesce(v_space, ''), 'count', v_rated)
    from private.expected_raters(p_movie) e
   where e is distinct from p_actor;
end;
$function$;

-- 2. ─────────────────────────────────────────────────────────────────────────
-- Mes films notés (verdict partageable) qu'au moins un autre membre actif de
-- l'espace a notés aussi, et qui ne sont pas déjà dans l'espace.
create or replace function private.common_films(p_space uuid, p_me uuid)
 returns table (um_id uuid, tmdb_id integer, media_type text, other_ids uuid[])
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select distinct on (mine.tmdb_id, coalesce(mine.media_type, 'movie'))
         mine.id, mine.tmdb_id, coalesce(mine.media_type, 'movie'),
         array(
           select them.profile_id
             from public.user_movies them
             join public.space_members m on m.profile_id = them.profile_id and m.space_id = p_space and m.is_active
            where them.tmdb_id = mine.tmdb_id
              and coalesce(them.media_type, 'movie') = coalesce(mine.media_type, 'movie')
              and them.profile_id <> p_me
              and private.personal_verdict_is_shareable(them)
              and private.not_blocked(p_me, them.profile_id)
         )
    from public.user_movies mine
   where mine.profile_id = p_me
     and private.personal_verdict_is_shareable(mine)
     and exists (
       select 1
         from public.user_movies them
         join public.space_members m on m.profile_id = them.profile_id and m.space_id = p_space and m.is_active
        where them.tmdb_id = mine.tmdb_id
          and coalesce(them.media_type, 'movie') = coalesce(mine.media_type, 'movie')
          and them.profile_id <> p_me
          and private.personal_verdict_is_shareable(them)
          and private.not_blocked(p_me, them.profile_id)
     )
     and not exists (
       select 1 from public.shared_movies s
        where s.space_id = p_space
          and s.tmdb_id = mine.tmdb_id
          and coalesce(s.media_type, 'movie') = coalesce(mine.media_type, 'movie')
          and s.season_number is null
     )
   order by mine.tmdb_id, coalesce(mine.media_type, 'movie'), mine.updated_at desc nulls last;
$function$;

-- Ce que la question montre : combien de films, avec qui, et trois affiches.
create or replace function public.common_films_preview(p_space uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  v_me uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_me is null or not exists (
    select 1 from public.space_members where space_id = p_space and profile_id = v_me and is_active
  ) then
    return jsonb_build_object('count', 0, 'names', '[]'::jsonb, 'posters', '[]'::jsonb);
  end if;

  with films as (
    select c.*, um.poster_url, coalesce(um.rated_at, um.updated_at) as seen_at
      from private.common_films(p_space, v_me) c
      join public.user_movies um on um.id = c.um_id
  ),
  people as (
    select distinct unnest(other_ids) as id from films
  )
  select jsonb_build_object(
    'count', (select count(*) from films),
    'names', coalesce((
      select jsonb_agg(coalesce(nullif(btrim(p.first_name), ''), 'Membre') order by p.first_name)
        from people join public.profiles p on p.id = people.id
    ), '[]'::jsonb),
    'posters', coalesce((
      select jsonb_agg(poster_url)
        from (select poster_url from films where poster_url is not null order by seen_at desc nulls last limit 3) f
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

-- L'ajout. Les notes suivent par le trigger `shared_movies_collect_verdicts`.
-- Les membres qui n'ont pas vu le film sont marqués « pas vu » : on n'attend
-- pas leur note, et aucune relance ne part. Le film prend sa place dans
-- l'historique (date de la note la plus récente), pas en tête de l'espace.
create or replace function public.add_common_films(p_space uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_me uuid := (select auth.uid());
  v_ids uuid[];
begin
  if v_me is null or not exists (
    select 1 from public.space_members where space_id = p_space and profile_id = v_me and is_active
  ) then
    raise exception 'Tu ne fais pas partie de cet espace.' using errcode = '42501';
  end if;

  perform set_config('bitter.quiet_verdicts', 'on', true);

  -- Les « pas vu » d'abord : posés après l'insertion, ils arriveraient trop
  -- tard, le trigger des notes ayant déjà cherché qui attendre.
  with films as (
    select um.*
      from private.common_films(p_space, v_me) c
      join public.user_movies um on um.id = c.um_id
  ),
  added as (
    insert into public.shared_movies (
      space_id, added_by, tmdb_id, title, director, director_id, actors, actor_ids, year,
      release_date, runtime, genre, poster_url, tmdb_rating, status, date_watched, media_type,
      production_status, number_of_seasons
    )
    select p_space, v_me, f.tmdb_id, f.title, f.director, f.director_id, f.actors, f.actor_ids, f.year,
           f.release_date, f.runtime, f.genre, f.poster_url, f.tmdb_rating, 'watchlist', f.date_watched, f.media_type,
           f.production_status, f.number_of_seasons
      from films f
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_ids from added;

  if cardinality(v_ids) = 0 then
    return 0;
  end if;

  insert into public.space_movie_skips (movie_id, profile_id)
  select s.id, m.profile_id
    from public.shared_movies s
    join public.space_members m on m.space_id = s.space_id and m.is_active
   where s.id = any(v_ids)
     and not exists (
       select 1 from public.user_movies um
        where um.profile_id = m.profile_id
          and um.tmdb_id = s.tmdb_id
          and coalesce(um.media_type, 'movie') = coalesce(s.media_type, 'movie')
          and private.personal_verdict_is_shareable(um)
     )
  on conflict do nothing;

  -- Passage en « vu » : le trigger rassemble les notes, et `check_verdict`
  -- pose le verdict sans prévenir personne.
  update public.shared_movies set status = 'watched' where id = any(v_ids);

  update public.shared_movies s
     set added_at = coalesce((select max(r.rated_at) from public.movie_ratings r where r.movie_id = s.id), s.added_at)
   where s.id = any(v_ids);
  update public.space_verdicts v
     set completed_at = coalesce((select max(r.rated_at) from public.movie_ratings r where r.movie_id = v.movie_id), v.completed_at)
   where v.movie_id = any(v_ids);

  return cardinality(v_ids);
end;
$function$;

-- 3. ─────────────────────────────────────────────────────────────────────────
-- Pour chaque film vu de ma collection, la note des membres de mes espaces qui
-- l'ont vu aussi (verdict partageable, pas de blocage).
create or replace function public.get_common_ratings()
 returns table (media_type text, tmdb_id integer, profile_id uuid, first_name text, avatar_url text, rating numeric)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select distinct on (coalesce(mine.media_type, 'movie'), mine.tmdb_id, them.profile_id)
         coalesce(mine.media_type, 'movie'), mine.tmdb_id, them.profile_id,
         coalesce(nullif(btrim(p.first_name), ''), 'Membre'), p.avatar_url,
         private.overall_rating(them.story, them.visuals, them.acting, them.sound, them.adaptive_rating)
    from public.user_movies mine
    join public.user_movies them
      on them.tmdb_id = mine.tmdb_id
     and coalesce(them.media_type, 'movie') = coalesce(mine.media_type, 'movie')
     and them.profile_id <> mine.profile_id
    join public.profiles p on p.id = them.profile_id
   where (select auth.uid()) is not null
     and mine.profile_id = (select auth.uid())
     and mine.status = 'watched' and mine.deleted_at is null and mine.season_number is null and mine.tmdb_id is not null
     and private.personal_verdict_is_shareable(them)
     and private.are_co_members(mine.profile_id, them.profile_id)
     and private.not_blocked(mine.profile_id, them.profile_id)
   order by coalesce(mine.media_type, 'movie'), mine.tmdb_id, them.profile_id, them.updated_at desc nulls last;
$function$;

revoke all on function private.common_films(uuid, uuid) from public;
revoke all on function public.common_films_preview(uuid) from public, anon;
revoke all on function public.add_common_films(uuid) from public, anon;
revoke all on function public.get_common_ratings() from public, anon;
grant execute on function public.common_films_preview(uuid) to authenticated;
grant execute on function public.add_common_films(uuid) to authenticated;
grant execute on function public.get_common_ratings() to authenticated;
