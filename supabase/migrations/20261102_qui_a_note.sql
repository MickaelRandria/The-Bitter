-- « Qui a mis cette note ? » : le record de l'espace, et défier les autres.
--
-- 1. Une ligne par partie terminée, comme blind_test_scores : le classement
--    garde la meilleure de chacun. Score non vérifié côté serveur (jeu entre amis).
-- 2. ping_space_members accepte « who » (défi avec son score), en plus de
--    « recap » et « blind ». Textes du push : supabase/functions/notify/messages.ts.

-- ─── 1. Scores ───────────────────────────────────────────────────────────────
create table if not exists public.who_rated_scores (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.shared_spaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  score smallint not null check (score >= 0),
  total smallint not null check (total between 1 and 20),
  created_at timestamptz not null default now(),
  check (score <= total)
);

create index if not exists who_rated_scores_space_idx on public.who_rated_scores (space_id, score desc);

alter table public.who_rated_scores enable row level security;

drop policy if exists "who rated: members read" on public.who_rated_scores;
create policy "who rated: members read" on public.who_rated_scores
  for select to authenticated
  using (public.is_member_of_space(space_id));

drop policy if exists "who rated: own insert" on public.who_rated_scores;
create policy "who rated: own insert" on public.who_rated_scores
  for insert to authenticated
  with check (profile_id = (select auth.uid()) and public.is_member_of_space(space_id));

grant select, insert on public.who_rated_scores to authenticated;

-- ─── 2. Défier les autres ────────────────────────────────────────────────────
create or replace function public.ping_space_members(
  p_space uuid,
  p_what text,
  p_recipients uuid[],
  p_score integer default null,
  p_total integer default null,
  p_month text default null
)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_me uuid := auth.uid();
  v_space public.shared_spaces;
  v_actor text;
  v_others uuid[];
  v_other uuid;
  v_title text;
  v_sent integer := 0;
begin
  if v_me is null then raise exception 'not-authenticated'; end if;
  if p_what not in ('recap', 'blind', 'who') then raise exception 'invalid-kind'; end if;
  if not public.is_member_of_space(p_space) then raise exception 'not-a-member'; end if;
  if p_what in ('blind', 'who') and (p_score is null or p_total is null or p_score < 0 or p_total < 1 or p_score > p_total or p_total > 20) then
    raise exception 'invalid-score';
  end if;
  if p_month is not null and p_month !~ '^\d{4}-\d{2}$' then raise exception 'invalid-month'; end if;

  select * into v_space from public.shared_spaces where id = p_space;
  select coalesce(nullif(trim(first_name), ''), 'Quelqu’un') into v_actor from public.profiles where id = v_me;

  select array_agg(distinct x) into v_others
    from unnest(p_recipients) x
   where x is not null and x <> v_me;
  if v_others is null or cardinality(v_others) = 0 then raise exception 'no-invitee'; end if;
  if cardinality(v_others) > 8 then raise exception 'too-many-invitees'; end if;

  foreach v_other in array v_others loop
    if not exists (
         select 1 from public.space_members m
          where m.space_id = p_space and m.profile_id = v_other and m.is_active
       ) or not private.not_blocked(v_me, v_other) then
      raise exception 'invitee-not-allowed';
    end if;
  end loop;

  if (select count(*) from public.notifications
       where actor_id = v_me and kind = 'space_ping'
         and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'rate-limited';
  end if;

  v_title := case p_what
    when 'recap' then v_actor || ' : le récap du mois de « ' || v_space.name || ' » est dispo'
    when 'who' then v_actor || ' te défie à « Qui a mis cette note ? » dans « ' || v_space.name || ' » (' || p_score || '/' || p_total || ')'
    else v_actor || ' te défie au blind test BO de « ' || v_space.name || ' » (' || p_score || '/' || p_total || ')'
  end;

  insert into public.notifications (recipient_id, actor_id, kind, space_id, title, payload)
  select other, v_me, 'space_ping', p_space, v_title,
         jsonb_strip_nulls(jsonb_build_object(
           'what', p_what,
           'space', v_space.name,
           'score', p_score,
           'total', p_total,
           'month', p_month
         ))
    from unnest(v_others) as other;
  get diagnostics v_sent = row_count;
  return v_sent;
end;
$$;

revoke all on function public.ping_space_members(uuid, text, uuid[], integer, integer, text) from public, anon;
grant execute on function public.ping_space_members(uuid, text, uuid[], integer, integer, text) to authenticated;
