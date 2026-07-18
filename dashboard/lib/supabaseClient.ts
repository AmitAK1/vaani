import { createClient } from '@supabase/supabase-js';

/**
 * Browser/client Supabase client using the public ANON key.
 * Safe to expose — RLS policies govern what it can read.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true },
});
