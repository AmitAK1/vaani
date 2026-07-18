import { supabase } from './supabase';

export interface Business {
  id: string;
  name: string;
  greeting: string | null;
}

/**
 * Which tenant owns the number the caller dialled?
 * `phone_numbers.e164` → `businesses`. Returns null for an unmapped number.
 */
export async function resolveBusinessByNumber(e164: string): Promise<Business | null> {
  const { data, error } = await supabase
    .from('phone_numbers')
    .select('businesses(id, name, greeting)')
    .eq('e164', e164)
    .maybeSingle();

  if (error || !data) return null;
  return (data.businesses as unknown as Business) ?? null;
}

/** The browser widget names a tenant explicitly. */
export async function resolveBusinessById(id: string): Promise<Business | null> {
  const { data } = await supabase
    .from('businesses')
    .select('id, name, greeting')
    .eq('id', id)
    .maybeSingle();
  return data ?? null;
}

/** Fallback so the browser widget works on a bare page with no tenant chosen. */
export async function firstBusiness(): Promise<Business | null> {
  const { data } = await supabase
    .from('businesses')
    .select('id, name, greeting')
    .order('created_at')
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function createCall(params: {
  businessId: string | null;
  callSid: string;
  from: string;
  to: string;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from('calls')
    .insert({
      business_id: params.businessId,
      twilio_call_sid: params.callSid,
      from_number: params.from,
      to_number: params.to,
      status: 'in_progress',
    })
    .select('id')
    .single();

  if (error) return null;
  return data.id;
}

export async function saveTranscript(params: {
  callId: string;
  businessId: string | null;
  role: 'caller' | 'assistant';
  content: string;
  seq: number;
  /** Assistant turns only — feeds the dashboard's live latency panel. */
  ttfaMs?: number | null;
  llmMs?: number | null;
  totalMs?: number | null;
  bargedIn?: boolean;
  toolsUsed?: string[];
}): Promise<void> {
  await supabase.from('transcripts').insert({
    call_id: params.callId,
    business_id: params.businessId,
    role: params.role,
    content: params.content,
    seq: params.seq,
    ttfa_ms: params.ttfaMs ?? null,
    llm_ms: params.llmMs ?? null,
    total_ms: params.totalMs ?? null,
    barged_in: params.bargedIn ?? false,
    tools_used: params.toolsUsed?.length ? params.toolsUsed : null,
  });
}

/**
 * What did this call actually achieve? Derived from the tools the model used, so
 * the dashboard can show "booked" vs "lead" vs "no action" without an extra LLM call.
 */
export async function setCallOutcome(callId: string, outcome: string): Promise<void> {
  await supabase.from('calls').update({ outcome }).eq('id', callId);
}

export async function endCall(callId: string, startedAt: number): Promise<void> {
  await supabase
    .from('calls')
    .update({
      status: 'completed',
      ended_at: new Date().toISOString(),
      duration_seconds: Math.round((Date.now() - startedAt) / 1000),
    })
    .eq('id', callId);
}
