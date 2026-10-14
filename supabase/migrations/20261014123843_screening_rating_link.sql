-- Lier une note à une séance nécessite une confirmation, pas une supposition sur sa date.
alter table public.cinema_screenings
  add column rating_confirmed_at timestamptz;

-- Une séance déplacée ou remplacée doit être confirmée à nouveau.
create function public.reset_screening_rating_link()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  if new.starts_at is distinct from old.starts_at
     or new.tmdb_id is distinct from old.tmdb_id
     or new.title is distinct from old.title then
    new.rating_confirmed_at := null;
  end if;
  return new;
end;
$$;
create trigger reset_screening_rating_link
before update on public.cinema_screenings
for each row execute function public.reset_screening_rating_link();
