-- Blind test BO d'un espace : on écoute un extrait de la bande originale d'un
-- film de l'espace et on devine lequel. Une ligne par partie terminée ; le
-- classement de l'espace garde la meilleure partie de chacun.
--
-- Le score n'est pas vérifié côté serveur : c'est un jeu entre amis, et tricher
-- ne rapporte rien d'autre qu'une ligne dans le classement de ses amis.

create table if not exists public.blind_test_scores (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.shared_spaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  score smallint not null check (score >= 0),
  total smallint not null check (total between 1 and 20),
  -- Temps de réponse cumulé : départage deux scores égaux.
  duration_ms integer not null check (duration_ms >= 0),
  created_at timestamptz not null default now(),
  check (score <= total)
);

create index if not exists blind_test_scores_space_idx on public.blind_test_scores (space_id, score desc, duration_ms);

alter table public.blind_test_scores enable row level security;

drop policy if exists "blind test: members read" on public.blind_test_scores;
create policy "blind test: members read" on public.blind_test_scores
  for select to authenticated
  using (public.is_member_of_space(space_id));

drop policy if exists "blind test: own insert" on public.blind_test_scores;
create policy "blind test: own insert" on public.blind_test_scores
  for insert to authenticated
  with check (profile_id = (select auth.uid()) and public.is_member_of_space(space_id));

grant select, insert on public.blind_test_scores to authenticated;
