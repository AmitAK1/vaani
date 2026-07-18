'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

/**
 * Live views of the call data.
 *
 * Everything here is driven by Supabase Realtime, so a booking made on the phone shows
 * up on the dashboard mid-call without a refresh — which is the whole demo.
 */

export interface Call {
  id: string;
  from_number: string | null;
  to_number: string | null;
  status: string;
  outcome: string | null;
  duration_seconds: number | null;
  started_at: string;
}

export interface Transcript {
  id: string;
  call_id: string;
  role: 'caller' | 'assistant';
  content: string;
  seq: number;
  ttfa_ms: number | null;
  llm_ms: number | null;
  total_ms: number | null;
  barged_in: boolean;
  tools_used: string[] | null;
}

export interface Appointment {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  service: string | null;
  scheduled_for: string;
  confirmation_code: string | null;
  sms_status: string | null;
}

export interface Lead {
  id: string;
  name: string | null;
  phone: string | null;
  reason: string | null;
  created_at: string;
}

/**
 * Subscribe to a table: fetch what's there, then keep it current.
 *
 * New rows are PREPENDED rather than refetched — a refetch on every insert would make
 * the whole page flicker during a live call, which is exactly when someone is watching.
 */
function useTable<T extends { id: string }>(
  table: string,
  orderBy: string,
  limit = 50,
): T[] {
  const [rows, setRows] = useState<T[]>([]);

  useEffect(() => {
    let alive = true;

    void supabase
      .from(table)
      .select('*')
      .order(orderBy, { ascending: false })
      .limit(limit)
      .then(({ data }) => {
        if (alive && data) setRows(data as T[]);
      });

    const channel = supabase
      .channel(`live:${table}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table },
        (payload) => setRows((prev) => [payload.new as T, ...prev].slice(0, limit)),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table },
        (payload) =>
          setRows((prev) =>
            prev.map((r) => (r.id === (payload.new as T).id ? (payload.new as T) : r)),
          ),
      )
      .subscribe();

    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, [table, orderBy, limit]);

  return rows;
}

export const useCalls = () => useTable<Call>('calls', 'started_at');
export const useAppointments = () => useTable<Appointment>('appointments', 'created_at');
export const useLeads = () => useTable<Lead>('leads', 'created_at');

/** Transcripts stay in speaking order, oldest first — it's a conversation. */
export function useTranscripts(): Transcript[] {
  const rows = useTable<Transcript>('transcripts', 'ts', 200);
  return [...rows].reverse();
}
