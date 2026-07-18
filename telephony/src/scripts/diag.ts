import Groq from 'groq-sdk';
import { config } from '../config';
import { TOOL_SCHEMAS, listServices } from '../lib/tools';
import { systemPrompt } from '../lib/llm';
import { Schedule } from '../lib/schedule';
import { supabase } from '../lib/supabase';

/**
 * How many tokens does one turn really cost?
 *
 * Groq's free tier gives gpt-oss-120b 8,000 tokens PER MINUTE. Exceed it and the SDK
 * retries with backoff, which lands as a multi-second stall in the middle of a live
 * call. So: measure, don't guess whether a demo call fits in the budget.
 */

const { data: biz } = await supabase
  .from('businesses')
  .select('id, name')
  .eq('name', 'Sunrise Dental Clinic')
  .single();

const schedule = new Schedule(biz!.id);
const system = systemPrompt(biz!.name, await listServices(schedule), 'Monday, 13 July 2026, 10:00 pm');

const groq = new Groq({ apiKey: config.groq.apiKey, maxRetries: 0 });

const res: any = await groq.chat.completions.create({
  model: config.groq.model,
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: 'Namaste, mujhe kal dental checkup ke liye appointment chahiye.' },
  ],
  tools: TOOL_SCHEMAS,
  ...(config.groq.model.includes('gpt-oss') ? { reasoning_effort: 'low' } : {}),
} as any);

const u = res.usage;
console.log(`model            ${config.groq.model}`);
console.log(`prompt tokens    ${u.prompt_tokens}   (system + tool schemas + 1 user turn)`);
console.log(`output tokens    ${u.completion_tokens}`);
console.log(`TOTAL per call   ${u.total_tokens}`);

// A booking turn costs two round trips (decide-to-call-tool, then answer with the result).
const perToolTurn = u.total_tokens * 2;
const perPlainTurn = u.total_tokens;
const demoCall = perToolTurn * 2 + perPlainTurn * 4; // 2 tool turns + 4 chatty turns

console.log(`\nestimated demo call (2 tool turns + 4 plain): ~${demoCall} tokens`);
console.log(`free-tier budget: 8000 tokens/min`);
console.log(
  demoCall > 8000
    ? `\n⚠️  A 90-second call spends ~${demoCall} tokens. That is over the per-minute cap —\n   expect a multi-second stall mid-demo unless billing is enabled.`
    : `\n✅ Fits inside the free-tier per-minute budget.`,
);

process.exit(0);
