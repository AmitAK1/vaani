'use client';

import { TalkToVaani } from './TalkToVaani';

/**
 * The first screen. Says what Vaani is (left) and lets you try her on the spot (right),
 * so a visitor understands and experiences the product without scrolling. The orb runs
 * the real engine — the same STT, brain, voice and barge-in a phone call uses.
 */

const PILLS = [
  'Speaks Hinglish',
  'Books while you talk',
  'SMS confirmation',
  'Replies in under a second',
  'Interrupt her anytime',
];

export function Hero() {
  return (
    <section id="top" className="relative">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8 lg:pb-24 lg:pt-20">
        {/* Left: the pitch */}
        <div className="animate-fade-up text-center lg:text-left">
          <p className="text-xs font-medium uppercase tracking-widest text-indigo-400">
            AI Phone Receptionist · Hinglish
          </p>

          <h1 className="mt-4 text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Never miss a<br className="hidden sm:block" /> customer call again.
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-neutral-400 lg:mx-0 lg:text-lg">
            Half of small-business calls go unanswered — and a missed call is a lost customer.
            Vaani picks up 24/7, talks to callers in natural Hinglish, books the appointment
            while they’re still on the line, and texts them the confirmation.
          </p>

          <ul className="mt-6 flex flex-wrap justify-center gap-2 lg:justify-start">
            {PILLS.map((p) => (
              <li
                key={p}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-300"
              >
                {p}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col items-center gap-3 text-sm sm:flex-row lg:items-start">
            <a
              href="#how"
              className="rounded-lg bg-white px-5 py-2.5 font-semibold text-neutral-900 transition hover:bg-neutral-200"
            >
              See how it works
            </a>
            <span className="text-neutral-500">
              or ring the real thing:{' '}
              <a
                href="tel:+16505824480"
                className="font-mono text-neutral-300 underline-offset-4 hover:underline"
              >
                +1 650 582 4480
              </a>
            </span>
          </div>
        </div>

        {/* Right: try it now */}
        <div className="animate-fade-up rounded-3xl border border-white/10 bg-white/[0.03] p-8 [animation-delay:120ms] sm:p-10">
          <div className="flex items-center justify-center gap-2 pb-6">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            <span className="text-xs font-medium uppercase tracking-widest text-neutral-400">
              Live demo — talk to her now
            </span>
          </div>
          <TalkToVaani />
        </div>
      </div>
    </section>
  );
}
