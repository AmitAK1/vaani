import WebSocket from 'ws';
import { config } from '../config';

/**
 * Open Deepgram's live socket by hand, so we can read the ACTUAL HTTP rejection.
 * The SDK collapses every handshake failure into "network error or non-101",
 * which tells you nothing about which param it hated.
 *   npm run sttcheck
 */

const params = new URLSearchParams({
  model: config.deepgram.model,
  language: 'multi',
  encoding: 'mulaw',
  sample_rate: '8000',
  channels: '1',
  punctuate: 'true',
  interim_results: 'true',
  vad_events: 'true',
  endpointing: '100',
  utterance_end_ms: '1000',
});

const url = `wss://api.deepgram.com/v1/listen?${params}`;
console.log(`connecting: ${url}\n`);

const ws = new WebSocket(url, {
  headers: { Authorization: `Token ${config.deepgram.apiKey}` },
});

ws.on('upgrade', (res) => console.log(`handshake status: ${res.statusCode}`));

ws.on('unexpected-response', (_req, res) => {
  let body = '';
  res.on('data', (c) => (body += c));
  res.on('end', () => {
    console.error(`\n❌ REJECTED  HTTP ${res.statusCode} ${res.statusMessage}`);
    console.error(`   body: ${body}`);
    process.exit(1);
  });
});

ws.on('open', () => {
  console.log('\n✅ OPEN — Deepgram accepted these params.');
  ws.send(Buffer.alloc(8000, 0xff)); // 1s of μ-law silence
  setTimeout(() => {
    ws.close();
    process.exit(0);
  }, 3000);
});

ws.on('message', (m) => console.log('←', m.toString().slice(0, 200)));
ws.on('error', (e) => console.error('socket error:', e.message));

setTimeout(() => {
  console.error('\n❌ timed out');
  process.exit(1);
}, 12000);
