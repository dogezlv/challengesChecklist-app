-- ============================================================
-- 33_tracker_activity_logs.sql
--   Registro de acciones del tracker (4 supervisores) + Realtime
-- ============================================================

create table if not exists public.tracker_activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  actor_name text not null,
  section text not null,
  action_code text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tracker_activity_logs_created_at_idx
  on public.tracker_activity_logs (created_at desc);

create index if not exists tracker_activity_logs_section_idx
  on public.tracker_activity_logs (section, created_at desc);

alter table public.tracker_activity_logs enable row level security;

drop policy if exists "Authenticated read tracker logs" on public.tracker_activity_logs;
create policy "Authenticated read tracker logs"
  on public.tracker_activity_logs for select to authenticated
  using (true);

drop policy if exists "Authenticated insert own tracker logs" on public.tracker_activity_logs;
create policy "Authenticated insert own tracker logs"
  on public.tracker_activity_logs for insert to authenticated
  with check (user_id = auth.uid());

grant select, insert on public.tracker_activity_logs to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.tracker_activity_logs;
exception
  when duplicate_object then null;
end $$;

create or replace function public.log_tracker_activity(
  p_section text,
  p_action_code text default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select split_part(u.email, '@', 1) into v_name
  from auth.users u
  where u.id = v_uid;

  if coalesce(v_name, '') = '' then
    v_name := 'supervisor';
  end if;

  insert into tracker_activity_logs (user_id, actor_name, section, action_code, payload)
  values (v_uid, v_name, p_section, p_action_code, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$fn$;

grant execute on function public.log_tracker_activity(text, text, jsonb) to authenticated;
