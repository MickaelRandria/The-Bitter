-- Compagnon des séries : alertes d'épisodes et de saisons, et place des proches.
--
-- ORDRE DE MISE EN LIGNE
-- 1. Cette migration.
-- 2. Les fonctions Edge `series-alerts` (nouvelle), `notify` (nouveaux textes)
--    et `ai` (action `series-recap`).
-- Le client peut précéder : sans `get_friends_series_progress`, la section des
-- proches reste masquée ; sans `series-recap`, le récap retombe sur les résumés
-- bruts. Mais aucune alerte ne part avant l'étape 2.
--
-- VÉRIFIER AVANT D'APPLIQUER
-- La liste des sortes ci-dessous reprend celle de 20260927_film_attendu.sql. La
-- base de prod a pu dériver du dépôt : relever la contrainte réelle avec
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'notifications_kind_check';
-- et ne rien retirer de ce qu'elle contient.

-- ─── Nouvelles sortes de notifications ──────────────────────────────────────

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'watch_invite', 'watch_accepted', 'verdict_request', 'verdict_given', 'link_answered', 'link_joined',
  'plan_proposed', 'plan_agreed', 'plan_cancelled', 'plan_rate',
  'common_wish', 'release_today', 'now_streaming',
  'tv_episode',     -- un nouvel épisode d'une série qu'on suit est diffusé aujourd'hui
  'tv_season',      -- une nouvelle saison commence aujourd'hui
  'tv_season_soon'  -- une nouvelle saison commence dans trois jours
));

-- Une fois par personne, par série et par épisode (ou par saison annoncée) : un
-- second passage du cron le même jour ne rejoue rien.
create unique index if not exists notifications_once_series
  on public.notifications (recipient_id, kind, (payload ->> 'tmdb_id'), (payload ->> 'key'))
  where kind in ('tv_episode', 'tv_season', 'tv_season_soon');

-- ─── Où en est quelqu'un dans une série ─────────────────────────────────────

/**
 * La saison la plus avancée que la progression atteint, même partiellement.
 *
 * Mêmes trois sources que le client (utils/upNext.ts) : épisodes cochés, saisons
 * cochées en bloc, marque-page. Le marque-page désigne l'épisode à REPRENDRE :
 * « saison 28, épisode 1 » veut dire que la saison 27 est vue, pas la 28.
 */
create or replace function private.series_furthest_season(p jsonb)
returns integer
language sql
immutable
set search_path to ''
as $$
  select greatest(
    coalesce((
      select max((e ->> 'seasonNumber')::int)
      from jsonb_each(case when jsonb_typeof(p -> 'episodes') = 'object' then p -> 'episodes' else '{}'::jsonb end) as x(k, e)
      where (e ->> 'watched')::boolean
    ), 0),
    coalesce((
      select max(v::int)
      from jsonb_array_elements_text(case when jsonb_typeof(p -> 'seasonsWatched') = 'array' then p -> 'seasonsWatched' else '[]'::jsonb end) as v
    ), 0),
    coalesce(
      case when coalesce((p ->> 'lastEpisode')::int, 1) > 1
        then (p ->> 'lastSeason')::int
        else (p ->> 'lastSeason')::int - 1
      end, 0)
  );
$$;

-- ─── Alertes : appelées par l'Edge Function `series-alerts` ─────────────────

/** Les séries suivies par au moins une personne : en cours ou à jour. */
create or replace function public.series_alert_candidates()
returns table (tmdb_id integer)
language sql
stable
security definer
set search_path to ''
as $$
  select distinct m.tmdb_id
  from public.user_movies m
  where m.media_type = 'tv' and m.season_number is null and m.deleted_at is null and m.tmdb_id is not null
    and m.tv_progress ->> 'state' in ('watching', 'completed')
  limit 500;
$$;

/**
 * Prévient ceux que la nouvelle concerne vraiment.
 *
 * Un épisode de la saison 5 ne dit rien à qui en est à la saison 2 : l'alerte
 * d'épisode ne va qu'à ceux qui ont atteint cette saison. Une nouvelle saison
 * intéresse ceux qui ont au moins atteint la précédente.
 */
create or replace function public.record_series_alert(
  p_tmdb_id integer, p_kind text, p_season integer, p_episode integer, p_air_date date
)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_row record;
  v_count integer := 0;
  v_rows integer;
  v_key text;
  v_min_season integer;
