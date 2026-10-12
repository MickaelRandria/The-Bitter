-- Le Fil du jour : les réponses de chacun, les résultats de la communauté.
--
-- Le contenu du Fil (film mystère, questions) se déduit de la date dans l'app :
-- rien à générer ici. Cette table garde seulement ce que chacun a répondu, pour
-- la série de jours, les pourcentages de la question du jour et « tes amis
-- l'ont fait ».
--
-- La personne est liée à auth.users et non à profiles : une table de plus liée
-- à profiles rendrait ambigus les embeds PostgREST existants (PGRST201).

create table if not exists public.daily_fil_answers (
  day date not null,
  profile_id uuid not null references auth.users (id) on delete cascade,
  mystery_tries smallint check (mystery_tries between 1 and 4),
  mystery_found boolean,
  q1 text check (q1 in ('a', 'b')),
  q2 text check (q2 in ('a', 'b')),
  done_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (day, profile_id)
);

alter table public.daily_fil_answers enable row level security;

drop policy if exists "fil: own read" on public.daily_fil_answers;
create policy "fil: own read" on public.daily_fil_answers
  for select to authenticated using (profile_id = (select auth.uid()));

drop policy if exists "fil: own insert" on public.daily_fil_answers;
create policy "fil: own insert" on public.daily_fil_answers
  for insert to authenticated with check (profile_id = (select auth.uid()));

drop policy if exists "fil: own update" on public.daily_fil_answers;
create policy "fil: own update" on public.daily_fil_answers
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

revoke all on public.daily_fil_answers from anon;
grant select, insert, update on public.daily_fil_answers to authenticated;

-- Les résultats d'un jour : la répartition des deux questions sur tous les
-- membres, la part qui a trouvé le film mystère, et ce qu'ont fait les amis
-- (co-membres d'un espace actif, hors blocages). Rien d'individuel n'est rendu
-- pour qui n'est pas un ami.
create or replace function public.daily_fil_results(p_day date)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select case when (select auth.uid()) is null then null else jsonb_build_object(
    'q1', jsonb_build_object(
      'a', (select count(*) from public.daily_fil_answers where day = p_day and q1 = 'a'),
      'b', (select count(*) from public.daily_fil_answers where day = p_day and q1 = 'b')),
    'q2', jsonb_build_object(
      'a', (select count(*) from public.daily_fil_answers where day = p_day and q2 = 'a'),
      'b', (select count(*) from public.daily_fil_answers where day = p_day and q2 = 'b')),
    'players', (select count(*) from public.daily_fil_answers where day = p_day),
    'found', (select count(*) from public.daily_fil_answers where day = p_day and mystery_found),
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', coalesce(nullif(btrim(p.first_name), ''), 'Membre'),
        'avatar', p.avatar_url,
        'q1', a.q1, 'q2', a.q2,
        'tries', a.mystery_tries, 'found', a.mystery_found,
        'done', a.done_at is not null
      ) order by a.done_at nulls last)
      from public.daily_fil_answers a
      join public.profiles p on p.id = a.profile_id
      where a.day = p_day
        and a.profile_id <> (select auth.uid())
        and private.are_co_members((select auth.uid()), a.profile_id)
        and private.not_blocked((select auth.uid()), a.profile_id)
    ), '[]'::jsonb)
  ) end;
$$;

revoke all on function public.daily_fil_results(date) from public, anon;
grant execute on function public.daily_fil_results(date) to authenticated;
