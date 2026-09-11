-- Le compteur d'appels à l'assistant, enfin versionné.
--
-- `ai_usage` et `consume_ai_quota` n'avaient jamais existé ailleurs que dans la
-- base de production, créés à la main dans l'éditeur SQL. Rien dans le dépôt ne
-- permettait de les reconstruire. Or la fonction Edge est **fermée par défaut** :
-- compteur en panne ou absent, elle refuse tout. Une restauration de base, un
-- environnement de recette, un projet neuf — et l'assistant est mort à 100 %,
-- sans que rien dans le code n'explique pourquoi.
--
-- Ce fichier n'est pas une reconstitution de mémoire : la table, la fonction et
-- les droits ci-dessous ont été **relevés sur la production** avant d'être
-- écrits, et recopiés à l'identique. La première version de ce fichier
-- nommait la colonne `used` ; la production l'appelle `calls`, et
-- `refund_ai_quota` aurait échoué à chaque appel. Relever avant d'écrire est
-- ce qui a évité de remplacer une panne par une autre.
--
-- La date n'est pas celle de l'écriture : elle place ce fichier AVANT
-- `20260817_rls_initplan_and_fk_indexes.sql`, qui pose une policy sur
-- `public.ai_usage` et échouait donc sur toute base neuve, faute de table à
-- laquelle l'attacher.
--
-- Sur la production, où tout existe déjà, ce fichier ne modifie rien : la table
-- et `consume_ai_quota` ne sont créées que si elles manquent. La seule addition
-- réelle est `refund_ai_quota`, que la fonction Edge appelle désormais.

-- ── La table ────────────────────────────────────────────────────────────────
-- Une ligne par personne et par jour. La journée est celle d'UTC : le plafond
-- doit basculer au même instant pour tout le monde, sans quoi un déplacement de
-- fuseau offrirait un second quota.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  calls integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;

-- Chacun voit sa propre consommation, personne n'écrit : seul `service_role`
-- touche à ce compteur, à travers les deux fonctions ci-dessous.
drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own" on public.ai_usage
  for select to public
  using ((select auth.uid()) = user_id);

-- ── Prélever ────────────────────────────────────────────────────────────────
-- Créée seulement si elle manque. La production en possède une version qui
-- tourne ; la remplacer pour la seule beauté du dépôt reviendrait à risquer la
-- panne que ce fichier est censé rendre impossible.
--
-- Le corps ci-dessous est celui de la production, au mot près. L'incrément et
-- la lecture tiennent dans une seule instruction, donc une rafale d'appels
-- simultanés ne peut pas se glisser entre les deux. Noter que le compteur monte
-- même au-delà du plafond : c'est le `<=` qui refuse, pas l'écriture. Un
-- utilisateur qui insiste continue donc d'incrémenter — sans effet, mais le
-- chiffre stocké peut dépasser la limite, et c'est voulu par la version en place.
do $$
begin
  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'consume_ai_quota'
  ) then
    execute $fn$
      create function public.consume_ai_quota(p_user uuid, p_limit integer)
      returns table (allowed boolean, used integer, quota integer)
      language plpgsql
      security definer
      set search_path to 'public'
      as $body$
      declare
        v_calls integer;
      begin
        if p_user is null then
          return query select false, 0, p_limit;
          return;
        end if;

        insert into public.ai_usage as u (user_id, day, calls, updated_at)
        values (p_user, (now() at time zone 'utc')::date, 1, now())
        on conflict (user_id, day)
        do update set calls = u.calls + 1, updated_at = now()
        returning u.calls into v_calls;

        return query select v_calls <= p_limit, v_calls, p_limit;
      end;
      $body$;
    $fn$;

    -- Jamais une API : seule la fonction Edge l'appelle, avec `service_role`.
    execute 'revoke all on function public.consume_ai_quota(uuid, integer)'
         || ' from public, anon, authenticated';
    execute 'grant execute on function public.consume_ai_quota(uuid, integer)'
         || ' to service_role';
  end if;
end
$$;

-- ── Rendre ──────────────────────────────────────────────────────────────────
-- Le quota est prélevé avant l'appel au modèle, pour que le prélèvement reste
-- atomique. Le revers s'est vu en production le 8 septembre 2026 : pendant la
-- panne d'amont, chaque échec consommait quand même une question. Les gens
-- payaient un quota pour des réponses qu'ils n'ont jamais eues, et auraient
-- fini par s'entendre dire qu'ils avaient atteint leur plafond — un message
-- faux, qui les aurait envoyés chercher la panne là où elle n'était pas.
--
-- `greatest(..., 0)` parce qu'un compteur négatif n'a aucun sens : au pire deux
-- remboursements se croisent, et le plancher absorbe la course sans verrou.
create or replace function public.refund_ai_quota(p_user uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.ai_usage
     set calls = greatest(calls - 1, 0),
         updated_at = now()
   where user_id = p_user
     and day = (now() at time zone 'utc')::date;
$$;

revoke all on function public.refund_ai_quota(uuid) from public, anon, authenticated;
grant execute on function public.refund_ai_quota(uuid) to service_role;
