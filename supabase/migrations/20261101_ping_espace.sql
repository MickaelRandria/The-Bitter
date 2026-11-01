-- Prévenir des membres de son espace, depuis l'app :
--   « recap » : la story du récap du mois est dispo ;
--   « blind » : un défi au blind test BO, avec son score.
--
-- Les textes sont dans supabase/functions/notify/messages.ts (kind 'space_ping').
-- `title` porte une phrase complète : tant que la fonction `notify` n'est pas
-- redéployée, le push retombe sur ce titre et reste lisible.

-- ─── 0. Sortes de notifications ──────────────────────────────────────────────
-- Relevé en prod le 2026-11-01 : la liste ci-dessous + 'space_ping'.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind = any (array[
  'watch_invite', 'watch_accepted', 'verdict_request', 'verdict_given', 'link_answered', 'link_joined',
  'plan_proposed', 'plan_agreed', 'plan_cancelled', 'plan_rate', 'common_wish', 'release_today',
  'now_streaming', 'tv_episode', 'tv_season', 'tv_season_soon',
  'vote_reminder', 'rating_reminder', 'verdict_complete', 'review_reaction', 'verdict_debate',
  'running_late', 'space_ping'
]::text[]));

-- ─── 1. Envoi ────────────────────────────────────────────────────────────────
-- Seulement des membres actifs du même espace, non bloqués, huit au plus par
-- envoi, trente envois par heure : un bouton de partage ne doit pas devenir
-- une sonnette.
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
  if p_what not in ('recap', 'blind') then raise exception 'invalid-kind'; end if;
  if not public.is_member_of_space(p_space) then raise exception 'not-a-member'; end if;
  if p_what = 'blind' and (p_score is null or p_total is null or p_score < 0 or p_total < 1 or p_score > p_total or p_total > 20) then
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
