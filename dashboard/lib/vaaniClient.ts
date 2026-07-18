/**
 * Browser end of the Vaani voice channel.
 *
 * Mic  → 16kHz PCM16 → WebSocket → Deepgram
 * Speech ← 24kHz PCM16 ← WebSocket ← Cartesia
 *
 * The fiddly part is barge-in. We schedule audio ahead of the clock so it plays
 * gaplessly, which means at any moment there is speech QUEUED but not yet heard.
 * When the user talks over Vaani the server sends `clear`, and we must drop that
 * queue — otherwise she keeps talking for another second. And we only echo a `mark`
 * back once its audio has actually finished coming out of the speakers, because the
 * server uses those marks to know what the user really heard.
 */

const MIC_SAMPLE_RATE = 16000; // what we send to Deepgram
const TTS_SAMPLE_RATE = 24000; // what Cartesia sends back

export type VaaniState = 'idle' | 'connecting' | 'listening' | 'speaking';

export interface VaaniHandlers {
  onState?: (state: VaaniState) => void;
  onError?: (message: string) => void;
  onEnded?: () => void;
}

export class VaaniClient {
  private ws: WebSocket | null = null;
  private micContext: AudioContext | null = null;
  private playContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;

  /** When the next audio chunk should start, on the playback clock. */
  private nextStartAt = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private markTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    private readonly url: string,
    private readonly handlers: VaaniHandlers = {},
  ) {}

  async start(businessId?: string): Promise<void> {
    this.handlers.onState?.('connecting');

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true, // stops Vaani's own voice barging herself in
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.playContext = new AudioContext({ sampleRate: TTS_SAMPLE_RATE });
    this.micContext = new AudioContext();

    const ws = new WebSocket(this.url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'start', businessId }));
      this.pipeMicrophone();
      this.handlers.onState?.('listening');
    };

    ws.onmessage = (e) => this.onServerMessage(e.data);
    ws.onerror = () => this.handlers.onError?.('Connection to Vaani failed.');
    ws.onclose = () => this.stop();
  }

  /** Capture the mic, downsample to 16kHz, ship it as raw PCM16. */
  private pipeMicrophone(): void {
    const ctx = this.micContext!;
    const source = ctx.createMediaStreamSource(this.stream!);

    // ScriptProcessor is deprecated but universally supported, and an AudioWorklet
    // needs a separate module file — not worth it for a demo widget.
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    this.processor = processor;

    const ratio = ctx.sampleRate / MIC_SAMPLE_RATE;

    processor.onaudioprocess = (e) => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;

      const input = e.inputBuffer.getChannelData(0);
      const outLength = Math.floor(input.length / ratio);
      const pcm = new Int16Array(outLength);

      for (let i = 0; i < outLength; i++) {
        const sample = input[Math.floor(i * ratio)];
        // Float [-1,1] → signed 16-bit.
        pcm[i] = Math.max(-1, Math.min(1, sample)) * 0x7fff;
      }

      this.ws.send(pcm.buffer);
    };

    source.connect(processor);
    // ScriptProcessor only fires while connected to a destination. Route it through a
    // muted gain node so nothing is echoed back into the room.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    processor.connect(mute);
    mute.connect(ctx.destination);
  }

  private onServerMessage(data: string): void {
    let msg: { type?: string; payload?: string; name?: string };
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'audio':
        if (msg.payload) this.enqueueAudio(msg.payload);
        break;

      case 'clear':
        // Barge-in: the user is talking. Kill everything queued but unheard.
        this.stopPlayback();
        this.handlers.onState?.('listening');
        break;

      case 'mark':
        // Echo it back only when this clip has finished PLAYING, not when it arrives.
        if (msg.name) this.markWhenPlayed(msg.name);
        break;

      case 'ended':
        this.handlers.onEnded?.();
        this.stop();
        break;
    }
  }

  private enqueueAudio(base64: string): void {
    const ctx = this.playContext;
    if (!ctx) return;

    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);

    const buffer = ctx.createBuffer(1, pcm.length, TTS_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    // Schedule back-to-back so the speech is gapless, never before "now".
    const startAt = Math.max(ctx.currentTime, this.nextStartAt);
    src.start(startAt);
    this.nextStartAt = startAt + buffer.duration;

    this.sources.add(src);
    src.onended = () => this.sources.delete(src);

    this.handlers.onState?.('speaking');
  }

  /** Tell the server this utterance was actually heard, once it finishes playing. */
  private markWhenPlayed(name: string): void {
    const ctx = this.playContext;
    if (!ctx) return;

    const msUntilDone = Math.max(0, (this.nextStartAt - ctx.currentTime) * 1000);
    const timer = setTimeout(() => {
      this.markTimers.delete(timer);
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'mark', name }));
      }
      if (this.sources.size === 0) this.handlers.onState?.('listening');
    }, msUntilDone);

    this.markTimers.add(timer);
  }

  private stopPlayback(): void {
    for (const src of this.sources) {
      try {
        src.stop();
      } catch {
        // already finished
      }
    }
    this.sources.clear();

    // Those marks must never be echoed — that audio was cut off and never heard, and
    // telling the server otherwise would make Vaani think she said things she didn't.
    for (const t of this.markTimers) clearTimeout(t);
    this.markTimers.clear();

    this.nextStartAt = this.playContext?.currentTime ?? 0;
  }

  stop(): void {
    this.stopPlayback();

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'stop' }));
      this.ws.close();
    }
    this.ws = null;

    this.processor?.disconnect();
    this.processor = null;

    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;

    void this.micContext?.close();
    void this.playContext?.close();
    this.micContext = null;
    this.playContext = null;

    this.handlers.onState?.('idle');
  }
}
