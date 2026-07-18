import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { config } from '../config';

const deepgram = createClient(config.deepgram.apiKey);

export interface SttHandlers {
  /** Caller started talking — used for barge-in. */
  onSpeechStarted?: () => void;
  /** A stable, punctuated chunk of caller speech. */
  onFinal: (text: string) => void;
  /** Caller stopped talking; their turn is over. */
  onUtteranceEnd?: () => void;
  onError?: (err: unknown) => void;
}

export interface SttStream {
  send(audio: ArrayBuffer): void;
  close(): void;
}

/**
 * Open a Deepgram streaming connection for one call.
 *
 * `language: 'multi'` on nova-3 is what makes Hinglish work — the caller can
 * code-switch mid-sentence without us pinning a language up front. (nova-2's
 * `multi` is Spanish+English only, so the model choice is load-bearing.)
 *
 * Audio params match Twilio Media Streams exactly, so frames go straight in with
 * no resampling.
 */
export function openSttStream(
  handlers: SttHandlers,
  format: { encoding: string; sampleRate: number } = { encoding: 'mulaw', sampleRate: 8000 },
): SttStream {
  const connection = deepgram.listen.live({
    model: config.deepgram.model,
    language: 'multi',
    encoding: format.encoding,
    sample_rate: format.sampleRate,
    channels: 1,
    punctuate: true,
    interim_results: true,
    vad_events: true, // gives us SpeechStarted, which drives barge-in
    endpointing: 100, // Deepgram's recommended value for code-switching
    utterance_end_ms: 1000,
  });

  // The socket takes ~1s to come up, but Twilio starts sending audio immediately.
  // Those frames used to be dropped on the floor, so a caller who spoke straight
  // away lost their first second. Hold them until Deepgram is listening.
  let open = false;
  const backlog: ArrayBuffer[] = [];
  const MAX_BACKLOG = 250; // ~5s of 20ms frames; beyond that something is wrong

  connection.on(LiveTranscriptionEvents.Open, () => {
    open = true;
    for (const frame of backlog) connection.send(frame);
    console.log(`[stt] open (flushed ${backlog.length} buffered frames)`);
    backlog.length = 0;
  });

  // Barge-in fires on the first real WORD, not on Deepgram's VAD SpeechStarted.
  // SpeechStarted triggers on any sound — a cough, line hiss, the caller's own
  // handset leaking Vaani's voice back into the mic — and on a live call that cut
  // her off mid-reply before she'd said anything. Costs ~200ms of extra latency
  // and buys a barge-in that only a human voice can trigger.
  let spokeThisUtterance = false;

  connection.on(LiveTranscriptionEvents.Transcript, (data) => {
    const text: string = data.channel?.alternatives?.[0]?.transcript ?? '';
    if (!text.trim()) return;

    console.log(`[stt] ${data.is_final ? 'final' : 'interim'}: ${text}`);

    if (!spokeThisUtterance) {
      spokeThisUtterance = true;
      handlers.onSpeechStarted?.();
    }
    if (!data.is_final) return;

    handlers.onFinal(text.trim());

    // `speech_final` is Deepgram's endpointer saying "they've stopped talking",
    // and it lands ~100ms after the caller falls silent. UtteranceEnd only fires
    // after `utterance_end_ms` (1s) of silence — so triggering the reply on that
    // put a full second of dead air in front of EVERY turn. Answer on speech_final
    // and keep UtteranceEnd only as a backstop for when the endpointer misses.
    if (data.speech_final) {
      spokeThisUtterance = false;
      handlers.onUtteranceEnd?.();
    }
  });

  connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
    spokeThisUtterance = false;
    handlers.onUtteranceEnd?.();
  });

  connection.on(LiveTranscriptionEvents.Error, (err) => {
    console.error('[stt] error', JSON.stringify(err, Object.getOwnPropertyNames(err ?? {})));
    handlers.onError?.(err);
  });

  connection.on(LiveTranscriptionEvents.Close, () => {
    open = false;
  });

  return {
    send(audio: ArrayBuffer) {
      if (open) connection.send(audio);
      else if (backlog.length < MAX_BACKLOG) backlog.push(audio);
    },
    close() {
      connection.requestClose();
    },
  };
}
