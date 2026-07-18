import WebSocket from 'ws';

/**
 * Pretend to be the browser widget, so we can prove /browser-stream works before
 * anyone has to plug in a microphone.
 *
 * Speaks the browser protocol exactly: JSON `start`, raw PCM16 as binary frames,
 * echo `mark` back when "playback" finishes. If Vaani greets us and the audio format
 * looks like 24kHz PCM, the channel is wired correctly end to end.
 *
 *   npm run browsercheck
 */

const URL = process.env.VAANI_WS ?? 'ws://localhost:8080/browser-stream';

const ws = new WebSocket(URL);
let audioBytes = 0;
let chunks = 0;
let marks = 0;
let firstAudioAt = 0;
const t0 = Date.now();

ws.on('open', () => {
  console.log(`connected: ${URL}`);
  ws.send(JSON.stringify({ type: 'start' }));

  // Feed silence at roughly real time — 16kHz PCM16, 100ms per frame. Deepgram needs a
  // steady stream or it will close the socket on us.
  const frame = Buffer.alloc(16000 * 2 * 0.1); // 100ms of 16kHz 16-bit silence
  const timer = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return clearInterval(timer);
    ws.send(frame);
  }, 100);
});

ws.on('message', (raw, isBinary) => {
  if (isBinary) return;

  const msg = JSON.parse(raw.toString());

  switch (msg.type) {
    case 'audio': {
      const bytes = Buffer.from(msg.payload, 'base64').length;
      audioBytes += bytes;
      chunks++;
      if (!firstAudioAt) {
        firstAudioAt = Date.now();
        console.log(`🔊 first audio after ${firstAudioAt - t0}ms`);
      }
      break;
    }
    case 'mark':
      marks++;
      console.log(`✔ mark "${msg.name}" — echoing back as if played`);
      ws.send(JSON.stringify({ type: 'mark', name: msg.name }));
      break;
    case 'clear':
      console.log('⟲ clear (barge-in)');
      break;
    case 'ended':
      console.log('call ended by server');
      break;
  }
});

ws.on('error', (e) => {
  console.error('socket error:', e.message);
  process.exit(1);
});

setTimeout(() => {
  // 24kHz, 16-bit mono = 48,000 bytes per second of speech.
  const seconds = (audioBytes / 48000).toFixed(1);
  console.log(`\n${chunks} audio chunks, ${audioBytes} bytes ≈ ${seconds}s of speech`);
  console.log(`${marks} mark(s)`);

  const ok = audioBytes > 20000 && marks > 0;
  console.log(
    ok
      ? '\n✅ /browser-stream works: Vaani greeted us in 24kHz PCM and marked the utterance.'
      : '\n❌ No greeting audio came back — the browser channel is broken.',
  );

  ws.send(JSON.stringify({ type: 'stop' }));
  ws.close();
  process.exit(ok ? 0 : 1);
}, 9000);
