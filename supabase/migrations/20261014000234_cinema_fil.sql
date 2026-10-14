-- Le Fil cinéma : préférences personnelles, réactions et conversations.
-- Les avis restent visibles seulement aux co-membres autorisés.
create or replace function private.cinema_fil_visible(p_item text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    p_item ~ '^(news:[a-f0-9]{16}|(discovery|release):(movie|tv):[1-9][0-9]{0,9}|trailer:(movie|tv):[1-9][0-9]{0,9}:[A-Za-z0-9_-]{11})$'
    or (p_item ~ '^review:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' and exists (
      select 1 from public.user_movies m where m.id::text = substring(p_item from 8)
      and m.deleted_at is null and m.status = 'watched' and m.story is not null
      and (m.profile_id = auth.uid() or (m.shared_to_feed
        and private.are_co_members(auth.uid(), m.profile_id)
        and private.not_blocked(auth.uid(), m.profile_id)))
    ))
  );
$$;
create or replace function private.cinema_fil_author_visible(p_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and private.not_blocked(auth.uid(), p_profile);
$$;
revoke all on function private.cinema_fil_visible(text), private.cinema_fil_author_visible(uuid) from public, anon;
grant execute on function private.cinema_fil_visible(text), private.cinema_fil_author_visible(uuid) to authenticated;

create table public.cinema_fil_follows (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  media_type text not null check (media_type in ('movie','tv')),
  tmdb_id integer not null check (tmdb_id > 0),
  title text not null check (char_length(btrim(title)) between 1 and 250),
  poster_url text check (poster_url is null or poster_url like 'https://%'),
  created_at timestamptz not null default now(),
  primary key (profile_id, media_type, tmdb_id)
);
alter table public.cinema_fil_follows enable row level security;
revoke all on public.cinema_fil_follows from public, anon, authenticated;
grant select, insert, update, delete on public.cinema_fil_follows to authenticated;
create policy fil_follows_read on public.cinema_fil_follows for select to authenticated using (profile_id = (select auth.uid()));
create policy fil_follows_insert on public.cinema_fil_follows for insert to authenticated with check (profile_id = (select auth.uid()));
create policy fil_follows_update on public.cinema_fil_follows for update to authenticated using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy fil_follows_delete on public.cinema_fil_follows for delete to authenticated using (profile_id = (select auth.uid()));

create table public.cinema_fil_reactions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null check (char_length(item_id) between 10 and 120),
  created_at timestamptz not null default now(),
  primary key (profile_id, item_id)
);
create index cinema_fil_reactions_item_idx on public.cinema_fil_reactions(item_id);
alter table public.cinema_fil_reactions enable row level security;
revoke all on public.cinema_fil_reactions from public, anon, authenticated;
grant select, insert, delete on public.cinema_fil_reactions to authenticated;
create policy fil_reactions_read on public.cinema_fil_reactions for select to authenticated using (private.cinema_fil_visible(item_id) and private.cinema_fil_author_visible(profile_id));
create policy fil_reactions_insert on public.cinema_fil_reactions for insert to authenticated with check (profile_id = (select auth.uid()) and private.cinema_fil_visible(item_id));
create policy fil_reactions_delete on public.cinema_fil_reactions for delete to authenticated using (profile_id = (select auth.uid()));

create table public.cinema_fil_comments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null check (char_length(item_id) between 10 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index cinema_fil_comments_item_date_idx on public.cinema_fil_comments(item_id,created_at,id);
create index cinema_fil_comments_profile_date_idx on public.cinema_fil_comments(profile_id,created_at);
alter table public.cinema_fil_comments enable row level security;
revoke all on public.cinema_fil_comments from public, anon, authenticated;
grant select, insert, delete on public.cinema_fil_comments to authenticated;
create policy fil_comments_read on public.cinema_fil_comments for select to authenticated using (private.cinema_fil_visible(item_id) and private.cinema_fil_author_visible(profile_id));
create policy fil_comments_insert on public.cinema_fil_comments for insert to authenticated with check (profile_id = (select auth.uid()) and private.cinema_fil_visible(item_id));
create policy fil_comments_delete on public.cinema_fil_comments for delete to authenticated using (profile_id = (select auth.uid()));

create or replace function private.cinema_fil_comment_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or new.profile_id <> auth.uid() then raise exception 'not-authenticated'; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.profile_id::text, 41));
  if (select count(*) from public.cinema_fil_comments where profile_id = new.profile_id and created_at > now() - interval '1 day') >= 50 then
    raise exception 'rate-limited';
  end if;
  new.created_at := now();
  return new;
end;
$$;
revoke all on function private.cinema_fil_comment_limit() from public, anon, authenticated;
create trigger cinema_fil_comment_limit before insert on public.cinema_fil_comments for each row execute function private.cinema_fil_comment_limit();

create or replace function public.cinema_fil_counts(p_keys text[])
returns table(item_id text, likes bigint, comments bigint, liked boolean)
language sql stable security invoker set search_path = '' as $$
  select keys.id,
    (select count(*) from public.cinema_fil_reactions r where r.item_id=keys.id),
    (select count(*) from public.cinema_fil_comments c where c.item_id=keys.id),
    exists(select 1 from public.cinema_fil_reactions r where r.item_id=keys.id and r.profile_id=(select auth.uid()))
  from (select distinct unnest(p_keys[1:80]) as id) keys
  where private.cinema_fil_visible(keys.id);
$$;
revoke all on function public.cinema_fil_counts(text[]) from public, anon;
grant execute on function public.cinema_fil_counts(text[]) to authenticated;
