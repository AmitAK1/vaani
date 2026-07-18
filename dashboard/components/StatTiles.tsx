'use client';

import type { Appointment, Call, Lead } from '@/lib/useLiveData';

/**
 * Four headline numbers.
 *
 * These are single values, so they are stat tiles, not charts — a bar chart of "4
 * bookings" communicates nothing a number doesn't. Values sit in primary ink; the
 * supporting line is muted. No color carries meaning here.
 */

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#111113] p-4">
      <div className="text-xs text-[#898781]">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold text-white">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-[#898781]">{sub}</div>}
    </div>
  );
}

export function StatTiles({
  calls,
  appointments,
  leads,
}: {
  calls: Call[];
  appointments: Appointment[];
  leads: Lead[];
}) {
  const live = calls.filter((c) => c.status === 'in_progress').length;
  const booked = calls.filter((c) => c.outcome === 'booked').length;

  // The number that makes the business case: of the calls that reached us, how many
  // turned into something instead of a missed call?
  const converted = calls.filter((c) => c.outcome === 'booked' || c.outcome === 'lead').length;
  const rate = calls.length ? Math.round((converted / calls.length) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        label="Calls answered"
        value={calls.length}
        sub={live ? `${live} live now` : 'none live'}
      />
      <Tile label="Appointments booked" value={appointments.length} sub={`${booked} from calls`} />
      <Tile label="Leads captured" value={leads.length} sub="callers who didn’t book" />
      <Tile label="Calls that converted" value={`${rate}%`} sub="booked or lead captured" />
    </div>
  );
}
