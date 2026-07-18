/**
 * Four capability cards — the "why she's different" strip, above the fold on most
 * laptops so the value lands before anyone reaches the dashboard. Each is one concrete
 * claim the live demo above actually backs up, not marketing fluff.
 */

const ITEMS = [
  {
    icon: '🗣️',
    title: 'Fluent Hinglish',
    body: 'Understands natural code-switching mid-sentence — “kal subah das baje” — the way people in India actually speak, not stiff textbook Hindi.',
  },
  {
    icon: '📅',
    title: 'Books while you talk',
    body: 'Checks real availability and locks the slot before the caller hangs up. No callbacks, no double-booking, no “we’ll get back to you”.',
  },
  {
    icon: '💬',
    title: 'Texts the confirmation',
    body: 'Every booking ends with an SMS — date, time and a confirmation code — so the customer has it in writing the moment they put the phone down.',
  },
  {
    icon: '⚡',
    title: 'Interrupt her anytime',
    body: 'Talk over her and she stops instantly, like a person would — with sub-second replies, the conversation never feels like waiting on a bot.',
  },
];

export function Capabilities() {
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-14">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          A receptionist, not a phone tree
        </h2>
        <p className="mt-3 text-neutral-400">
          No “press 1 for bookings”. Vaani holds a real conversation and gets the job done
          on the first call.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map((it) => (
          <div
            key={it.title}
            className="rounded-2xl border border-white/10 bg-[#111113] p-5 transition hover:border-white/20"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-xl">
              {it.icon}
            </div>
            <h3 className="mt-4 text-base font-semibold text-white">{it.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">{it.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
