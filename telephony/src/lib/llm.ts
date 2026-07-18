import Groq from 'groq-sdk';
import { config } from '../config';
import { TOOL_SCHEMAS, runTool, type ToolContext } from './tools';

const groq = new Groq({ apiKey: config.groq.apiKey });

/**
 * Only the recent conversation goes to the model.
 *
 * Groq's free tier caps tokens-per-minute (8k on gpt-oss, 30k on llama-4-scout).
 * Resending the entire call history every turn burns that budget fast, and once you
 * hit the cap the SDK quietly retries with backoff — which showed up as a THIRTEEN
 * SECOND stall in the middle of a phone call. A receptionist only needs the last
 * few exchanges anyway.
 *
 * The window must start at a `user` turn: cutting between an assistant's tool_calls
 * and its tool results leaves an orphaned `tool` message, which Groq rejects.
 */
const RECENT_TURNS = 12;

function windowed(history: Turn[]): Turn[] {
  if (history.length <= RECENT_TURNS + 1) return history;

  const system = history[0];
  for (let i = history.length - RECENT_TURNS; i < history.length; i++) {
    if (history[i].role === 'user') return [system, ...history.slice(i)];
  }
  return history;
}

export type Turn = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
};

/**
 * Every rule here exists because it broke on a real call. Kept terse on purpose:
 * this prompt is resent on EVERY turn, and Groq's free tier meters tokens per
 * minute — verbosity here turns into a stall in the caller's ear.
 */
export function systemPrompt(businessName: string, services: string, nowIst: string): string {
  return [
    `You are Vaani, receptionist for "${businessName}" in India, on a LIVE PHONE CALL.`,
    `Everything you write is spoken aloud. Now: ${nowIst} (India). Use it for "kal"/"aaj".`,
    '',
    'Services:',
    services,
    '',
    'SPEAKING',
    '- Hinglish by default: Hindi+English mixed, Roman script. Devanagari input still',
    '  means reply in Hinglish. Pure English only if they speak pure English.',
    '  Good: "Ji bilkul, kal subah das baje ka slot khaali hai."',
    '  Bad: "Sure! We have openings tomorrow at ten o clock."',
    '- One or two short sentences per turn. Never monologue.',
    '- Spoken words only: no markdown, no emoji, no bracketed asides like "(please',
    '  respond)", no slashes ("sir/madam" is read aloud as "sir slash madam").',
    '- Say times the spoken way: "shaam paanch baje", never "17:00".',
    '- Never write the caller lines yourself. Say your part, then STOP and wait.',
    '- If you did not understand, ask them to repeat. Invent nothing.',
    '',
    'ACTING',
    '- To book: check_availability, offer two or three real times, get their NAME, then',
    '  book_appointment with the exact slot value you were given.',
    '- Never claim a slot is free, or a booking confirmed, unless a tool said so.',
    '- If their time is not in the list, say it is taken and offer the nearest instead.',
    '  Booking a time they never agreed to sends them to the clinic at the wrong hour.',
    '- Invent nothing the tools did not tell you: no arrival rules, prices, or policies.',
    '- No booking? Call capture_lead. A call that records nothing is a lost customer.',
    '',
    'ENDING',
    '- After booking, ask "Aur kuch madad chahiye?" and WAIT for their answer.',
    '- Once THEY say no ("nahi", "bas itna hi", "thank you"), you MUST call the end_call',
    '  tool and then say one short goodbye: "Dhanyavaad! Aapka din shubh ho."',
    '  Saying goodbye does NOT hang up the phone — only end_call does. Skip it and the',
    '  caller is left holding a silent line.',
    '- Never end_call in the same turn as a booking, and never say goodbye in the same',
    '  breath as "Aur kuch madad chahiye?" — ask, then stop. Wait for the answer.',
  ].join('\n');
}

