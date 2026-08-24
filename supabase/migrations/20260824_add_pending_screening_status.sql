-- Séances « en attente de confirmation ».
--
-- Toucher un horaire sur la fiche film ouvre la billetterie UGC dans un onglet,
-- mais The Bitter n'a aucun moyen de savoir si la réservation a été menée à son
-- terme. La séance est donc créée avec le statut `pending` : elle apparaît dans
-- le calendrier, elle se confirme d'un geste, et **elle ne programme aucun rappel**.
--
-- Le point critique est là : prévenir quelqu'un d'une séance qu'il n'a peut-être
-- jamais réservée est exactement le défaut que ce statut existe pour éviter.
--
-- Rien à changer dans `sync_screening_reminders()` ni dans
-- `claim_due_notification_deliveries()` : les deux raisonnent déjà en
-- « `scheduled` ou rien », et le second refuse même de servir un rappel dont la
-- séance n'est plus `scheduled`. `pending` hérite donc du bon comportement, et
-- la confirmation (`pending` → `scheduled`) rejoue le trigger AFTER UPDATE OF
-- status, qui crée alors les rappels. La vérification est en fin de fichier.

-- La contrainte d'origine était déclarée en ligne dans `create table` : son nom
-- est celui que Postgres a choisi. On la retrouve par sa définition plutôt que
-- de parier dessus — se tromper de nom laisserait l'ancienne contrainte en
-- place et « pending » resterait rejeté, sans que rien ne le signale.
do $$
declare
  v_name text;
begin
  for v_name in
    select conname
      from pg_constraint
      where conrelid = 'public.cinema_screenings'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%status%scheduled%'
  loop
    execute format('alter table public.cinema_screenings drop constraint %I', v_name);
  end loop;
end;
$$;

alter table public.cinema_screenings
  add constraint cinema_screenings_status_check
  check (status in ('pending', 'scheduled', 'cancelled', 'completed'));

-- Le calendrier lit les séances à venir par profil ; les « à confirmer » sont
-- relues à part pour l'encart de confirmation. Index partiel, donc minuscule.
create index if not exists cinema_screenings_pending_idx
  on public.cinema_screenings (profile_id, starts_at)
  where status = 'pending';

/**
 * Nettoyage des séances jamais confirmées.
 *
 * On supprime celles dont l'horaire est passé depuis plus de deux heures : à ce
 * moment-là, l'intention est morte pour de bon et la ligne n'encombre plus que
 * le calendrier. Une règle fondée sur l'âge de la création (« 48 h après le
 * clic ») effacerait au contraire une séance encore à venir que la personne
 * comptait confirmer plus tard — le cas d'une réservation prise une semaine à
 * l'avance. Aucun rappel n'a jamais été créé pour ces lignes, la suppression
 * n'a donc rien à annuler.
 */
create or replace function public.purge_stale_pending_screenings()
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  removed integer;
begin
  delete from public.cinema_screenings
    where status = 'pending'
      and starts_at < now() - interval '2 hours';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_stale_pending_screenings() from public;

-- Rejouer la migration ne doit pas échouer sur un job déjà planifié.
do $$
begin
  perform cron.unschedule('bitter-purge-pending-screenings');
exception
  when others then null;
end;
$$;

select cron.schedule(
  'bitter-purge-pending-screenings',
  '17 4 * * *',
  $cron$ select public.purge_stale_pending_screenings(); $cron$
);

comment on function public.purge_stale_pending_screenings() is
  'Supprime les séances « en attente » dont l horaire est passé : elles n ont jamais été confirmées.';

-- Vérification : une séance `pending` ne doit produire aucun rappel, et sa
-- confirmation doit en produire. Le bloc échoue la migration si ce n est pas le cas.
do $$
declare
  v_profile uuid;
  v_screening uuid;
  v_count integer;
begin
  select id into v_profile from public.profiles limit 1;
  if v_profile is null then
    raise notice 'Aucun profil : vérification du trigger ignorée.';
    return;
  end if;

  insert into public.cinema_screenings (profile_id, title, starts_at, status, reminder_offsets_minutes)
    values (v_profile, '__verification_trigger__', now() + interval '5 days', 'pending', array[2880, 30])
    returning id into v_screening;

  select count(*) into v_count from public.notification_deliveries where screening_id = v_screening;
  if v_count <> 0 then
    raise exception 'Une séance en attente a programmé % rappel(s) : le trigger laisse passer pending.', v_count;
  end if;

  update public.cinema_screenings set status = 'scheduled' where id = v_screening;

  select count(*) into v_count from public.notification_deliveries where screening_id = v_screening;
  if v_count <> 2 then
    raise exception 'La confirmation aurait dû programmer 2 rappels, elle en a programmé %.', v_count;
  end if;

  delete from public.cinema_screenings where id = v_screening;
  raise notice 'Trigger vérifié : aucun rappel en attente, 2 rappels à la confirmation.';
end;
$$;
