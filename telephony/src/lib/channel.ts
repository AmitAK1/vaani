import type { WebSocket } from 'ws';

/**
 * A transport the conversation engine can talk over.
 *
 * The engine (STT → Groq → TTS, barge-in, tools) is identical whether the caller is
 * on a phone or in a browser tab. Only the plumbing differs: Twilio speaks μ-law 8k
 * over its Media Stream protocol; a browser speaks PCM over a plain WebSocket. So the
 * engine talks to THIS, and the differences live in the two implementations below.
 *
 * The judges will use the browser one — nobody in India is dialling a US trial number.
 */
export interface Channel {
  /** Audio format we ask Deepgram to expect. */
  readonly sttFormat: { encoding: string; sampleRate: number };
  /** Audio format we ask Cartesia to produce. */
  readonly ttsFormat: { container: string; encoding: string; sampleRate: number };

  /** Push synthesized audio to the listener. */
  sendAudio(audio: Buffer): void;
  /**
   * Discard audio already handed over but not yet heard. This is what makes barge-in
   * real: both Twilio and the browser BUFFER ahead, so "stop sending" isn't enough.
   */
  clearAudio(): void;
  /** Tag the end of an utterance; the transport echoes it back once actually played. */
  mark(name: string): void;
  /** Hang up / close from our side. */
  close(): void;
}

/** Twilio Media Streams: μ-law 8kHz both directions, its own JSON event protocol. */
export class TwilioChannel implements Channel {
  readonly sttFormat = { encoding: 'mulaw', sampleRate: 8000 };
  readonly ttsFormat = { container: 'raw', encoding: 'pcm_mulaw', sampleRate: 8000 };

  constructor(
    private readonly ws: WebSocket,
    private readonly streamSid: string,
  ) {}

  sendAudio(audio: Buffer): void {
    // Twilio plays media frames in the order received; keep each modest (~400ms).
    const CHUNK = 3200;
    for (let i = 0; i < audio.length; i += CHUNK) {
      this.ws.send(
        JSON.stringify({
          event: 'media',
          streamSid: this.streamSid,
          media: { payload: audio.subarray(i, i + CHUNK).toString('base64') },
        }),
      );
    }
  }

  clearAudio(): void {
    this.ws.send(JSON.stringify({ event: 'clear', streamSid: this.streamSid }));
  }

  mark(name: string): void {
    this.ws.send(JSON.stringify({ event: 'mark', streamSid: this.streamSid, mark: { name } }));
  }

  close(): void {
    // The phone call is ended over Twilio's REST API (see lib/twilio.ts), not here.
  }
}

/**
 * A browser tab. Mic in as 16kHz PCM, speech out as 24kHz PCM.
 *
 * No μ-law: browsers can't play it without decoding, and there's no 8kHz phone line
 * to squeeze through — so we use the better-sounding format the web gives us for free.
 */
export class BrowserChannel implements Channel {
  readonly sttFormat = { encoding: 'linear16', sampleRate: 16000 };
  readonly ttsFormat = { container: 'raw', encoding: 'pcm_s16le', sampleRate: 24000 };

  constructor(private readonly ws: WebSocket) {}

  sendAudio(audio: Buffer): void {
    this.ws.send(JSON.stringify({ type: 'audio', payload: audio.toString('base64') }));
  }

  clearAudio(): void {
    this.ws.send(JSON.stringify({ type: 'clear' }));
  }

  mark(name: string): void {
    // The page echoes this back once the clip has finished coming out of the speakers,
    // which is how we know what the user actually heard when they talk over Vaani.
    this.ws.send(JSON.stringify({ type: 'mark', name }));
  }

  close(): void {
    this.ws.send(JSON.stringify({ type: 'ended' }));
  }
}
