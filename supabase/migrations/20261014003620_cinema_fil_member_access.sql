-- Les préférences invitées peuvent rester locales ; les conversations du Fil
-- demandent un compte identifié, pas une session anonyme créée en arrière-plan.
create or replace function private.cinema_fil_visible(p_item text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and not coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
    and (
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
