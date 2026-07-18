-- ============================================================================
-- Vaani — Milestone B: barge-in, booking tools, latency metrics
-- Run in the Supabase SQL Editor AFTER schema.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Per-turn latency, recorded on the assistant's transcript rows.
-- This is what the dashboard's live latency panel reads.
--   ttfa_ms  = caller stopped talking → first audio byte sent back (the number
--              that actually decides whether the call feels human)
--   llm_ms   = time to the first token from Groq
--   total_ms = caller stopped talking → last audio byte sent
-- ---------------------------------------------------------------------------
alter table transcripts add column if not exists ttfa_ms  int;
alter table transcripts add column if not exists llm_ms   int;
alter table transcripts add column if not exists total_ms int;

-- Was this assistant turn cut off by the caller talking over it?
alter table transcripts add column if not exists barged_in boolean not null default false;

-- Which tools the model called on this turn, e.g. {check_availability,book_appointment}
alter table transcripts add column if not exists tools_used text[];

-- ---------------------------------------------------------------------------
-- Appointments: remember whether the SMS confirmation actually went out.
-- (Twilio trial can only text VERIFIED numbers, so this will legitimately be
-- 'failed' for unverified callers — we want that visible, not swallowed.)
-- ---------------------------------------------------------------------------
alter table appointments add column if not exists sms_status text;  -- sent | failed | skipped
