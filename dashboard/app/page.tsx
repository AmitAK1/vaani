'use client';

import { SiteNav } from '@/components/SiteNav';
import { Hero } from '@/components/Hero';
import { Capabilities } from '@/components/Capabilities';
import { StatTiles } from '@/components/StatTiles';
import { LatencyPanel } from '@/components/LatencyPanel';
import { Bookings, LiveCalls } from '@/components/LiveCalls';
import { useAppointments, useCalls, useLeads, useTranscripts } from '@/lib/useLiveData';

/**
 * The whole story on one page: what Vaani is (hero), why she's different (capabilities),
 * and proof she's real (the live dashboard) — where the call you just made shows up as a
 * transcript, a booking and a latency reading while you're still on the line.
 */
export default function Home() {
  const calls = useCalls();
  const transcripts = useTranscripts();
  const appointments = useAppointments();
  const leads = useLeads();

  return (
    <>
      <SiteNav />

      <main>
        <Hero />
        <Capabilities />

        {/* The receipts. */}
        <section id="dashboard" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-20 pt-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              The owner’s live dashboard
            </h2>
            <p className="mt-3 text-neutral-400">
              Every number, transcript and booking below is real and updates the instant it
              happens — including the call you just made from the demo above.
            </p>
          </div>

          <div className="mt-10 space-y-3">
            <StatTiles calls={calls} appointments={appointments} leads={leads} />
            <LatencyPanel transcripts={transcripts} />
            <LiveCalls calls={calls} transcripts={transcripts} />
            <Bookings appointments={appointments} />
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-8 text-center text-xs text-[#898781] sm:flex-row sm:justify-between sm:text-left">
          <p>
            Built solo by Amit for the FlowZint AI Hackathon 2026 ·{' '}
            <a
              href="https://github.com/AmitAK1/vaani"
              target="_blank"
              rel="noreferrer"
              className="text-neutral-400 underline-offset-4 hover:text-white hover:underline"
            >
              Source on GitHub
            </a>
          </p>
          <p className="text-[#898781]">
            Deepgram nova-3 · Groq gpt-oss-120b · Cartesia Sonic · Twilio · Supabase Realtime
          </p>
        </div>
      </footer>
    </>
  );
}
