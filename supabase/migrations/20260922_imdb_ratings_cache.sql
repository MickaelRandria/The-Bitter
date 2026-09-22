-- Notes IMDb via OMDb : un cache partagé par tous les utilisateurs.
--
-- La clé OMDb gratuite plafonne à 1 000 requêtes par jour POUR TOUTE L'APP, pas
-- par personne. Un cache par navigateur ne protège donc rien : deux personnes
-- qui ouvrent le même film coûteraient deux requêtes. Ici, une œuvre coûte une
-- requête par semaine, quel que soit le nombre de gens qui l'affichent.
--
-- Seule l'Edge Function `imdb-ratings` écrit (clé service) ; tout le monde lit,
-- la note publique d'un film n'ayant rien de personnel.

create table if not exists public.imdb_ratings (
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  imdb_id text,
  -- Nul quand IMDb n'a pas (encore) de note : film confidentiel, pas encore sorti.
  rating numeric(3, 1),
  votes integer,
  -- Nul tant qu'OMDb n'a jamais été interrogé : l'identifiant IMDb peut être
  -- connu (résolu via TMDB) sans que la note ait été demandée.
  fetched_at timestamptz,
  primary key (media_type, tmdb_id)
);

alter table public.imdb_ratings enable row level security;

drop policy if exists "Notes IMDb lisibles par tous" on public.imdb_ratings;
create policy "Notes IMDb lisibles par tous"
  on public.imdb_ratings for select
  to anon, authenticated
  using (true);

-- Aucune politique d'écriture : seul le rôle service, qui contourne la RLS, écrit.
grant select on public.imdb_ratings to anon, authenticated;
revoke insert, update, delete, truncate on public.imdb_ratings from anon, authenticated;

-- Compteur du quota OMDb, par jour UTC. Invisible des clients.
create table if not exists public.omdb_usage (
  day date primary key,
  calls integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.omdb_usage enable row level security;
revoke all on public.omdb_usage from anon, authenticated;

-- Réserve UNE requête OMDb si le plafond du jour n'est pas atteint.
--
-- L'incrément et le test tiennent dans le même INSERT … ON CONFLICT : deux
-- appels simultanés ne peuvent pas franchir le plafond ensemble. Quand la
-- clause WHERE refuse la mise à jour, RETURNING ne rend rien : refus.
create or replace function public.consume_omdb_quota(p_limit integer)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_calls integer;
begin
  if p_limit is null or p_limit <= 0 then
    return false;
  end if;

  insert into public.omdb_usage as u (day, calls, updated_at)
  values ((now() at time zone 'utc')::date, 1, now())
  on conflict (day)
  do update set calls = u.calls + 1, updated_at = now()
  where u.calls < p_limit
  returning u.calls into v_calls;

  return v_calls is not null;
end;
$$;

revoke execute on function public.consume_omdb_quota(integer) from public, anon, authenticated;
grant execute on function public.consume_omdb_quota(integer) to service_role;
