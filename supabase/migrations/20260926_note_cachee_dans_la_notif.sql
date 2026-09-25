-- La note de l'autre ne part dans la notification que si l'on a déjà noté.
--
-- Après une séance à deux, le premier qui note déclenchait « Léa a mis 8,9 à
-- Dune » chez l'autre : la note cachée était dévoilée par la notification
-- elle-même, avant que l'autre ait noté. Désormais, tant que la personne qui
-- reçoit n'a pas de verdict sur le film, la notification dit seulement « Léa a
-- noté Dune », et la note se découvre en notant.

create or replace function private.on_rating_answer_request()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into public.notifications (recipient_id, actor_id, kind, space_id, shared_movie_id, title, poster_url, rating)
  select distinct on (n.actor_id) n.actor_id, new.profile_id, 'verdict_given', n.space_id, n.shared_movie_id, n.title, n.poster_url,
    case when exists (
      select 1 from public.movie_ratings r where r.movie_id = new.movie_id and r.profile_id = n.actor_id
    ) then private.overall_rating(new.story, new.visuals, new.acting, new.sound, new.adaptive_rating) end
  from public.notifications n
  where n.kind in ('verdict_request', 'plan_rate') and n.shared_movie_id = new.movie_id
    and n.recipient_id = new.profile_id and n.actor_id is not null
  on conflict do nothing;

  update public.notifications set read_at = coalesce(read_at, now())
  where kind in ('verdict_request', 'plan_rate') and shared_movie_id = new.movie_id and recipient_id = new.profile_id;

  return new;
end;
$$;

revoke execute on function private.on_rating_answer_request() from public, anon, authenticated;
