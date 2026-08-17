-- Un test push est autorisé depuis l'app uniquement pour le propriétaire de
-- l'appareil. Cette date permet de le limiter à un essai par minute/appareil.
alter table public.push_subscriptions
  add column if not exists last_test_at timestamptz;
