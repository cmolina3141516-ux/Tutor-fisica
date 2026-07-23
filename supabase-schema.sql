-- Innova School tutor access control schema
-- Run this file in Supabase SQL Editor before adding SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Render.

create table if not exists public.access_codes (
  code text primary key,
  tutor_prefix text not null,
  student_name text,
  email text,
  grade text,
  expires_at timestamptz,
  is_active boolean not null default true,
  max_sessions_per_day integer not null default 3,
  max_messages_per_day integer not null default 30,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.access_sessions (
  id text primary key,
  code text not null references public.access_codes(code) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  is_active boolean not null default true
);

create table if not exists public.access_usage (
  code text not null references public.access_codes(code) on delete cascade,
  usage_date date not null default current_date,
  sessions_count integer not null default 0,
  messages_count integer not null default 0,
  primary key (code, usage_date)
);

create index if not exists access_codes_tutor_prefix_idx on public.access_codes(tutor_prefix);
create index if not exists access_sessions_code_active_idx on public.access_sessions(code, is_active);
create index if not exists access_usage_date_idx on public.access_usage(usage_date);

alter table public.access_codes enable row level security;
alter table public.access_sessions enable row level security;
alter table public.access_usage enable row level security;

-- Example code. Replace values before using it with a real student.
-- insert into public.access_codes (
--   code,
--   tutor_prefix,
--   student_name,
--   email,
--   grade,
--   expires_at,
--   max_sessions_per_day,
--   max_messages_per_day
-- ) values (
--   'JULIAN-DEMO-2026-20260723',
--   'JULIAN',
--   'Estudiante Demo',
--   'demo@innova.edu.co',
--   '10',
--   now() + interval '30 days',
--   3,
--   30
-- );
