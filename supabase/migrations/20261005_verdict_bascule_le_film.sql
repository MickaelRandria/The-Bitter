-- Un verdict posé dans un espace fait passer le film en « vu », quel que soit
-- le membre qui le pose.
--
-- La bascule suit la note depuis la PR #68, mais c'est l'app qui la faisait, par
-- un UPDATE sur `shared_movies`. Or la policy `policy_update_movies` ne laisse
-- modifier une ligne qu'à la personne qui a proposé le film, ou à un admin de
-- l'espace. Pour tous les autres l'UPDATE ne touchait aucune ligne, sans erreur
-- visible, et le film restait dans « À voir » sous un verdict.
--
-- Le cas devient courant avec la publication depuis l'accueil (5 octobre 2026) :
-- on y note surtout les films que d'autres ont proposés. Le serveur fait donc la
-- bascule lui-même, après l'insertion du verdict.
--
-- Garde : la personne doit être membre active de l'espace. La policy d'écriture
-- de `movie_ratings` ne vérifie que `profile_id = auth.uid()` ; sans cette garde,
-- connaître l'identifiant d'un film suffirait à le basculer dans un espace dont
-- on ne fait pas partie.

create or replace function private.on_rating_marks_watched()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.shared_movies s
     set status = 'watched',
         date_watched = coalesce(s.date_watched, now()),
         updated_at = now()
   where s.id = new.movie_id
     and s.status = 'watchlist'
     and exists (
       select 1 from public.space_members m
        where m.space_id = s.space_id and m.profile_id = new.profile_id and m.is_active
     );
  return new;
end;
$$;

revoke all on function private.on_rating_marks_watched() from public;

drop trigger if exists movie_ratings_marks_watched on public.movie_ratings;
create trigger movie_ratings_marks_watched
  after insert on public.movie_ratings
  for each row execute function private.on_rating_marks_watched();
