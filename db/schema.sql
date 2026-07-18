-- ============================================================================
-- Vaani — database schema (Supabase / Postgres)
-- Run this in the Supabase SQL Editor (New query → paste → Run).
-- Multi-tenant: every row is scoped by business_id.
-- ============================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Businesses (tenants)
-- ---------------------------------------------------------------------------
create table if not exists businesses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text,                                  -- clinic | salon | restaurant | repair | ...
  timezone    text not null default 'Asia/Kolkata',
  owner_email text,
  greeting    text,                                  -- custom opening line the AI says
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Business hours (one row per weekday)
-- ---------------------------------------------------------------------------
create table if not exists business_hours (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  day_of_week int  not null check (day_of_week between 0 and 6),  -- 0 = Sunday
  open_time   time,
  close_time  time,
  is_closed   boolean not null default false
);

-- ---------------------------------------------------------------------------
-- Services offered (used by check_availability / book_appointment)
-- ---------------------------------------------------------------------------
create table if not exists services (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references businesses(id) on delete cascade,
  name             text not null,
  duration_minutes int  not null default 30,
  price            numeric(10,2),
  active           boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Phone numbers (maps an inbound Twilio number → a business)
-- ---------------------------------------------------------------------------
create table if not exists phone_numbers (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  e164        text not null unique,                  -- e.g. +14155550123
  label       text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Calls (one row per inbound call)
-- ---------------------------------------------------------------------------
create table if not exists calls (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid references businesses(id) on delete set null,
  twilio_call_sid  text unique,
  from_number      text,
  to_number        text,
  status           text not null default 'in_progress', -- in_progress | completed | failed
  outcome          text,                                 -- booked | lead | message | no_action
  language         text,                                 -- detected: en | hi | hinglish
  sentiment        text,                                 -- positive | neutral | negative
  summary          text,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  duration_seconds int
);

-- ---------------------------------------------------------------------------
-- Transcripts (turn-by-turn, ordered by seq)
-- ---------------------------------------------------------------------------
create table if not exists transcripts (
  id          uuid primary key default gen_random_uuid(),
  call_id     uuid not null references calls(id) on delete cascade,
  business_id uuid references businesses(id) on delete set null, -- denormalized for filtering
  role        text not null,                          -- caller | assistant
  content     text not null,
  seq         int  not null default 0,
  ts          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Appointments (created by the book_appointment tool)
-- ---------------------------------------------------------------------------
create table if not exists appointments (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  call_id           uuid references calls(id) on delete set null,
  customer_name     text,
  customer_phone    text,
  service           text,
  scheduled_for     timestamptz not null,
  status            text not null default 'confirmed', -- confirmed | cancelled
  confirmation_code text,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Leads (created by the capture_lead tool when no booking happens)
-- ---------------------------------------------------------------------------
create table if not exists leads (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  call_id     uuid references calls(id) on delete set null,
  name        text,
  phone       text,
  reason      text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_calls_business      on calls(business_id, started_at desc);
create index if not exists idx_transcripts_call    on transcripts(call_id, seq);
create index if not exists idx_appts_business       on appointments(business_id, scheduled_for desc);
create index if not exists idx_leads_business       on leads(business_id, created_at desc);
create index if not exists idx_phone_numbers_e164   on phone_numbers(e164);

-- ---------------------------------------------------------------------------
-- Realtime: let the dashboard subscribe to live changes
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table calls;
alter publication supabase_realtime add table transcripts;
alter publication supabase_realtime add table appointments;
alter publication supabase_realtime add table leads;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- The telephony service connects with the SERVICE ROLE key, which BYPASSES RLS.
-- The dashboard uses the ANON key, so it needs read policies.
--
-- ⚠️ DEV ONLY: the policies below allow public read. They are intentionally open
-- so the dashboard works before auth lands. Phase 6 replaces these with
-- per-business policies scoped to the logged-in owner.
-- ---------------------------------------------------------------------------
alter table businesses     enable row level security;
alter table business_hours enable row level security;
alter table services       enable row level security;
alter table phone_numbers  enable row level security;
alter table calls          enable row level security;
alter table transcripts    enable row level security;
alter table appointments   enable row level security;
alter table leads          enable row level security;

do $$
declare t text;
begin
  foreach t in array array['businesses','business_hours','services','phone_numbers',
                           'calls','transcripts','appointments','leads']
  loop
    execute format('drop policy if exists dev_read on %I;', t);
    execute format('create policy dev_read on %I for select using (true);', t);
  end loop;
end $$;
