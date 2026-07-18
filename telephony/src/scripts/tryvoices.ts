import { writeFile, mkdir } from 'node:fs/promises';
import { config } from '../config';

/**
 * Render the same Hinglish receptionist line in each candidate voice, so we can
 * actually LISTEN before committing to CARTESIA_VOICE_ID. Cartesia's "native
 * Hinglish" claim is vendor marketing — this is how we check it.
 *
 *   npm run tryvoices     → writes samples/*.wav
 */

// A real receptionist turn: code-switches mid-sentence, has an Indian name, a
// time, and a business name. These are exactly the things a bad TTS mangles.
const LINE =
  'Namaste! Sunrise Dental Clinic mein aapka swagat hai. Main Vaani bol rahi hoon. ' +
  'Aapka appointment kal shaam paanch baje confirm ho gaya hai, Dr. Mehra ke saath. ' +
  'Kya main aapko SMS bhej doon?';

const CANDIDATES = [
  ['arushi-hinglish', '95d51f79-c397-46f9-b49a-23763d3eaa2d'],
  ['parvati-support', 'bec003e2-3cb3-429c-8468-206a393c67ad'],
  ['siya-bright', '4459a9a5-69d6-4680-b970-e13dc51845b6'],
  ['sneha-empathetic', '6b02ffe5-e3cb-48c0-a023-c72f85953375'],
  ['riya-friendly', 'faf0731e-dfb9-4cfc-8119-259a79b27e12'],
];

await mkdir('samples', { recursive: true });

for (const [label, voiceId] of CANDIDATES) {
  const res = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.cartesia.apiKey}`,
      'Cartesia-Version': config.cartesia.version,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_id: config.cartesia.model,
      transcript: LINE,
      voice: { mode: 'id', id: voiceId },
      language: 'hi',
      // WAV here so you can just double-click it. Production uses raw mulaw/8000.
      output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 44100 },
    }),
  });

  if (!res.ok) {
    console.error(`❌ ${label}: ${res.status} ${await res.text()}`);
    continue;
  }

  const path = `samples/${label}.wav`;
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
  console.log(`✅ ${path}   (${voiceId})`);
}

console.log('\nListen, then set CARTESIA_VOICE_ID in telephony/.env to the winner.\n');
