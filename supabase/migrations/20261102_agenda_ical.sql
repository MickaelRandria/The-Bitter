-- Agenda iCal : un lien d'abonnement privé par compte, pour voir ses séances
-- dans le Calendrier de l'iPhone, Google Agenda… et les partager à ses proches.
--
-- Le lien porte un code secret (22 caractères). Il ne se lit que par les deux
-- fonctions ci-dessous : la table n'a aucune politique, personne ne la lit
-- directement. Changer le code coupe l'ancien lien.

create table if not exists public.calendar_feeds (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{22}$'),
  created_at timestamp with time zone not null default now()
);

alter table public.calendar_feeds enable row level security;

-- Le code de la personne connectée ; créé au premier appel, renouvelé sur demande.
create or replace function public.calendar_feed_token(p_rotate boolean default false)
returns text
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select token into v_token from public.calendar_feeds where profile_id = v_uid;
  if v_token is null or p_rotate then
    v_token := rtrim(translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/', '-_'), '=');
    insert into public.calendar_feeds (profile_id, token) values (v_uid, v_token)
      on conflict (profile_id) do update set token = excluded.token, created_at = now();
  end if;
  return v_token;
end;
$$;

revoke all on function public.calendar_feed_token(boolean) from public, anon;
grant execute on function public.calendar_feed_token(boolean) to authenticated;

-- Les séances derrière un code : des 60 derniers jours à l'an prochain, sans
-- les annulées. Sans compte (le lien est lu par les agendas), d'où `anon`.
create or replace function public.get_calendar_feed(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_profile uuid;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{22}$' then return null; end if;
  select profile_id into v_profile from public.calendar_feeds where token = p_token;
  if v_profile is null then return null; end if;
  return jsonb_build_object(
    'first_name', (select coalesce(p.first_name, '') from public.profiles p where p.id = v_profile),
    'screenings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'title', s.title,
        'starts_at', s.starts_at,
        'cinema_name', s.cinema_name,
        'cinema_address', s.cinema_address,
        'format', s.format,
        'status', s.status,
        'booking_url', s.booking_url,
        'updated_at', s.updated_at
      ) order by s.starts_at)
      from public.cinema_screenings s
      where s.profile_id = v_profile
        and s.status <> 'cancelled'
        and s.starts_at > now() - interval '60 days'
        and s.starts_at < now() + interval '1 year'
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_calendar_feed(text) from public;
grant execute on function public.get_calendar_feed(text) to anon, authenticated;
