import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

/**
 * Server-side Supabase client using the SERVICE ROLE key.
 * This bypasses RLS — only ever use it on the backend, never expose this key.
 */
export const supabase = createClient(
  config.supabase.url || 'http://localhost:54321',
  config.supabase.serviceRoleKey || 'placeholder-service-role-key',
  { auth: { persistSession: false, autoRefreshToken: false } },
);
