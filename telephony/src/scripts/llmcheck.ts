import { runTurn, systemPrompt, type Turn } from '../lib/llm';
import { listServices, looksLikeRealName, type ToolContext } from '../lib/tools';
import { Schedule } from '../lib/schedule';
import { supabase } from '../lib/supabase';

/**
 * Drive a whole booking conversation through the LLM + tools WITHOUT a phone call.
 *
 * Every bug we've hit so far (spoken stage directions, tool calls emitted as XML
 * and read aloud) was catchable here in seconds, instead of on a live call.
 *   npm run llmcheck
 */

const { data: biz } = await supabase
  .from('businesses')
  .select('id, name')
  .eq('name', 'Sunrise Dental Clinic')
  .maybeSingle();

if (!biz) {
  console.error('Seed the demo tenant first: npm run seed');
  process.exit(1);
}

let endCallRequested = false;

const ctx: ToolContext = {
  businessId: biz.id,
  businessName: biz.name,
  callId: null,
  callerPhone: '+919172010599',
  schedule: new Schedule(biz.id),
  onEndCall: () => {
    endCallRequested = true;
  },
  dryRun: true, // read real availability, but book nothing and text nobody
};

const nowIst = new Date().toLocaleString('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const history: Turn[] = [
  { role: 'system', content: systemPrompt(ctx.businessName, await listServices(ctx.schedule), nowIst) },
];

// A realistic Hinglish booking, including the exact turn that broke last time.
const SCRIPT = [
  'Namaste, mujhe kal dental checkup ke liye appointment chahiye.',
  // 11:00 is deliberately already taken. A good agent says so and offers alternatives;
  // a bad one quietly books 11:30 and tells the caller it is confirmed.
  'Gyarah baje theek rahega.',
  'Theek hai, saade das baje kar dijiye.',
  'Mera naam Amit Kamale hai.',
  'Nahi, bas itna hi. Thank you.', // → should trigger end_call + a goodbye
];

let nameGiven = false;
let first = true;

for (const line of SCRIPT) {
  // A real caller takes a few seconds to speak and think. Firing turns back-to-back
  // trips Groq's tokens-per-minute cap, and the SDK's silent retry then shows up as
  // a fake 13-second "model latency". Pace it like a human so the numbers are honest.
  if (!first) await new Promise((r) => setTimeout(r, 5000));
  first = false;

  console.log(`\nCALLER: ${line}`);
  history.push({ role: 'user', content: line });
  if (/mera naam/i.test(line)) nameGiven = true;

  const spokenAloud: string[] = [];
  const t0 = Date.now();

  const result = await runTurn(
    history,
    ctx,
    (sentence) => spokenAloud.push(sentence),
    (tools) => console.log(`        (tool: ${tools.join(', ')})`),
  );

  for (const s of spokenAloud) console.log(`VAANI : ${s}`);
  console.log(`        [llm ${result.llmMs}ms | turn ${Date.now() - t0}ms | tools: ${result.toolsUsed.join(', ') || 'none'}]`);

  // The two failure modes that reached a real caller's ear. Fail loudly on both.
  const said = spokenAloud.join(' ');
  if (/<function|<\/function/.test(said)) {
    console.error('\n❌ FAIL: tool-call markup was about to be SPOKEN ALOUD.');
    process.exit(1);
  }
  if (/\([^)]*\b(please|I will|respond)\b[^)]*\)/i.test(said)) {
    console.error('\n❌ FAIL: a stage direction was about to be spoken aloud.');
    process.exit(1);
  }
  // A booking that ACTUALLY LANDED before the caller ever gave a name. An attempt with
  // a placeholder ("[Awaiting name]", "Sir") is fine — the guard rejects it and the
  // model goes back and asks. Only a booking that got through is a bug, so test against
  // the same rule the guard uses rather than a second, drifting copy of it.
  const landed = result.toolCalls.find(
    (c) => c.name === 'book_appointment' && looksLikeRealName(c.args?.customer_name ?? ''),
  );
  if (landed && !nameGiven) {
    console.error(
      `\n❌ FAIL: booked as "${landed.args.customer_name}" before the caller gave a name.`,
    );
    process.exit(1);
  }
  // The caller settled on "saade das baje" = 10:30. Check the timestamp we actually
  // WROTE, not the time Vaani claims out loud — a model that mishears the hour will
  // happily say the right thing and book the wrong one.
  const booking = result.toolCalls.find((c) => c.name === 'book_appointment');
  if (booking) {
    const iso: string = booking.args?.scheduled_for ?? '';
    if (!iso.includes('T10:30')) {
      console.error(`\n❌ FAIL: caller agreed to 10:30, but we booked ${iso}`);
      process.exit(1);
    }
    console.log(`        ✓ booked the agreed slot (${iso})`);
  }

  if (result.reply) history.push({ role: 'assistant', content: result.reply });
}

if (!endCallRequested) {
  console.error('\n❌ FAIL: the caller said "bas itna hi" and Vaani never ended the call.');
  process.exit(1);
}

console.log('\n✅ Clean: no markup, no stage directions, booked the agreed slot, ended the call.');
process.exit(0);
