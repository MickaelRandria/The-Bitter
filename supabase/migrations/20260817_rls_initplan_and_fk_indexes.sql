-- Hygiène de base : préparer la montée en charge.
--
-- Deux corrections, sans changement de règle d'accès.
--
-- 1. `auth.uid()` appelé nu dans une policy est réévalué POUR CHAQUE LIGNE
--    examinée. Enveloppé dans un sous-select, Postgres le calcule une fois et
--    réutilise le résultat. La condition est strictement la même ; seul le plan
--    d'exécution change. Invisible sur 108 films, déterminant sur 100 000.
--
-- 2. Trois clés étrangères n'avaient pas d'index de couverture. Chaque jointure
--    ou vérification de cascade les parcourait intégralement.
--
-- Les index jamais utilisés signalés par le linter ne sont volontairement pas
-- supprimés : sur des tables de douze lignes, Postgres ne se sert d'aucun index,
-- « jamais utilisé » n'y mesure donc que la taille du jeu de données actuel.

-- ── ai_usage ────────────────────────────────────────────────────────────────
drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own" on public.ai_usage
  for select to public
  using ((select auth.uid()) = user_id);

-- ── movie_ratings ───────────────────────────────────────────────────────────
drop policy if exists "policy_manage_ratings" on public.movie_ratings;
create policy "policy_manage_ratings" on public.movie_ratings
  for all to public
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

-- ── profiles ────────────────────────────────────────────────────────────────
drop policy if exists "allow_insert_own_profile" on public.profiles;
create policy "allow_insert_own_profile" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "policy_update_profiles" on public.profiles;
create policy "policy_update_profiles" on public.profiles
  for update to public
  using ((select auth.uid()) = id);

drop policy if exists "read_own_or_co_member_profile" on public.profiles;
create policy "read_own_or_co_member_profile" on public.profiles
  for select to public
  using ((id = (select auth.uid())) or shares_space_with(id));

-- ── shared_movies ───────────────────────────────────────────────────────────
drop policy if exists "Members can add movies" on public.shared_movies;
create policy "Members can add movies" on public.shared_movies
  for insert to authenticated
  with check (
    ((select auth.uid()) = added_by)
    and exists (
      select 1 from space_members
      where space_members.space_id = shared_movies.space_id
        and space_members.profile_id = (select auth.uid())
    )
  );

drop policy if exists "Members can delete movies they added" on public.shared_movies;
create policy "Members can delete movies they added" on public.shared_movies
  for delete to public
  using (
    (added_by = (select auth.uid()))
    or exists (
      select 1 from space_members
      where space_members.space_id = shared_movies.space_id
        and space_members.profile_id = (select auth.uid())
        and space_members.role = any (array['owner'::text, 'admin'::text])
    )
  );

drop policy if exists "policy_update_movies" on public.shared_movies;
create policy "policy_update_movies" on public.shared_movies
  for update to public
  using (
    (added_by = (select auth.uid()))
    or exists (
      select 1 from space_members
      where space_members.space_id = shared_movies.space_id
        and space_members.profile_id = (select auth.uid())
        and space_members.role = any (array['owner'::text, 'admin'::text])
    )
  );

-- ── shared_spaces ───────────────────────────────────────────────────────────
drop policy if exists "policy_create_spaces" on public.shared_spaces;
create policy "policy_create_spaces" on public.shared_spaces
  for insert to public
  with check ((select auth.uid()) = created_by);

-- ── space_members ───────────────────────────────────────────────────────────
drop policy if exists "owner_or_self_removes_member" on public.space_members;
create policy "owner_or_self_removes_member" on public.space_members
  for delete to public
  using ((profile_id = (select auth.uid())) or is_owner_of_space(space_id));

drop policy if exists "policy_join_spaces" on public.space_members;
create policy "policy_join_spaces" on public.space_members
  for insert to public
  with check ((select auth.uid()) = profile_id);

-- ── space_movie_votes ───────────────────────────────────────────────────────
drop policy if exists "Members can change their own vote" on public.space_movie_votes;
create policy "Members can change their own vote" on public.space_movie_votes
  for update to public
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

drop policy if exists "Members can view votes in their spaces" on public.space_movie_votes;
create policy "Members can view votes in their spaces" on public.space_movie_votes
  for select to public
  using (
    exists (
      select 1
      from shared_movies sm
      join space_members m on m.space_id = sm.space_id
      where sm.id = space_movie_votes.movie_id
        and m.profile_id = (select auth.uid())
    )
  );

drop policy if exists "Members can vote on movies in their spaces" on public.space_movie_votes;
create policy "Members can vote on movies in their spaces" on public.space_movie_votes
  for insert to public
  with check (
    (profile_id = (select auth.uid()))
    and exists (
      select 1
      from shared_movies sm
      join space_members m on m.space_id = sm.space_id
      where sm.id = space_movie_votes.movie_id
        and m.profile_id = (select auth.uid())
    )
  );

drop policy if exists "Users can delete their own votes" on public.space_movie_votes;
create policy "Users can delete their own votes" on public.space_movie_votes
  for delete to public
  using (profile_id = (select auth.uid()));

-- ── user_movies ─────────────────────────────────────────────────────────────
drop policy if exists "Space members can view each other movies" on public.user_movies;
create policy "Space members can view each other movies" on public.user_movies
  for select to public
  using (
    exists (
      select 1
      from space_members sm1
      join space_members sm2 on sm1.space_id = sm2.space_id
      where sm1.profile_id = (select auth.uid())
        and sm2.profile_id = user_movies.profile_id
        and sm1.is_active = true
        and sm2.is_active = true
    )
  );

drop policy if exists "Users can manage their own movies" on public.user_movies;
create policy "Users can manage their own movies" on public.user_movies
  for all to public
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

drop policy if exists "Users can view their own movies" on public.user_movies;
create policy "Users can view their own movies" on public.user_movies
  for select to public
  using ((select auth.uid()) = profile_id);

-- ── Index de couverture des clés étrangères ─────────────────────────────────
create index if not exists idx_notification_deliveries_profile
  on public.notification_deliveries (profile_id);

create index if not exists idx_shared_movies_added_by
  on public.shared_movies (added_by);

create index if not exists idx_shared_spaces_created_by
  on public.shared_spaces (created_by);
