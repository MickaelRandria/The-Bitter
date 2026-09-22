-- Modération : signaler un contenu, bloquer une personne.
--
-- Google Play exige des deux pour toute app où des utilisateurs publient ce que
-- d'autres lisent (avis, fil des amis, espaces partagés). Le blocage est
-- réciproque à l'affichage : ni l'un ni l'autre ne voit plus l'activité de
-- l'autre dans le fil.

-- 1. Blocages ------------------------------------------------------------------

create table if not exists public.user_blocks (
  blocker_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

drop policy if exists "Voir ses blocages" on public.user_blocks;
create policy "Voir ses blocages" on public.user_blocks
  for select to authenticated using (blocker_id = (select auth.uid()));

drop policy if exists "Bloquer" on public.user_blocks;
create policy "Bloquer" on public.user_blocks
  for insert to authenticated with check (blocker_id = (select auth.uid()));

drop policy if exists "Débloquer" on public.user_blocks;
create policy "Débloquer" on public.user_blocks
  for delete to authenticated using (blocker_id = (select auth.uid()));

grant select, insert, delete on public.user_blocks to authenticated;
revoke all on public.user_blocks from anon;

-- 2. Signalements --------------------------------------------------------------
--
-- Le texte signalé est recopié (`content_snapshot`) : l'auteur peut le modifier
-- ou supprimer son compte avant que le signalement soit examiné, et il faut
-- pouvoir juger sur pièce. Les signalements se traitent dans le tableau de bord
-- Supabase (colonne `status`) ; aucun client ne peut les lire, sauf les siens.

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid default auth.uid() references auth.users (id) on delete set null,
  reported_user_id uuid references auth.users (id) on delete set null,
  content_type text not null check (content_type in ('review', 'feed_item', 'profile', 'space_movie')),
  content_id text not null check (length(content_id) between 1 and 100),
  reason text not null check (reason in ('offensive', 'harassment', 'spam', 'inappropriate', 'other')),
  details text check (details is null or length(details) <= 1000),
  content_snapshot text check (content_snapshot is null or length(content_snapshot) <= 4000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- Un même contenu ne se signale qu'une fois par personne : le bouton peut être
-- pressé deux fois, la file de modération n'a pas à le compter double.
create unique index if not exists content_reports_once
  on public.content_reports (reporter_id, content_type, content_id);
create index if not exists content_reports_open_idx
  on public.content_reports (created_at desc) where status = 'open';

alter table public.content_reports enable row level security;

drop policy if exists "Signaler" on public.content_reports;
create policy "Signaler" on public.content_reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open' and reviewed_at is null);

drop policy if exists "Voir ses signalements" on public.content_reports;
create policy "Voir ses signalements" on public.content_reports
  for select to authenticated using (reporter_id = (select auth.uid()));

grant select, insert on public.content_reports to authenticated;
revoke all on public.content_reports from anon;

-- 3. Le fil d'activité ignore les blocages, dans les deux sens -----------------

create or replace function private.friends_activity_by_media(_media_type text, _limit integer)
 returns table(movie_id uuid, profile_id uuid, first_name text, avatar_url text, title text, director text, year integer, poster_url text, tmdb_id integer, rating numeric, adaptive_rating jsonb, review text, synopsis text, watched_at timestamp with time zone, media_type text, series_tmdb_id integer, season_number integer)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with co_members as (
    select distinct them.profile_id
    from public.space_members me
    join public.space_members them on them.space_id = me.space_id
    where auth.uid() is not null and me.profile_id = auth.uid()
      and me.is_active and them.is_active and them.profile_id <> auth.uid()
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = them.profile_id)
           or (b.blocker_id = them.profile_id and b.blocked_id = auth.uid())
      )
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
