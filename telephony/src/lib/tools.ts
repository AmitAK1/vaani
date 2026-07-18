import { supabase } from './supabase';
import { sendConfirmationSms } from './sms';
import type { Schedule } from './schedule';

/**
 * The tools Vaani can call mid-conversation. These are the difference between a
 * chatbot that *talks* about booking and an agent that actually books.
 *
 * Reads come from the in-memory Schedule (loaded when the call connects), so the
 * caller never waits on a database round trip. Writes still go to Postgres.
 *
 * Everything is scoped to one business and one call, so a tenant can never read
 * or write another tenant's rows.
 */

export interface ToolContext {
  businessId: string | null;
  businessName: string;
  callId: string | null;
  callerPhone: string;
  schedule: Schedule;
  /** Vaani decided the call is over. The session speaks the farewell, then hangs up. */
  onEndCall?: () => void;
  /**
   * Rehearsal mode: read real availability, but never write an appointment or fire
   * an SMS. Without this, `npm run llmcheck` books real slots and texts a real
   * phone — which it did, once.
   */
  dryRun?: boolean;
}

export const TOOL_SCHEMAS = [
  {
    type: 'function' as const,
    function: {
      name: 'check_availability',
      description:
        'Open slots for a service on a date. Call BEFORE booking; never guess availability.',
      parameters: {
        type: 'object',
        properties: {
          service: { type: 'string', description: 'Service name, e.g. "Teeth Cleaning"' },
          date: { type: 'string', description: 'Date in YYYY-MM-DD (India time)' },
        },
        required: ['service', 'date'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'book_appointment',
      description:
        'Book an appointment and SMS the confirmation. Only after check_availability showed the slot free, the caller agreed to that exact time, and you know their name.',
      parameters: {
        type: 'object',
        properties: {
          customer_name: { type: 'string' },
          service: { type: 'string' },
          scheduled_for: {
            type: 'string',
            description: 'Exact slot as ISO 8601 with India offset, e.g. 2026-07-15T17:30:00+05:30',
          },
        },
        required: ['customer_name', 'service', 'scheduled_for'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'capture_lead',
      description:
        'Record who called and why, when no booking happens. Better than ending with nothing recorded.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          reason: { type: 'string', description: 'Why they called, in one sentence' },
        },
        required: ['reason'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'end_call',
      description:
        'Hang up. ONLY after you asked if they need anything else and they said no. Then say a short goodbye.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

/**
 * Would a human have actually said this when asked their name?
 *
 * The model has tried to book under "[Awaiting name]", an empty string, and "Sir" —
 * each time confident it had a name. Exported so the booking guard and the test
 * agree on one definition instead of drifting apart.
 */
export function looksLikeRealName(name: string): boolean {
  const n = (name ?? '').trim();
  if (n.length < 2) return false;
  if (/[[\]{}<>]/.test(n)) return false; // "[Awaiting name]"
  if (/^(customer|caller|unknown|user|guest|name|n\/a|tbd|pending|awaiting)/i.test(n)) return false;
  if (/^(sir|madam|ma'?am|ji|sirji|sahab|mr|mrs|ms|dr)\.?$/i.test(n)) return false; // honorific ≠ name
  return true;
}

/** Services, for the system prompt. */
export async function listServices(schedule: Schedule): Promise<string> {
  const services = await schedule.list();
  if (!services.length) return 'No services configured.';
  return services
    .map((s) => `- ${s.name} (${s.durationMinutes} min, Rs ${s.price})`)
    .join('\n');
}

async function checkAvailability(
  ctx: ToolContext,
  args: { service: string; date: string },
): Promise<string> {
  const service = await ctx.schedule.findService(args.service ?? '');
  if (!service) {
    const all = (await ctx.schedule.list()).map((s) => s.name).join(', ');
    return `We do not offer "${args.service}". We offer: ${all}.`;
  }

  const free = await ctx.schedule.slotsFor(service, args.date);
  if (free === null) return `We are closed on ${args.date}. Offer the caller another day.`;
  if (!free.length) return `${args.date} is fully booked for ${service.name}.`;

  // Each slot is labelled in the exact Hinglish the caller will speak ("subah saade
  // das baje"), so matching what they said to a slot is a string lookup rather than
  // mental clock arithmetic — which the model repeatedly got wrong, booking 12:30
  // when the caller clearly said "saade das".
  //
  // Six slots, not the whole day: this string is resent every subsequent turn, and
  // its length is charged against the tokens-per-minute budget each time.
  const list = free
    .slice(0, 6)
    .map((s) => `"${s.spoken}" / "${s.english}" => ${s.iso}`)
    .join('; ');

  // The rule rides along with the RESULT, not just the system prompt — models weight
  // the tool output they just read far more heavily than a rule set 20 turns ago.
  return [
    `Free ${service.name} slots on ${args.date} — ${list}.`,
    'Match what the caller says to a quoted label, then pass THAT label\'s value after',
    '"=>" to book_appointment. Offer two or three aloud. These are the ONLY bookable',
    'times: if they ask for one not listed, say it is taken and offer the nearest.',
    'Never book a time they did not agree to. Get their name first.',
  ].join(' ');
}

async function bookAppointment(
  ctx: ToolContext,
  args: { customer_name: string; service: string; scheduled_for: string },
): Promise<string> {
  if (!ctx.businessId) return 'Booking is unavailable right now.';

  // Guards, not suggestions. The prompt asked the model to get a name and to honour
  // the caller's chosen time; on a live call it did neither. Enforce both here,
  // where it is deterministic.
  // It tried "[Awaiting name]" — a placeholder dressed up as a name. Reject anything
  // that isn't a name a human would actually say out loud.
  const name = (args.customer_name ?? '').trim();
  if (!looksLikeRealName(name)) {
    return "REJECTED: that is not the caller's name. Ask for their actual name, wait for them to say it, then call this again.";
  }

  const slot = new Date(args.scheduled_for);
  if (Number.isNaN(slot.getTime())) {
    return 'REJECTED: scheduled_for was not a valid ISO 8601 timestamp.';
  }
  if (slot.getTime() < Date.now()) {
    return 'REJECTED: that time is in the past. Re-check availability and offer a real slot.';
  }
  if (!(await ctx.schedule.isFree(args.scheduled_for))) {
    return 'REJECTED: that slot is already taken. Tell the caller, and offer a free one from check_availability.';
  }

  const code = Math.random().toString(36).slice(2, 8).toUpperCase();

  const when = slot.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

  if (ctx.dryRun) {
    ctx.schedule.markBooked(args.scheduled_for);
    return `[dry run] Booked ${args.service} for ${name} on ${when}. Confirmation code ${code}. An SMS confirmation has been sent.`;
  }

  const { error } = await supabase.from('appointments').insert({
    business_id: ctx.businessId,
    call_id: ctx.callId,
    customer_name: name,
    customer_phone: ctx.callerPhone,
    service: args.service,
    scheduled_for: args.scheduled_for,
    status: 'confirmed',
    confirmation_code: code,
  });

  if (error) return 'The booking failed to save. Apologise and offer to take a message instead.';
  ctx.schedule.markBooked(args.scheduled_for);

  const smsStatus = await sendConfirmationSms({
    to: ctx.callerPhone,
    businessName: ctx.businessName,
    service: args.service,
    when,
    code,
  });

  await supabase
    .from('appointments')
    .update({ sms_status: smsStatus })
    .eq('confirmation_code', code);

  const smsLine =
    smsStatus === 'sent'
      ? 'An SMS confirmation has been sent.'
      : smsStatus === 'skipped'
        ? 'Tell the caller the confirmation code so they can note it down.'
        : 'The SMS could not be sent, so read the confirmation code aloud instead.';

  return `Booked: ${args.service} for ${name} on ${when}. Confirmation code ${code}. ${smsLine}`;
}

async function captureLead(
  ctx: ToolContext,
  args: { name?: string; reason: string },
): Promise<string> {
  if (!ctx.businessId) return 'Could not save the message.';
  if (ctx.dryRun) return '[dry run] Message saved. Tell the caller the team will ring them back.';

  const { error } = await supabase.from('leads').insert({
    business_id: ctx.businessId,
    call_id: ctx.callId,
    name: args.name ?? null,
    phone: ctx.callerPhone,
    reason: args.reason,
  });

  if (error) return 'Could not save the message.';
  return 'Message saved. Tell the caller the team will ring them back.';
}

/** Dispatch a tool call by name. The string we return goes back to the model. */
export async function runTool(ctx: ToolContext, name: string, rawArgs: string): Promise<string> {
  let args: any;
  try {
    args = JSON.parse(rawArgs || '{}');
  } catch {
    return 'Bad arguments — retry with valid JSON.';
  }

  console.log(`[tool] ${name} ${JSON.stringify(args)}`);

  switch (name) {
    case 'check_availability':
      return checkAvailability(ctx, args);
    case 'book_appointment':
      return bookAppointment(ctx, args);
    case 'capture_lead':
      return captureLead(ctx, args);
    case 'end_call':
      ctx.onEndCall?.();
      return 'The call will end as soon as you finish speaking. Say a short, warm goodbye now — nothing else.';
    default:
      return `Unknown tool ${name}.`;
  }
}
