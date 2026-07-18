import type { Channel } from './lib/channel';
import { CartesiaTts } from './lib/tts';
import { openSttStream, type SttStream } from './lib/stt';
import { runTurn, systemPrompt, type Turn } from './lib/llm';
import { listServices, type ToolContext } from './lib/tools';
import { Schedule } from './lib/schedule';
import { hangUp } from './lib/twilio';
import { createCall, endCall, saveTranscript, setCallOutcome } from './lib/db';

/**
 * One conversation with Vaani — over a phone line or a browser tab, identically.
 *
 * The transport-specific bits (μ-law vs PCM, Twilio's `clear` event vs a JSON message)
 * live behind `Channel`. Everything here — barge-in, the token→TTS pipeline, tools,
 * latency accounting — is shared, which is the whole point: the browser demo exercises
 * the same engine the phone does, so it can't be a hollow lookalike.
 */

/** How long a caller can stay silent before we assume they've gone. */
const IDLE_HANGUP_MS = 20_000;

const nowInIndia = () =>
  new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export interface SessionLogger {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export interface BeginOptions {
  business: { id: string; name: string; greeting: string | null } | null;
  callerPhone: string;
  /** Present only for real phone calls — how we hang up from our side. */
  callSid?: string;
  /** browser | phone — recorded on the call row so the dashboard can tell them apart. */
  channelName: 'phone' | 'browser';
}

export class CallSession {
  private history: Turn[] = [];
  private heard: string[] = [];
  private seq = 0;
  private markSeq = 0;

  /** True while we're generating or synthesizing a reply. */
  private processing = false;
  /** Audio handed over that hasn't finished playing yet: mark → sentence. */
  private unplayed = new Map<string, string>();
  /** Sentences confirmed played — i.e. the caller actually heard them. */
  private played: string[] = [];
  private bargedIn = false;
  private turn: AbortController | null = null;

  /** The Cartesia context currently streaming — what barge-in cancels. */
  private speakingContext: string | null = null;
  /** When the first audio byte of this turn hit the wire (for ttfa). */
  private firstAudioAt: number | null = null;

  private readonly tts: CartesiaTts;
  private stt: SttStream | null = null;
  private callId: string | null = null;
  private callSid = '';
  private ctx!: ToolContext;
  private readonly startedAt = Date.now();

  private endRequested = false;
  private ended = false;
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly channel: Channel,
    private readonly log: SessionLogger,
  ) {
    this.tts = new CartesiaTts(channel.ttsFormat);
  }

  /**
   * Is Vaani actually making sound right now?
   *
   * Deliberately NOT "is she thinking". Barging in on a turn that hasn't produced audio
   * yet cancels a reply the caller never heard — and since she then stays silent, the
   * caller speaks again, killing the next turn too. That deadlock is only escapable by
   * scoping barge-in to real, audible speech.
   */
  private get audible(): boolean {
    return this.speakingContext !== null || this.unplayed.size > 0;
  }

  async begin(opts: BeginOptions): Promise<void> {
    // Opening the Cartesia socket costs ~500ms. Start it now so it's warm by the time
    // the greeting needs it, instead of making the caller wait on it.
    this.tts.warm();
    this.callSid = opts.callSid ?? '';

    // Pull the whole diary into memory NOW, while we're greeting anyway, so
    // check_availability answers from RAM instead of three Supabase round trips.
    const schedule = new Schedule(opts.business?.id ?? null);
    schedule.prefetch();

    this.callId = await createCall({
      businessId: opts.business?.id ?? null,
      callSid: opts.callSid ?? `browser-${Date.now()}`,
      from: opts.callerPhone,
      to: opts.channelName,
    });

    this.ctx = {
      businessId: opts.business?.id ?? null,
      businessName: opts.business?.name ?? 'this business',
      callId: this.callId,
      callerPhone: opts.callerPhone,
      schedule,
      onEndCall: () => {
        this.endRequested = true;
      },
    };

    const services = await listServices(schedule);
    this.history = [
      { role: 'system', content: systemPrompt(this.ctx.businessName, services, nowInIndia()) },
    ];

    this.stt = openSttStream(
      {
        onSpeechStarted: () => {
          this.resetIdleTimer();
          // The caller started talking. If Vaani is mid-sentence, shut up immediately.
          if (this.audible) this.interrupt();
        },
        onFinal: (text) => this.heard.push(text),
        onUtteranceEnd: () => void this.onCallerTurn(),
        onError: (err) => this.log.error(err, 'stt error'),
      },
      this.channel.sttFormat,
    );
    this.resetIdleTimer();

    const greeting =
      opts.business?.greeting ??
      'Namaste! Main Vaani bol rahi hoon. Bataiye, main aapki kya madad kar sakti hoon?';

    await this.speak(greeting);
    this.history.push({ role: 'assistant', content: greeting });
    await this.persist('assistant', greeting, {});
  }

  /** Inbound audio frame from the caller → Deepgram. */
  feed(audio: Buffer): void {
    // Deepgram wants a plain ArrayBuffer, and a Node Buffer is a view into a larger
    // pooled one — so slice out exactly this frame's bytes.
    const frame = audio.buffer.slice(
      audio.byteOffset,
      audio.byteOffset + audio.byteLength,
    ) as ArrayBuffer;
    this.stt?.send(frame);
  }

  /**
   * Barge-in — stop talking, now. Three things must stop; miss any one and Vaani keeps
   * talking over the caller:
   *   1. Cartesia is still GENERATING     → cancel the context
   *   2. The transport has BUFFERED audio → clear its queue
   *   3. Our turn is still streaming      → abort the controller
   */
  private interrupt(): void {
    this.log.info({}, '✋ barge-in');
    this.bargedIn = true;
    if (this.speakingContext) this.tts.cancel(this.speakingContext);
    this.turn?.abort();
    this.channel.clearAudio();
    // Anything not yet played was never heard, so it must not enter the history as
    // something Vaani "said".
    this.unplayed.clear();
  }

  /** The transport finished playing a clip we sent. */
  onMarkPlayed(name: string): void {
    const sentence = this.unplayed.get(name);
    if (!sentence) return; // cleared by a barge-in — never heard
    this.unplayed.delete(name);
    this.played.push(sentence);

    // The goodbye has now actually reached their ear. Only now is it safe to hang up —
    // cutting the line when we merely SEND the audio would chop it off.
    if (this.endRequested && !this.processing && this.unplayed.size === 0) void this.hangUp();
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.ended) return;
      this.log.info({}, '⏳ caller idle — ending call');
      this.endRequested = true;
      void this.sayThenHangUp('Lagta hai aap line par nahi hain. Dhanyavaad, phir baat karte hain.');
    }, IDLE_HANGUP_MS);
  }

  private async sayThenHangUp(line: string): Promise<void> {
    await this.speak(line);
    await this.hangUp();
  }

  private async hangUp(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.log.info({}, '👋 hanging up');
    if (this.callSid) await hangUp(this.callSid);
    this.channel.close();
  }

  /** The caller finished speaking. Think, then reply. */
  private async onCallerTurn(): Promise<void> {
    // Busy with the previous turn: leave what we heard in the buffer and pick it up when
    // that turn finishes. Clearing it here would discard whatever the caller said while
    // Vaani was talking — the very words a barge-in exists to catch.
    if (this.processing) return;

    const said = this.heard.join(' ').trim();
    this.heard = [];
    if (!said) return;

    this.log.info({ said }, '👤 caller');
    this.history.push({ role: 'user', content: said });
    await this.persist('caller', said, {});

    this.processing = true;
    this.bargedIn = false;
    this.played = [];
    this.firstAudioAt = null;
    const ctrl = new AbortController();
    this.turn = ctrl;

    const t0 = Date.now();
    let queue: Promise<void> = Promise.resolve();

    // Sentences arrive as Groq writes them. Speak them in order, but don't block the
    // model on the audio — the queue preserves order without adding latency.
    const enqueue = (text: string) => {
      queue = queue.then(async () => {
        if (ctrl.signal.aborted) return;
        await this.speak(text, ctrl.signal);
      });
    };

    let result;
    try {
      result = await runTurn(
        this.history,
        this.ctx,
        enqueue,
        // A DB write takes a few hundred ms. Dead air on a call reads as "the line
        // dropped", so cover it.
        () => enqueue('Ek second, main check karti hoon.'),
        ctrl.signal,
      );
      await queue;
    } catch (err) {
      if (!ctrl.signal.aborted) this.log.error(err, 'turn failed');
    } finally {
      this.processing = false;
      this.turn = null;
    }

    const totalMs = Date.now() - t0;
    // Measured at the first audio BYTE — the moment the caller stops hearing silence,
    // which is the only latency that matters on a call.
    const ttfaMs = this.firstAudioAt ? this.firstAudioAt - t0 : null;

    // What goes into history is what the caller ACTUALLY HEARD. If they cut Vaani off,
    // the model must not believe it delivered the rest — otherwise it answers questions
    // that were never asked.
    const spoken = this.bargedIn ? this.played.join(' ') : (result?.reply ?? '');

    this.log.info(
      {
        reply: spoken,
        tools: result?.toolsUsed ?? [],
        llm_ms: result?.llmMs ?? null,
        ttfa_ms: ttfaMs,
        total_ms: totalMs,
        barged_in: this.bargedIn,
      },
      '🤖 vaani',
    );

    if (spoken) {
      this.history.push({ role: 'assistant', content: spoken });
      await this.persist('assistant', spoken, {
        ttfaMs,
        llmMs: result?.llmMs ?? null,
        totalMs,
        bargedIn: this.bargedIn,
        toolsUsed: result?.toolsUsed,
      });
    }

    if (this.callId && result?.toolsUsed.length) {
      if (result.toolsUsed.includes('book_appointment')) await setCallOutcome(this.callId, 'booked');
      else if (result.toolsUsed.includes('capture_lead')) await setCallOutcome(this.callId, 'lead');
    }

    // The caller talked over us. Their words were parked; answer them now.
    if (this.heard.length) {
      void this.onCallerTurn();
      return;
    }

    this.resetIdleTimer();

    if (this.endRequested && this.unplayed.size === 0) {
      await this.hangUp();
    } else if (this.endRequested) {
      // Backstop: if a mark ack goes missing, don't leave them on a dead line.
      setTimeout(() => void this.hangUp(), 8000);
    }
  }

  /**
   * Speak one sentence, forwarding Cartesia's audio as it is generated rather than
   * waiting for the whole sentence. This is what takes time-to-first-audio from ~1.5s
   * down to roughly one network round trip.
   */
  private async speak(text: string, signal?: AbortSignal): Promise<void> {
    const id = `utt-${this.markSeq++}`;
    this.speakingContext = id;

    try {
      await this.tts.speak(text, id, (audio) => {
        if (signal?.aborted) return;
        this.firstAudioAt ??= Date.now();
        this.channel.sendAudio(audio);
      });

      if (signal?.aborted) return;

      // Echoed back once the clip has actually finished playing — the only way to know
      // what the caller really heard.
      this.unplayed.set(id, text);
      this.channel.mark(id);
    } catch (err) {
      if (!signal?.aborted) this.log.error(err, 'tts failed');
    } finally {
      if (this.speakingContext === id) this.speakingContext = null;
    }
  }

  private async persist(
    role: 'caller' | 'assistant',
    content: string,
    metrics: {
      ttfaMs?: number | null;
      llmMs?: number | null;
      totalMs?: number | null;
      bargedIn?: boolean;
      toolsUsed?: string[];
    },
  ): Promise<void> {
    if (!this.callId) return;
    await saveTranscript({
      callId: this.callId,
      businessId: this.ctx.businessId,
      role,
      content,
      seq: this.seq++,
      ...metrics,
    });
  }

  async finish(): Promise<void> {
    this.ended = true;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.turn?.abort();
    this.stt?.close();
    this.tts.close();
    if (this.callId) await endCall(this.callId, this.startedAt);
  }
}
