-- La page du lien donne le lien de réservation du créneau retenu.
--
-- Une personne sans compte qui choisit « lundi 20 h 30 · UGC Talence » doit
-- pouvoir réserver sa propre place : la carte UGC de chacun est personnelle. Le
-- lien n'est rendu que pour le créneau arrêté, jamais pour les créneaux encore
-- en discussion.

create or replace function public.get_share_link(p_token text, p_guest_key uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_link public.share_links%rowtype;
  v_response public.share_link_responses%rowtype;
  v_inviter text;
  v_plan jsonb;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{22}$' then return null; end if;
  select * into v_link from public.share_links where token = p_token;
  if not found then return null; end if;

  select coalesce(nullif(btrim(first_name), ''), 'Quelqu''un') into v_inviter
  from public.profiles where id = v_link.inviter_id;

  if p_guest_key is not null then
    select * into v_response from public.share_link_responses
    where link_id = v_link.id and guest_key = p_guest_key;
  end if;

  if v_link.plan_id is not null then
    select jsonb_build_object(
      'status', p.status,
      'chosen_slot_id', p.chosen_slot_id,
      'slots', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', s.id, 'starts_at', s.starts_at, 'cinema_name', s.cinema_name, 'version', s.version,
          'booking_url', case when p.status = 'agreed' and s.id = p.chosen_slot_id then s.booking_url end
        ) order by s.position)
        from public.watch_plan_slots s where s.plan_id = p.id and s.starts_at > now()
      ), '[]'::jsonb)
    ) into v_plan
    from public.watch_plans p where p.id = v_link.plan_id and p.status in ('open', 'agreed');
  end if;

  return jsonb_build_object(
    'kind', v_link.kind,
    'inviter', coalesce(v_inviter, 'Quelqu''un'),
    'title', v_link.title,
    'year', v_link.year,
    'media_type', v_link.media_type,
    'tmdb_id', v_link.tmdb_id,
    'poster_url', v_link.poster_url,
    'backdrop_url', v_link.backdrop_url,
    'runtime', v_link.runtime,
    'release_date', v_link.release_date,
    'expired', v_link.expires_at < now(),
    'plan', v_plan,
    'response', case when v_response.id is null then null else jsonb_build_object(
      'name', v_response.guest_name,
      'interested', v_response.interested,
      'rating', v_response.rating,
      'slot_id', v_response.slot_id
    ) end,
    'inviter_rating', case when v_response.rating is not null
      then private.public_rating(v_link.inviter_rating) end
  );
end;
$$;

revoke execute on function public.get_share_link(text, uuid) from public;
grant execute on function public.get_share_link(text, uuid) to anon, authenticated;
