'use client';

/**
 * A thin sticky top bar: wordmark on the left, orientation + the two "prove it's real"
 * links on the right (the live phone number and the source on GitHub). Deliberately
 * quiet — it frames the page without competing with the hero.
 */

const PHONE = '+1 650 582 4480';
const GITHUB = 'https://github.com/AmitAK1/vaani';

/** A five-bar audio waveform — the universal "voice / sound" mark, which is what
 *  "Vaani" means. Reads instantly whether or not you know the script. */
function VoiceMark() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
      {[
        { x: 2, h: 6 },
        { x: 6, h: 12 },
        { x: 10, h: 16 },
        { x: 14, h: 10 },
        { x: 18, h: 5 },
      ].map(({ x, h }) => (
        <rect
          key={x}
          x={x - 1}
          y={(20 - h) / 2}
          width="2"
          height={h}
          rx="1"
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

export function SiteNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-neutral-950/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <a href="#top" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500 text-white">
            <VoiceMark />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-white">Vaani</span>
        </a>

        <nav className="flex items-center gap-1 text-sm">
          <a
            href="#how"
            className="hidden rounded-lg px-3 py-1.5 text-neutral-400 transition hover:text-white sm:block"
          >
            How it works
          </a>
          <a
            href="#dashboard"
            className="hidden rounded-lg px-3 py-1.5 text-neutral-400 transition hover:text-white sm:block"
          >
            Live dashboard
          </a>
          <a
            href={GITHUB}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg px-3 py-1.5 text-neutral-400 transition hover:text-white"
          >
            GitHub
          </a>
          <a
            href={`tel:${PHONE.replace(/\s/g, '')}`}
            className="ml-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-neutral-200 transition hover:border-white/20 hover:bg-white/10"
          >
            {PHONE}
          </a>
        </nav>
      </div>
    </header>
  );
}
