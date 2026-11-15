-- Mes cinémas, ville entière : jusqu'à 15 salles au lieu de 5.
--
-- L'annuaire UGC regroupe ses salles par agglomération (Bordeaux : 3, Paris : 11,
-- Région parisienne : 15). « Tous les UGC de Bordeaux » doit tenir d'un coup.

alter table public.profiles drop constraint if exists profiles_favorite_cinemas_check;
alter table public.profiles add constraint profiles_favorite_cinemas_check check (
  favorite_cinemas is null
  or case
    when jsonb_typeof(favorite_cinemas) = 'array'
      then jsonb_array_length(favorite_cinemas) <= 15
    else false
  end
);

comment on column public.profiles.favorite_cinemas is
  'Cinémas favoris du profil, dans l''ordre ([{id, name, city}], 15 au plus). Le premier est recopié dans favorite_cinema.';

-- Un ancien client qui n'écrit que favorite_cinema garde la même limite.
create or replace function public.sync_favorite_cinemas_from_legacy()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
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
    where ord <= 15;
  end if;
  return new;
end $function$;
