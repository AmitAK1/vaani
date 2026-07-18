import { config } from '../config';

/**
 * List Cartesia voices that can speak Hindi, so we can pick one for CARTESIA_VOICE_ID.
 *   npm run voices
 */
const res = await fetch('https://api.cartesia.ai/voices?limit=100', {
  headers: {
    Authorization: `Bearer ${config.cartesia.apiKey}`,
    'Cartesia-Version': config.cartesia.version,
  },
});

if (!res.ok) {
  console.error(`Cartesia /voices ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const body = (await res.json()) as { data?: any[] } | any[];
const voices = Array.isArray(body) ? body : (body.data ?? []);

const hindi = voices.filter(
  (v) => v.language === 'hi' || (Array.isArray(v.languages) && v.languages.includes('hi')),
);

console.log(`\n${hindi.length} Hindi-capable voice(s):\n`);
for (const v of hindi) {
  console.log(`  ${v.id}  ${v.name}${v.description ? ` — ${v.description}` : ''}`);
}
console.log('\nPut one in telephony/.env as CARTESIA_VOICE_ID=<id>\n');

if (!hindi.length) {
  console.log('None tagged "hi". All voices:\n');
  for (const v of voices) console.log(`  ${v.id}  ${v.name}  [${v.language ?? '?'}]`);
}
