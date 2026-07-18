'use client';

import { useEffect, useRef, useState } from 'react';
import type { Appointment, Call, Transcript } from '@/lib/useLiveData';

/**
 * The live call feed: pick a call, watch the conversation stream in.
 *
 * During a demo the newest call is auto-selected, so the transcript appears line by
 * line while the caller is still talking. That is the moment that sells the product.
 */

const timeIST = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  });

const OUTCOME: Record<string, { label: string; className: string }> = {
  booked: { label: 'Booked', className: 'text-[#0ca30c]' },
  lead: { label: 'Lead', className: 'text-[#fab219]' },
};

export function LiveCalls({
  calls,
  transcripts,
}: {
  calls: Call[];
  transcripts: Transcript[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  // Follow the newest call unless the viewer has deliberately clicked another one.
  useEffect(() => {
    if (!pinned && calls.length) setSelected(calls[0].id);
  }, [calls, pinned]);

  const active = selected ?? calls[0]?.id ?? null;
  const lines = transcripts.filter((t) => t.call_id === active);

  // Keep the newest line in view as the conversation grows.
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [lines.length]);

  return (
    <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
      <section className="rounded-xl border border-white/10 bg-[#111113] p-3">
        <h2 className="px-1 pb-2 text-sm font-semibold text-white">Calls</h2>

        {!calls.length && (
          <p className="px-1 py-6 text-center text-xs text-[#898781]">No calls yet.</p>
        )}

        <ul className="max-h-[420px] space-y-1 overflow-y-auto">
          {calls.map((c) => {
            const outcome = c.outcome ? OUTCOME[c.outcome] : null;
            const isLive = c.status === 'in_progress';

            return (
              <li key={c.id}>
                <button
                  onClick={() => {
                    setSelected(c.id);
                    setPinned(true);
                  }}
                  className={`w-full rounded-lg px-2.5 py-2 text-left transition ${
                    active === c.id ? 'bg-white/10' : 'hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-white">
                      {c.from_number === 'web' ? 'Browser visitor' : c.from_number}
                    </span>
                    {isLive && (
                      <span className="flex shrink-0 items-center gap-1 text-[10px] text-[#0ca30c]">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#0ca30c]" />
                        live
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-[#898781]">
                    <span>{timeIST(c.started_at)}</span>
                    {c.duration_seconds != null && <span>{c.duration_seconds}s</span>}
                    {outcome && <span className={outcome.className}>{outcome.label}</span>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-xl border border-white/10 bg-[#111113] p-4">
        <h2 className="text-sm font-semibold text-white">Transcript</h2>

        <div ref={feedRef} className="mt-3 max-h-[420px] space-y-3 overflow-y-auto pr-1">
          {!lines.length && (
            <p className="py-16 text-center text-sm text-[#898781]">
              Select a call, or start one — the conversation streams in live.
            </p>
          )}

          {lines.map((t) => (
            <div
              key={t.id}
              className={`flex ${t.role === 'caller' ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                  t.role === 'caller'
                    ? 'bg-white/[0.06] text-neutral-200'
                    : 'bg-[#3987e5] text-white'
                }`}
              >
                <p>{t.content}</p>

                {/* What the engine did on this turn — the receipts. */}
                {t.role === 'assistant' && (t.ttfa_ms != null || t.tools_used?.length) && (
                  <p className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-white/70">
                    {t.ttfa_ms != null && <span>{t.ttfa_ms}ms</span>}
                    {t.tools_used?.map((tool) => (
                      <span key={tool} className="font-mono">
                        {tool}
                      </span>
                    ))}
                    {t.barged_in && <span>interrupted</span>}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function Bookings({ appointments }: { appointments: Appointment[] }) {
  if (!appointments.length) return null;

  return (
    <section className="rounded-xl border border-white/10 bg-[#111113] p-4">
      <h2 className="text-sm font-semibold text-white">Appointments</h2>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-[#898781]">
            <tr>
              <th className="pb-2 pr-4 font-normal">Customer</th>
              <th className="pb-2 pr-4 font-normal">Service</th>
              <th className="pb-2 pr-4 font-normal">When</th>
              <th className="pb-2 pr-4 font-normal">Code</th>
              <th className="pb-2 font-normal">SMS</th>
            </tr>
          </thead>
          <tbody className="text-neutral-200">
            {appointments.slice(0, 8).map((a) => (
              <tr key={a.id} className="border-t border-white/5">
                <td className="py-2 pr-4">{a.customer_name}</td>
                <td className="py-2 pr-4 text-[#c3c2b7]">{a.service}</td>
                <td className="py-2 pr-4 tabular-nums text-[#c3c2b7]">
                  {new Date(a.scheduled_for).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </td>
                <td className="py-2 pr-4 font-mono text-xs text-[#898781]">
                  {a.confirmation_code}
                </td>
                <td className="py-2 text-xs">
                  {a.sms_status === 'sent' ? (
                    <span className="text-[#0ca30c]">✓ sent</span>
                  ) : a.sms_status === 'failed' ? (
                    <span className="text-[#fab219]">failed</span>
                  ) : (
                    <span className="text-[#898781]">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