export interface TurnResult {
  reply: string;
  toolsUsed: string[];
  /** Name + parsed args of every tool the model actually invoked, for assertions. */
  toolCalls: { name: string; args: any }[];
  /** ms from request start to the first token — the model's share of the latency. */
  llmMs: number | null;
}

/**
 * Llama sometimes writes a tool call as literal TEXT instead of emitting a real
 * one — e.g. `<function=check_availability>{"date":"2026-07-14"}</function>`.
 * On a phone call that is catastrophic twice over: the tool never runs, and the
 * TTS reads the XML out loud to the caller. (It did exactly that on a live call.)
 *
 * So we detect the pattern, keep it out of the caller's ear, and run it as if the
 * model had asked properly.
 */
const INLINE_CALL = /<function=([\w_]+)>\s*(\{[\s\S]*?\})\s*<\/function>/g;

/**
 * Make text safe to say out loud.
 *
 * Two things must never reach the TTS, and the prompt forbidding them isn't enough —
 * both have slipped through onto live calls:
 *   - tool-call markup, which got read aloud as XML
 *   - bracketed asides: "(Waiting for response)", "saade gyarah baje (11:30)"
 *
 * Parentheses have no spoken form. Anything inside them is written-only, so it goes.
 */
const sanitizeForSpeech = (s: string): string =>
  s
    .replace(INLINE_CALL, '')
    .replace(/<\/?function[^>]*>/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

/** Words that carry a time. Two sentences differing only here are NOT the same sentence. */
const TIME_WORDS = new Set([
  'ek', 'do', 'teen', 'chaar', 'paanch', 'chhah', 'saat', 'aath', 'nau', 'das',
  'gyarah', 'barah', 'saade', 'derh', 'dhai', 'subah', 'dopahar', 'shaam', 'raat',
]);

const timeSignature = (words: Set<string>): string =>
  [...words].filter((w) => TIME_WORDS.has(w) || /\d/.test(w)).sort().join(' ');

/**
 * Suppress the model restating itself inside one turn.
 *
 * Live calls produced "Aapka naam kya hai, ji?" followed by "Ji, aapka naam?", and
 * once the same question three times running. Each sentence is synthesized and played
 * separately, so the caller hears a stutter.
 *
 * Exact-match dedup misses these — the repeats are REWORDED. So compare word sets.
 * But word overlap alone is too blunt: "subah nau baje ka slot hai" and "subah das
 * baje ka slot hai" share 5 of 7 words (0.71) while being two completely different
 * offers. So if the sentences carry DIFFERENT times, they are never duplicates —
 * the time is the entire content.
 */
export function makeRepeatGuard(): (sentence: string) => boolean {
  const seen: Set<string>[] = [];

  return (s: string): boolean => {
    const words = new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
    if (!words.size) return true;

    for (const prev of seen) {
      if (timeSignature(prev) !== timeSignature(words)) continue; // different times → different sentences

      let shared = 0;
      for (const w of words) if (prev.has(w)) shared++;
      if (shared / new Set([...prev, ...words]).size >= 0.6) return true;
    }

    seen.push(words);
    return false;
  };
}

/**
 * Run one assistant turn: stream from Groq, execute any tools it calls, and emit
 * each SENTENCE the moment it completes.
 *
 * Sentence-level emission is the latency trick. Waiting for the full completion
 * before synthesizing would leave the caller in silence for a second or more;
 * instead we speak sentence one while the model is still writing sentence two.
 *
 * The tool loop runs to completion before the final wording is spoken, so a
 * booking is always saved *before* Vaani says it's booked.
 */
export async function runTurn(
  history: Turn[],
  ctx: ToolContext,
  onSentence: (sentence: string) => void,
  onToolStart: (names: string[]) => void,
  signal?: AbortSignal,
): Promise<TurnResult> {
  const toolsUsed: string[] = [];
  const toolCalls: { name: string; args: any }[] = [];
  let llmMs: number | null = null;

  const isRepeat = makeRepeatGuard();

  // At most a couple of tool rounds — check availability, then book. Bounded so a
  // confused model can't loop while a human waits on the line.
  for (let round = 0; round < 4; round++) {
    if (signal?.aborted) break;

    const startedAt = Date.now();
    const stream = (await groq.chat.completions.create(
      {
        model: config.groq.model,
        messages: windowed(history) as any,
        tools: TOOL_SCHEMAS,
        stream: true,
        temperature: 0.6,
        // gpt-oss reasons before answering; a receptionist choosing between four known
        // slots needs to answer, not deliberate. Only gpt-oss accepts this knob —
        // llama-4 rejects the whole request with a 400 if it's present.
        ...(config.groq.model.includes('gpt-oss') ? { reasoning_effort: 'low' } : {}),
      } as any,
      { signal },
    )) as any;

    let pending = '';
    let full = '';
    let calls: { id: string; name: string; args: string }[] = [];

    const flush = () => {
      // If the model has started writing a tool call as text, hold everything back
      // until it closes the tag — otherwise we'd speak half an XML element.
      if (pending.includes('<function=') && !pending.includes('</function>')) return;

      const sentence = sanitizeForSpeech(pending);
      pending = '';
      if (sentence && !isRepeat(sentence)) onSentence(sentence);
    };

    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;
      if (llmMs === null) llmMs = Date.now() - startedAt;

      // Tool calls arrive in fragments; the `index` tells us which one to append to.
      for (const tc of delta.tool_calls ?? []) {
        const i = tc.index ?? 0;
        calls[i] ??= { id: '', name: '', args: '' };
        if (tc.id) calls[i].id = tc.id;
        if (tc.function?.name) calls[i].name += tc.function.name;
        if (tc.function?.arguments) calls[i].args += tc.function.arguments;
      }

      const token = delta.content ?? '';
      if (!token) continue;
      pending += token;
      full += token;

      // Speak on a sentence boundary. The length guard keeps us from splitting on
      // the dot in "Dr." or in a price.
      if (/[.!?।]$/.test(pending.trimEnd()) && pending.trim().length > 12) flush();
    }
    flush();

    // Recover tool calls the model wrote as prose rather than emitting properly.
    if (!calls.length) {
      const inline = [...full.matchAll(INLINE_CALL)];
      if (inline.length) {
        calls = inline.map((m, i) => ({ id: `inline_${round}_${i}`, name: m[1], args: m[2] }));
        console.warn(`[llm] recovered inline tool call(s): ${calls.map((c) => c.name).join(', ')}`);
      }
    }

    // Whatever we say aloud must never contain tool-call markup.
    const spoken = sanitizeForSpeech(full);

    // It booked, asked "anything else?", answered on the caller's behalf, and hung up
    // — all in one turn. Drop the end_call rather than feeding a rejection back, which
    // would send the model round again and make it repeat the whole confirmation aloud.
    if (calls.some((c) => c.name === 'end_call') && toolsUsed.includes('book_appointment')) {
      console.warn('[llm] dropped end_call issued in the same turn as a booking');
      calls = calls.filter((c) => c.name !== 'end_call');
    }

    if (!calls.length) {
      return { reply: spoken, toolsUsed, toolCalls, llmMs };
    }

    // The model wants to act. Tell the caller we're working — a silent 800ms gap
    // while we hit the DB is the most unnatural thing on a phone call.
    onToolStart(calls.map((c) => c.name));

    history.push({
      role: 'assistant',
      content: spoken,
      tool_calls: calls.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: c.args },
      })),
    });

    for (const call of calls) {
      toolsUsed.push(call.name);
      try {
        toolCalls.push({ name: call.name, args: JSON.parse(call.args || '{}') });
      } catch {
        toolCalls.push({ name: call.name, args: null });
      }
      const result = await runTool(ctx, call.name, call.args);
      history.push({ role: 'tool', tool_call_id: call.id, content: result });
    }
  }

  return { reply: '', toolsUsed, toolCalls, llmMs };
}
