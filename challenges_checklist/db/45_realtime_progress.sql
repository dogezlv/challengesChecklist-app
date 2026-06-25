-- Realtime para progreso auxiliar (chips multi-opción / ubicaciones distintas).
-- challenges suele estar ya en la publicación; idempotente si ya existe.

do $$
begin
  alter publication supabase_realtime add table public.challenges;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.match_rule_progress;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.challenge_distinct_progress;
exception
  when duplicate_object then null;
end $$;
