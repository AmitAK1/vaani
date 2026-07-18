import WebSocket from 'ws';
import { config } from '../config';

/**
 * Cartesia Sonic text-to-speech over a persistent WebSocket.
 *
 * Why not the REST endpoint: REST only answers once the WHOLE sentence is
 * synthesized, so time-to-first-audio was 1.4–2.9s on real calls. Over the socket
 * Cartesia streams audio chunks as it generates them, so we can start pushing
 * bytes to Twilio within ~100ms and the caller hears speech while the rest is
 * still being made.
 *
 * It also gives us `cancel`, which is what lets barge-in stop Vaani mid-WORD
 * instead of mid-sentence.
 *
 * Audio comes out as raw μ-law 8kHz — byte-for-byte what Twilio Media Streams
 * wants, no transcoding.
 */

type Pending = {
  onAudio: (mulaw: Buffer) => void;
  resolve: () => void;
  reject: (e: Error) => void;
};

export class CartesiaTts {
  private ws: WebSocket | null = null;
  private ready: Promise<void> | null = null;
  /** context_id → the utterance currently being streamed under it. */
  private pending = new Map<string, Pending>();

  /**
   * Output format is per-transport: μ-law 8kHz for a phone line, 24kHz PCM for a
   * browser tab. Cartesia emits either natively, so neither path needs transcoding.
   */
  constructor(
    private readonly format: { container: string; encoding: string; sampleRate: number } = {
      container: 'raw',
      encoding: 'pcm_mulaw',
      sampleRate: 8000,
    },
  ) {}

  /**
   * Open the socket ahead of time. Establishing it costs ~500ms, and if we leave
   * that until the first `speak()` the caller wears it on the greeting. Call this
   * as soon as the call connects, while we're busy doing DB lookups anyway.
   */
  warm(): void {
    void this.connect().catch(() => {}); // failure surfaces on the real speak()
  }

  private connect(): Promise<void> {
    if (this.ready) return this.ready;

    this.ready = new Promise((resolve, reject) => {
      const url = `wss://api.cartesia.ai/tts/websocket?cartesia_version=${config.cartesia.version}`;
      const ws = new WebSocket(url, { headers: { 'X-API-Key': config.cartesia.apiKey } });
      this.ws = ws;

      ws.on('open', () => resolve());
      ws.on('error', (err) => {
        this.failAll(err as Error);
        reject(err);
      });
      ws.on('close', () => {
        this.failAll(new Error('cartesia socket closed'));
        this.ws = null;
        this.ready = null;
      });

      ws.on('message', (raw) => {
        let msg: any;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }

        const p = this.pending.get(msg.context_id);
        if (!p) return; // a cancelled utterance still trickling in — drop it

        if (msg.type === 'chunk' && msg.data) {
          p.onAudio(Buffer.from(msg.data, 'base64'));
        } else if (msg.type === 'done') {
          this.pending.delete(msg.context_id);
          p.resolve();
        } else if (msg.type === 'error') {
          this.pending.delete(msg.context_id);
          p.reject(new Error(msg.message ?? 'cartesia error'));
        }
      });
    });

    return this.ready;
  }

  private failAll(err: Error): void {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  /**
   * Speak one sentence. `onAudio` fires repeatedly as chunks arrive — forward them
   * to Twilio immediately; don't wait for the returned promise, which only settles
   * when the whole sentence has been generated.
   */
  async speak(text: string, contextId: string, onAudio: (mulaw: Buffer) => void): Promise<void> {
    await this.connect();
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error('cartesia not connected');

    return new Promise<void>((resolve, reject) => {
      this.pending.set(contextId, { onAudio, resolve, reject });
      ws.send(
        JSON.stringify({
          model_id: config.cartesia.model,
          transcript: text,
          voice: { mode: 'id', id: config.cartesia.voiceId },
          // "hi" carries Hinglish; an English-tagged voice reads romanized Hindi
          // with English prosody, which is the failure we left Deepgram TTS over.
          language: 'hi',
          output_format: {
            container: this.format.container,
            encoding: this.format.encoding,
            sample_rate: this.format.sampleRate,
          },
          context_id: contextId,
          continue: false,
        }),
      );
    });
  }

  /** Barge-in: stop generating this utterance server-side, right now. */
  cancel(contextId: string): void {
    const p = this.pending.get(contextId);
    if (!p) return;
    this.pending.delete(contextId);
    p.resolve(); // not an error — we meant to stop it
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ context_id: contextId, cancel: true }));
    }
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
    this.ready = null;
  }
}
