-- « Prévenir que je serai en retard » : depuis l'écran du trajet d'une séance,
-- une notification The Bitter à des proches choisis (membres d'un espace commun).
--
-- Les textes des notifications sont dans supabase/functions/notify/messages.ts.

-- ─── 0. Sortes de notifications ──────────────────────────────────────────────
-- Relevé en prod le 2026-10-23 : la liste ci-dessous + 'running_late'.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind = any (array[
  'watch_invite', 'watch_accepted', 'verdict_request', 'verdict_given', 'link_answered', 'link_joined',
  'plan_proposed', 'plan_agreed', 'plan_cancelled', 'plan_rate', 'common_wish', 'release_today',
  'now_streaming', 'tv_episode', 'tv_season', 'tv_season_soon',
  'vote_reminder', 'rating_reminder', 'verdict_complete', 'review_reaction', 'verdict_debate',
  'running_late'
]::text[]));

-- ─── 1. Envoi ────────────────────────────────────────────────────────────────
-- Mêmes garde-fous que `propose_to_people` : seulement des co-membres non
-- bloqués, huit au plus, et un plafond horaire. La séance doit être la sienne
-- et proche : on ne prévient pas d'un retard pour la semaine prochaine.
create or replace function public.notify_running_late(
  p_screening uuid,
  p_recipients uuid[],
  p_arrive_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_me uuid := auth.uid();
  v_screening public.cinema_screenings;
  v_others uuid[];
  v_other uuid;
  v_sent integer := 0;
begin
  if v_me is null then raise exception 'not-authenticated'; end if;

  select * into v_screening
    from public.cinema_screenings
   where id = p_screening and profile_id = v_me and status = 'scheduled';
  if not found then raise exception 'screening-not-found'; end if;
  if v_screening.starts_at < now() - interval '2 hours'
     or v_screening.starts_at > now() + interval '6 hours' then
    raise exception 'screening-not-soon';
  end if;
  if p_arrive_at is null
     or p_arrive_at < now() - interval '5 minutes'
     or p_arrive_at > now() + interval '6 hours' then
    raise exception 'invalid-arrival';
  end if;

  select array_agg(distinct x) into v_others
    from unnest(p_recipients) x
   where x is not null and x <> v_me;
  if v_others is null or cardinality(v_others) = 0 then raise exception 'no-invitee'; end if;
  if cardinality(v_others) > 8 then raise exception 'too-many-invitees'; end if;

  foreach v_other in array v_others loop
    if not private.are_co_members(v_me, v_other) or not private.not_blocked(v_me, v_other) then
      raise exception 'invitee-not-allowed';
    end if;
  end loop;

  if (select count(*) from public.notifications
       where actor_id = v_me and kind = 'running_late'
         and created_at > now() - interval '1 hour') >= 16 then
    raise exception 'rate-limited';
  end if;

  insert into public.notifications (recipient_id, actor_id, kind, title, poster_url, payload)
  select other, v_me, 'running_late', v_screening.title, v_screening.poster_url,
         jsonb_build_object(
           'arrive_at', p_arrive_at,
           'starts_at', v_screening.starts_at,
           'cinema_name', v_screening.cinema_name
         )
    from unnest(v_others) as other;
  get diagnostics v_sent = row_count;
  return v_sent;
end;
$$;

revoke all on function public.notify_running_late(uuid, uuid[], timestamptz) from public, anon;
grant execute on function public.notify_running_late(uuid, uuid[], timestamptz) to authenticated;
