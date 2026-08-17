-- Supabase accorde historiquement EXECUTE directement à anon/authenticated sur
-- certaines fonctions, indépendamment du privilège PUBLIC. Ces deux fonctions
-- internes ne sont jamais une API : seule la fonction Edge les appelle avec
-- service_role après vérification du jeton Cron.

revoke all on function public.sync_screening_reminders() from public, anon, authenticated;
revoke all on function public.claim_due_notification_deliveries(integer) from public, anon, authenticated;
