-- Plusieurs cinémas favoris (5 au plus, dans l'ordre choisi).
--
-- `favorite_cinema` reste en place : les anciens builds (dont l'app Play Store)
-- et les anciens backups le lisent et l'écrivent encore. Les nouveaux clients
-- écrivent les deux colonnes, `favorite_cinema` = le premier de la liste.
--
-- Rejouable : chaque instruction vérifie ce qui existe déjà.

alter table public.profiles add column if not exists favorite_cinemas jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_favorite_cinemas_check'
  ) then
    alter table public.profiles
      add constraint profiles_favorite_cinemas_check
      check (
        favorite_cinemas is null or
        case when jsonb_typeof(favorite_cinemas) = 'array'
          then jsonb_array_length(favorite_cinemas) <= 5
          else false
        end
      );
  end if;
end $$;

comment on column public.profiles.favorite_cinemas is
  'Cinémas favoris du profil, dans l''ordre ([{id, name, city}], 5 au plus). Le premier est recopié dans favorite_cinema.';

update public.profiles
set favorite_cinemas = jsonb_build_array(favorite_cinema)
where favorite_cinema is not null and favorite_cinemas is null;

-- Un ancien client ne connaît que `favorite_cinema`. Quand il le change sans
-- toucher à la liste, on répercute ce changement en tête de liste, sinon le
-- nouveau client (qui lit la liste en priorité) afficherait l'ancien cinéma.
create or replace function public.sync_favorite_cinemas_from_legacy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  rest jsonb;
begin
  if new.favorite_cinema is not distinct from old.favorite_cinema then
    return new;
  end if;
  if new.favorite_cinemas is distinct from old.favorite_cinemas then
    return new; -- nouveau client : il a écrit les deux colonnes lui-même
  end if;

  -- La liste sans son ancien premier élément ni le nouveau cinéma.
  select coalesce(jsonb_agg(item order by ord), '[]'::jsonb)
  into rest
  from jsonb_array_elements(coalesce(old.favorite_cinemas, '[]'::jsonb)) with ordinality as e(item, ord)
  where ord > 1
    and (new.favorite_cinema is null or item->>'id' is distinct from new.favorite_cinema->>'id');

  if new.favorite_cinema is null then
    new.favorite_cinemas := case when jsonb_array_length(rest) = 0 then null else rest end;
  else
    select coalesce(jsonb_agg(item order by ord), '[]'::jsonb)
    into new.favorite_cinemas
    from jsonb_array_elements(jsonb_build_array(new.favorite_cinema) || rest) with ordinality as e(item, ord)
    where ord <= 5;
  end if;
  return new;
end $$;

drop trigger if exists profiles_sync_favorite_cinemas on public.profiles;
create trigger profiles_sync_favorite_cinemas
  before update of favorite_cinema on public.profiles
  for each row execute function public.sync_favorite_cinemas_from_legacy();
