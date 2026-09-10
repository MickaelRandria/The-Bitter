-- Fil d'activité des proches, filtré par type d'œuvre.
--
-- POURQUOI UNE SECONDE FONCTION PLUTÔT QU'UN FILTRE CÔTÉ NAVIGATEUR
-- `get_friends_activity` rend les cinquante dernières lignes, tous types
-- confondus. Trier ensuite dans le navigateur ne rendrait pas cinquante séries :
-- il rendrait les séries qui se trouvent dans les cinquante dernières lignes,
-- c'est-à-dire souvent aucune. Le filtre doit s'appliquer **avant** le LIMIT.
--
-- L'ancienne fonction n'est pas touchée : une PWA déjà installée continue de
-- l'appeler tant qu'elle n'a pas récupéré le nouveau bundle.
--
-- ORDRE DE MISE EN LIGNE
-- Cette migration doit être appliquée **avant** le déploiement du client, sans
-- quoi `get_friends_activity_by_media` n'existe pas et le fil tombe en panne
-- pour les films comme pour les séries.
create schema if not exists private;
create or replace function private.friends_activity_by_media(_media_type text, _limit integer)
returns table (
  movie_id uuid, profile_id uuid, first_name text, avatar_url text,
  title text, director text, year integer, poster_url text, tmdb_id integer,
  rating numeric, adaptive_rating jsonb, review text, synopsis text,
  watched_at timestamptz, media_type text, series_tmdb_id integer, season_number integer
)
language sql stable security definer set search_path = ''
as $function$
  with co_members as (
    select distinct them.profile_id
    from public.space_members me
    join public.space_members them on them.space_id = me.space_id
    where auth.uid() is not null and me.profile_id = auth.uid()
      and me.is_active and them.is_active and them.profile_id <> auth.uid()
  )
  select m.id, m.profile_id, coalesce(p.first_name, 'Membre'), p.avatar_url,
    m.title, coalesce(m.director, ''), m.year, m.poster_url, m.tmdb_id,
    coalesce((m.adaptive_rating ->> 'weightedRating')::numeric,
      (m.story + m.visuals + m.acting + m.sound) / 4.0),
    m.adaptive_rating, m.comment, m.review, coalesce(m.date_watched, m.created_at),
    coalesce(m.media_type, 'movie')::text, m.series_tmdb_id, m.season_number
  from public.user_movies m
  join co_members c on c.profile_id = m.profile_id
  left join public.profiles p on p.id = m.profile_id
  where m.deleted_at is null and m.shared_to_feed
    and coalesce(m.media_type, 'movie') = _media_type
    and _media_type in ('movie', 'tv')
    and m.status = 'watched' and m.story is not null
  order by coalesce(m.date_watched, m.created_at) desc, m.id
  limit least(greatest(_limit, 1), 100);
$function$;

revoke all on function private.friends_activity_by_media(text, integer) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.friends_activity_by_media(text, integer) to authenticated;

create or replace function public.get_friends_activity_by_media(_media_type text default 'movie', _limit integer default 50)
returns table (
  movie_id uuid, profile_id uuid, first_name text, avatar_url text,
  title text, director text, year integer, poster_url text, tmdb_id integer,
  rating numeric, adaptive_rating jsonb, review text, synopsis text,
  watched_at timestamptz, media_type text, series_tmdb_id integer, season_number integer
)
language sql stable security invoker set search_path = ''
as $function$
  select * from private.friends_activity_by_media(_media_type, _limit);
$function$;
revoke all on function public.get_friends_activity_by_media(text, integer) from public, anon;
grant execute on function public.get_friends_activity_by_media(text, integer) to authenticated;
