-- Purge du contenu des films supprimés, trente jours après le geste.
--
-- Supprimer un film ne retire pas sa ligne : `deleted_at` est posé pour que la
-- suppression se propage aux autres appareils (getDeletedWorkKeys) et reste
-- annulable. Mais l'avis écrit, les notes et le contexte de visionnage
-- restaient stockés indéfiniment, alors que l'utilisateur croit les avoir
-- effacés. C'est ce que promet la fiche Play Store : pouvoir faire supprimer
-- une partie de ses données sans supprimer son compte.
--
-- On garde donc la seule chose nécessaire à la synchronisation — la clé de
-- l'œuvre (media_type, tmdb_id, season_number) et la date — et on vide tout ce
-- que la personne a écrit ou noté. Trente jours laissent le temps de se raviser :
-- `restoreDeletedMovie` reste utilisable pendant tout ce délai.
--
-- `title`, `director`, `year` et `genre` sont NOT NULL et viennent du catalogue
-- TMDB, pas de l'utilisateur : ils sont ramenés à une valeur neutre plutôt que
-- laissés tels quels.

create or replace function private.purge_deleted_movie_content()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_count integer;
begin
  with purgees as (
    update public.user_movies set
      title = '(supprimé)',
      director = '',
      genre = '',
      poster_url = null,
      actors = null,
      actor_ids = null,
      director_id = null,
      release_date = null,
      runtime = null,
      review = null,
      comment = null,
      story = null,
      visuals = null,
      acting = null,
      sound = null,
      vibe_story = null,
      vibe_emotion = null,
      vibe_fun = null,
      vibe_visual = null,
      vibe_tension = null,
      adaptive_rating = null,
      watches = null,
      tv_progress = null,
      smartphone_factor = null,
      hype = null,
      severity_index = null,
      patience_level = null,
      date_watched = null,
      rated_at = null,
      theme = null,
      tags = null,
      series_title = null,
      number_of_seasons = null,
      production_status = null,
      tmdb_rating = null,
      shared_to_feed = false,
      updated_at = now()
    where deleted_at is not null
      and deleted_at < now() - interval '30 days'
      -- Déjà purgée : ne pas la réécrire à chaque passage.
      and title <> '(supprimé)'
    returning 1
  )
  select count(*) into v_count from purgees;

  return v_count;
end;
$$;

revoke execute on function private.purge_deleted_movie_content() from public, anon, authenticated;
