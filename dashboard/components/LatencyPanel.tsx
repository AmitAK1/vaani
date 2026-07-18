'use client';

import type { Transcript } from '@/lib/useLiveData';

/**
 * Time-to-first-audio, per turn.
 *
 * TTFA is the only latency a caller can feel: the gap between them finishing a sentence
 * and Vaani starting to speak. Everything else (LLM tokens, TTS synthesis) is hidden
 * behind it. So that is what we plot — one bar per turn, newest on the right.
 *
 * Design notes, per the dataviz method:
 *  - ONE series, so one color (blue #3987e5, validated ≥3:1 on this surface) and no
 *    legend — the title names it.
 *  - The 1-second target is a labelled reference line, not a color change, so meaning
 *    never rides on hue alone.
 *  - Bars are thin, with 4px rounded tops anchored to the baseline.
 */

const TARGET_MS = 1000; // above this, a caller starts to feel the pause

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

export function LatencyPanel({ transcripts }: { transcripts: Transcript[] }) {
  const turns = transcripts
    .filter((t) => t.role === 'assistant' && t.ttfa_ms != null)
    .slice(-40);

  const values = turns.map((t) => t.ttfa_ms as number);
  const med = median(values);
  const overTarget = values.filter((v) => v > TARGET_MS).length;

  // Scale to the data, but always show the target line even when everything is fast.
  const ceiling = Math.max(TARGET_MS * 1.3, ...values, 1);

  return (
    <section className="rounded-xl border border-white/10 bg-[#111113] p-5">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Response latency</h2>
          <p className="mt-0.5 text-xs text-[#898781]">
            Caller stops speaking → Vaani’s first audio. Live, per turn.
          </p>
        </div>

        {med != null && (
          <div className="text-right">
            <div className="text-3xl font-semibold leading-none text-white">
              {med}
              <span className="ml-1 text-base font-normal text-[#898781]">ms</span>
            </div>
            <div className="mt-1 text-xs text-[#898781]">median of {values.length}</div>
          </div>
        )}
      </div>

      {!turns.length ? (
        <p className="mt-8 pb-6 text-center text-sm text-[#898781]">
          No turns yet — start a call and watch this fill in.
        </p>
      ) : (
        <>
          <div className="relative mt-6 h-32">
            {/* Target line. Labelled, so "fast" isn't communicated by color alone. */}
            <div
              className="absolute inset-x-0 border-t border-dashed border-[#383835]"
              style={{ bottom: `${(TARGET_MS / ceiling) * 100}%` }}
            >
              <span className="absolute -top-2 right-0 bg-[#111113] pl-2 text-[10px] text-[#898781]">
                1s target
              </span>
            </div>

            {/* One bar per turn. 2px gaps keep adjacent fills from reading as one mark. */}
            <div className="flex h-full items-end gap-[2px]">
              {turns.map((t) => {
                const ms = t.ttfa_ms as number;
                return (
                  <div
                    key={t.id}
                    title={`${ms}ms${t.barged_in ? ' · barged in' : ''}${
                      t.tools_used?.length ? ` · ${t.tools_used.join(', ')}` : ''
                    }`}
                    className="group relative flex-1 rounded-t bg-[#3987e5] transition hover:bg-[#5598e7]"
                    style={{ height: `${Math.max((ms / ceiling) * 100, 2)}%` }}
                  >
                    <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black px-1.5 py-0.5 text-[10px] text-white group-hover:block">
                      {ms}ms
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-xs">
            <span className="text-[#898781]">
              fastest {Math.min(...values)}ms · slowest {Math.max(...values)}ms
            </span>
            <span className={overTarget ? 'text-[#fab219]' : 'text-[#0ca30c]'}>
              {overTarget
                ? `⚠ ${overTarget} turn${overTarget > 1 ? 's' : ''} over 1s`
                : '✓ every turn under 1s'}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
