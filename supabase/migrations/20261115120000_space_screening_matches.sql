-- « Vous y allez ensemble » : deux membres d'un espace ont réservé, chacun de
-- son côté, la même séance.
--
-- `cinema_screenings` reste privée (chacun ne lit que les siennes). Cette
-- fonction ne révèle d'un autre membre QUE les séances qui correspondent à
-- l'une des miennes : même film, même heure à un quart d'heure près, même
-- cinéma quand les deux le précisent. Le reste de son calendrier ne sort pas.
--
-- Rejouable : create or replace.

create or replace function public.space_screening_matches(p_space_id uuid)
returns table (tmdb_id integer, profile_id uuid, starts_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select auth.uid() as id
  ),
  allowed as (
    select m.profile_id
    from public.space_members m, me
    where m.space_id = p_space_id
      and m.is_active
      and exists (
        select 1 from public.space_members mine
        where mine.space_id = p_space_id and mine.profile_id = me.id and mine.is_active
      )
  )
  select distinct other.tmdb_id, other.profile_id, other.starts_at
  from public.cinema_screenings mine
  join me on mine.profile_id = me.id
  join public.cinema_screenings other
    on other.tmdb_id = mine.tmdb_id
   and other.profile_id <> me.id
   and abs(extract(epoch from (other.starts_at - mine.starts_at))) <= 900
   and (
     nullif(btrim(lower(other.cinema_name)), '') is null
     or nullif(btrim(lower(mine.cinema_name)), '') is null
     or btrim(lower(other.cinema_name)) = btrim(lower(mine.cinema_name))
   )
  join allowed on allowed.profile_id = other.profile_id
  where mine.tmdb_id is not null
    and mine.status <> 'cancelled'
    and other.status <> 'cancelled'
    and mine.starts_at > now() - interval '3 hours';
$$;

revoke all on function public.space_screening_matches(uuid) from public, anon;
grant execute on function public.space_screening_matches(uuid) to authenticated;

comment on function public.space_screening_matches(uuid) is
  'Séances des autres membres de l''espace qui correspondent à l''une des miennes (même film, ±15 min, même cinéma). Rien d''autre de leur calendrier.';