begin
  if p_kind is null or p_kind not in ('tv_episode', 'tv_season', 'tv_season_soon')
     or p_season is null or p_season < 1 then
    return 0;
  end if;
  v_key := case when p_kind = 'tv_season_soon' then 'soon:' || p_season
                else p_season || ':' || coalesce(p_episode, 1) end;
  v_min_season := case when p_kind = 'tv_episode' then p_season else p_season - 1 end;

  for v_row in
    select m.profile_id, m.title, m.poster_url
    from public.user_movies m
    where m.tmdb_id = p_tmdb_id and m.media_type = 'tv' and m.season_number is null and m.deleted_at is null
      and m.tv_progress ->> 'state' in ('watching', 'completed')
      and private.series_furthest_season(m.tv_progress) >= v_min_season
  loop
    insert into public.notifications (recipient_id, kind, title, poster_url, payload)
    values (
      v_row.profile_id, p_kind, v_row.title, v_row.poster_url,
      jsonb_build_object(
        'media_type', 'tv', 'tmdb_id', p_tmdb_id, 'key', v_key,
        'season', p_season, 'episode', p_episode, 'air_date', p_air_date
      )
    )
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end loop;
  return v_count;
end;
$$;

-- ─── Où en sont mes proches ─────────────────────────────────────────────────

/**
 * La place de chaque proche dans une série. Rien d'autre : ni note, ni avis,
 * ni épisode commenté — ce qui est devant soi reste un spoiler.
 *
 * Seulement les séries que chacun laisse visibles dans ses espaces
 * (`shared_to_feed`), et jamais les séries abandonnées.
 */
create or replace function public.get_friends_series_progress(p_series_tmdb_id integer)
returns table (
  profile_id uuid, first_name text, avatar_url text, state text,
  last_season integer, last_episode integer, seasons_watched integer[],
  furthest_season integer, furthest_episode integer
)
language sql
stable
security definer
set search_path to ''
as $$
  select m.profile_id, coalesce(nullif(btrim(p.first_name), ''), 'Membre'), p.avatar_url,
    m.tv_progress ->> 'state',
    (m.tv_progress ->> 'lastSeason')::int,
    (m.tv_progress ->> 'lastEpisode')::int,
    (
      select array_agg(v::int order by v::int)
      from jsonb_array_elements_text(
        case when jsonb_typeof(m.tv_progress -> 'seasonsWatched') = 'array' then m.tv_progress -> 'seasonsWatched' else '[]'::jsonb end
      ) as v
    ),
    f.pos[1], f.pos[2]
  from public.user_movies m
  join public.profiles p on p.id = m.profile_id
  left join lateral (
    select max(array[(e ->> 'seasonNumber')::int, (e ->> 'episodeNumber')::int]) as pos
    from jsonb_each(
      case when jsonb_typeof(m.tv_progress -> 'episodes') = 'object' then m.tv_progress -> 'episodes' else '{}'::jsonb end
    ) as x(k, e)
    where (e ->> 'watched')::boolean and (e ->> 'seasonNumber')::int > 0
  ) f on true
  where (select auth.uid()) is not null
    and m.profile_id <> (select auth.uid())
    and m.tmdb_id = p_series_tmdb_id and m.media_type = 'tv' and m.season_number is null
    and m.deleted_at is null and m.shared_to_feed and m.tv_progress is not null
    and coalesce(m.tv_progress ->> 'state', 'planned') <> 'dropped'
    and private.are_co_members((select auth.uid()), m.profile_id)
    and private.not_blocked((select auth.uid()), m.profile_id)
  order by 2
  limit 30;
$$;

-- ─── Droits ─────────────────────────────────────────────────────────────────

revoke execute on function private.series_furthest_season(jsonb) from public, anon, authenticated;
revoke execute on function public.get_friends_series_progress(integer) from public, anon;
grant execute on function public.get_friends_series_progress(integer) to authenticated;
-- Appelées par l'Edge Function via l'API REST : dans `public`, mais réservées à service_role.
revoke execute on function public.series_alert_candidates() from public, anon, authenticated;
revoke execute on function public.record_series_alert(integer, text, integer, integer, date) from public, anon, authenticated;
grant execute on function public.series_alert_candidates() to service_role;
grant execute on function public.record_series_alert(integer, text, integer, integer, date) to service_role;

-- ─── Chaque matin ───────────────────────────────────────────────────────────

-- 7 h 20 UTC, après les films attendus : les deux tours ne se marchent pas dessus.
select cron.schedule(
  'bitter-series',
  '20 7 * * *',
  $$
    select net.http_post(
      url := 'https://tnvnmsevddvcklkitnpa.supabase.co/functions/v1/series-alerts',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'workerToken', (select worker_token from public.push_worker_credentials where singleton)
      )
    );
  $$
);
