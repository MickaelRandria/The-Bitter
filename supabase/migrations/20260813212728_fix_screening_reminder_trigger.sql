-- Les rappels référencent la séance par clé étrangère : ils doivent être
-- créés après l'insertion de la séance, pas dans un trigger BEFORE.
drop trigger if exists sync_screening_reminders_before_write on public.cinema_screenings;

create trigger sync_screening_reminders_after_write
  after insert or update of starts_at, reminder_offsets_minutes, status
  on public.cinema_screenings
  for each row execute function public.sync_screening_reminders();
