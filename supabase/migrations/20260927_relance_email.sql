-- L'e-mail de secours : quand le push n'atteint personne.
--
-- Le 27 septembre, deux vraies invitations « voir avec » attendaient sans avoir
-- été poussées : aucun destinataire n'avait de téléphone abonné. Une invitation
-- que personne ne voit n'existe pas.
--
-- Toutes les heures (de jour), l'Edge Function `email-digest` lit ici les
-- invitations et séances restées sans réponse depuis plus de deux heures, et
-- envoie à chacun UN récapitulatif — au plus un toutes les douze heures. Chaque
-- e-mail porte un lien de désinscription ; le réglage vit aussi dans l'app.

alter table public.profiles add column if not exists email_notifications boolean not null default true;
-- Jeton de désinscription : un lien d'e-mail ne peut pas porter de session.
alter table public.profiles add column if not exists email_token uuid not null default gen_random_uuid();
create unique index if not exists profiles_email_token_idx on public.profiles (email_token);

alter table public.notifications add column if not exists emailed_at timestamptz;
create index if not exists notifications_email_pending_idx
  on public.notifications (recipient_id, created_at)
  where read_at is null and emailed_at is null;

/**
 * Les récapitulatifs à envoyer : une ligne par personne, ses notifications en
 * attente en tableau. Seulement ce qui appelle une réponse d'une personne à une
 * autre — pas les sorties ni le streaming, qui ne valent pas un e-mail.
 */
create or replace function public.pending_email_digests()
returns table (recipient_id uuid, email text, first_name text, email_token uuid, items jsonb)
language sql
stable
security definer
set search_path to ''
as $$
  select p.id, p.email, coalesce(nullif(btrim(p.first_name), ''), ''), p.email_token,
    jsonb_agg(jsonb_build_object(
      'id', n.id, 'kind', n.kind, 'title', n.title, 'poster_url', n.poster_url,
      'actor', coalesce(nullif(btrim(a.first_name), ''), null), 'guest_name', n.guest_name,
      'rating', n.rating, 'payload', n.payload, 'created_at', n.created_at
    ) order by n.created_at desc)
  from public.notifications n
  join public.profiles p on p.id = n.recipient_id
  left join public.profiles a on a.id = n.actor_id
  where n.read_at is null and n.emailed_at is null
    and n.kind in ('watch_invite', 'verdict_request', 'plan_proposed', 'plan_agreed', 'plan_cancelled', 'link_answered')
    and n.created_at < now() - interval '2 hours'
    and n.created_at > now() - interval '3 days'
    and p.email_notifications
    and p.email is not null and p.email like '%_@_%'
    -- Au plus un e-mail toutes les douze heures par personne.
    and not exists (
      select 1 from public.notifications prev
      where prev.recipient_id = p.id and prev.emailed_at > now() - interval '12 hours'
    )
  group by p.id, p.email, p.first_name, p.email_token
  limit 200;
$$;

/** Marque des notifications comme parties par e-mail. */
create or replace function public.mark_emailed(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_rows integer;
begin
  update public.notifications set emailed_at = now() where id = any (p_ids) and emailed_at is null;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

/** Désinscription depuis le lien d'un e-mail, sans session. Rend le prénom, ou null. */
create or replace function public.unsubscribe_email(p_token uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_name text;
begin
  if p_token is null then return null; end if;
  update public.profiles set email_notifications = false
  where email_token = p_token
  returning coalesce(nullif(btrim(first_name), ''), '') into v_name;
  return v_name;
end;
$$;

revoke execute on function public.pending_email_digests() from public, anon, authenticated;
revoke execute on function public.mark_emailed(uuid[]) from public, anon, authenticated;
grant execute on function public.pending_email_digests() to service_role;
grant execute on function public.mark_emailed(uuid[]) to service_role;
revoke execute on function public.unsubscribe_email(uuid) from public;
grant execute on function public.unsubscribe_email(uuid) to anon, authenticated;

-- 7 h à 19 h UTC, au quart : 9 h 15 à 21 h 15 à Paris l'été. Personne n'est
-- réveillé par une invitation de cinéma.
select cron.schedule(
  'bitter-relance-email',
  '15 7-19 * * *',
  $$
    select net.http_post(
      url := 'https://tnvnmsevddvcklkitnpa.supabase.co/functions/v1/email-digest',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'workerToken', (select worker_token from public.push_worker_credentials where singleton)
      )
    );
  $$
);
