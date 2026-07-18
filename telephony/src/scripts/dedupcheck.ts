import { makeRepeatGuard, runTurn, systemPrompt, type Turn } from '../lib/llm';
import { listServices, type ToolContext } from '../lib/tools';
import { Schedule } from '../lib/schedule';
import { supabase } from '../lib/supabase';

/**
 * The repetition guard, tested directly.
 *
 * Real stutters heard on live calls:
 *   "Aapka naam kya hai, ji?"  then  "Ji, aapka naam?"
 *   the same question asked three times in a row
 *
 * And things that must still BOTH be said (offering two different times must not be
 * mistaken for a repeat):
 *   "Subah nau baje"  and  "Subah das baje"
 *
 *   npm run dedupcheck
 */

// The REAL guard from llm.ts — not a copy. A copy would drift and start passing tests
// the shipped code fails.
const makeGuard = makeRepeatGuard;

interface Case {
  name: string;
  lines: string[];
  expectSpoken: number;
}

const CASES: Case[] = [
  {
    name: 'reworded repeat of the same question (heard on a live call)',
    lines: ['Aapka naam kya hai, ji?', 'Ji, aapka naam?'],
    expectSpoken: 1,
  },
  {
    name: 'same question three times running (heard on a live call)',
    lines: [
      'Aapko kaunsi service ke liye kal ka slot chahiye?',
      'Aapko kaunsi service ke liye kal ka slot chahiye?',
      'Aapko kaunsi service ke liye kal ka slot chahiye?',
    ],
    expectSpoken: 1,
  },
  {
    name: 'two DIFFERENT slot offers must both be spoken',
    lines: ['Subah nau baje ka slot hai.', 'Subah das baje ka slot hai.'],
    expectSpoken: 2,
  },
  {
    name: 'a normal two-sentence turn is untouched',
    lines: ['Aapka appointment confirm ho gaya hai.', 'Aur kuch madad chahiye?'],
    expectSpoken: 2,
  },
  {
    name: 'confirmation then a genuinely new question',
    lines: [
      'Mujhe maaf kijiye, gyarah baje ka slot taken hai.',
      'Kya saade das baje theek rahega?',
    ],
    expectSpoken: 2,
  },
];

let failed = 0;

for (const c of CASES) {
  const guard = makeGuard();
  const spoken = c.lines.filter((l) => !guard(l));
  const ok = spoken.length === c.expectSpoken;
  if (!ok) failed++;

  console.log(`${ok ? '✅' : '❌'} ${c.name}`);
  console.log(`   said ${spoken.length}/${c.lines.length}, expected ${c.expectSpoken}`);
  for (const s of spoken) console.log(`     → "${s}"`);
  for (const s of c.lines.filter((l) => !spoken.includes(l))) console.log(`     ✕ "${s}" (suppressed)`);
  console.log();
}

if (failed) {
  console.error(`${failed} case(s) failed.`);
  process.exit(1);
}

// Now prove the guard is actually wired into runTurn, not just correct in isolation.
const { data: biz } = await supabase
  .from('businesses')
  .select('id, name')
  .eq('name', 'Sunrise Dental Clinic')
  .maybeSingle();

if (!biz) {
  console.log('(skipping live wiring check — run `npm run seed` first)');
  process.exit(0);
}

const ctx: ToolContext = {
  businessId: biz.id,
  businessName: biz.name,
  callId: null,
  callerPhone: '+919172010599',
  schedule: new Schedule(biz.id),
  dryRun: true,
};

const history: Turn[] = [
  { role: 'system', content: systemPrompt(biz.name, await listServices(ctx.schedule), 'Monday, 13 July 2026, 10:00 pm') },
  { role: 'user', content: 'Aap kaunsi services dete hain? Zara repeat kijiye.' },
];

const spoken: string[] = [];
await runTurn(history, ctx, (s) => spoken.push(s), () => {});

const guard = makeGuard();
const dupes = spoken.filter((s) => guard(s) === true);

console.log('live turn through runTurn:');
for (const s of spoken) console.log(`  → "${s}"`);

if (dupes.length) {
  console.error(`\n❌ ${dupes.length} duplicate sentence(s) reached the caller.`);
  process.exit(1);
}

console.log('\n✅ Repetition guard holds — no stutters, no lost content.');
process.exit(0);
