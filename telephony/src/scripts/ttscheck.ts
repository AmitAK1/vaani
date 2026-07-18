import { CartesiaTts } from '../lib/tts';

/**
 * Measure time-to-first-audio on the Cartesia WebSocket, so we can prove the
 * latency fix without burning a phone call.
 *   npm run ttscheck
 */

const LINE =
  'Namaste! Sunrise Dental Clinic mein aapka swagat hai. Kal subah gyarah baje ka slot khaali hai.';

const tts = new CartesiaTts();

for (const attempt of [1, 2, 3]) {
  const t0 = Date.now();
  let firstChunkAt = 0;
  let bytes = 0;

  await tts.speak(LINE, `bench-${attempt}`, (mulaw) => {
    if (!firstChunkAt) firstChunkAt = Date.now();
    bytes += mulaw.length;
  });

  const ttfa = firstChunkAt - t0;
  const total = Date.now() - t0;
  // μ-law 8kHz mono = 8000 bytes per second of audio.
  const audioSecs = (bytes / 8000).toFixed(1);

  const label = attempt === 1 ? '(includes socket connect)' : '';
  console.log(
    `run ${attempt}:  time-to-first-audio ${ttfa}ms   full synthesis ${total}ms   ${audioSecs}s of audio ${label}`,
  );
}

tts.close();
console.log('\nBefore (REST): 1422–2942ms to first audio. Anything under ~400ms here is the win.');
process.exit(0);
