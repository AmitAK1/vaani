import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import type { RawData } from 'ws';
import { config } from './config';
import { BrowserChannel, TwilioChannel } from './lib/channel';
import { CallSession } from './session';
import { resolveBusinessByNumber, resolveBusinessById, firstBusiness } from './lib/db';

/**
 * Vaani.
 *
 *   caller audio → Deepgram nova-3 (language=multi → Hinglish code-switching)
 *                → Groq (tool-calling: availability, booking, leads)
 *                → Cartesia Sonic → caller
 *
 *   GET  /health          → liveness
 *   POST /voice           → TwiML pointing the phone call at /media-stream
 *   WS   /media-stream    → a phone conversation  (Twilio Media Streams, μ-law 8k)
 *   WS   /browser-stream  → the same conversation, in a browser tab (PCM)
 *
 * Both sockets run the SAME engine (see session.ts) — the browser demo is the real
 * thing, not a lookalike. It exists because no judge is going to dial a US trial
 * number from India.
 */

const fastify = Fastify({ logger: true });

fastify.addContentTypeParser(
  'application/x-www-form-urlencoded',
  { parseAs: 'string' },
  (_req, body, done) => done(null, body),
);

// The dashboard is served from another origin (Vercel) and opens the browser socket.
await fastify.register(cors, { origin: true });
await fastify.register(websocket);

fastify.get('/health', async () => ({ ok: true, service: 'vaani-telephony' }));

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Twilio voice webhook ─────────────────────────────────────────────────────
fastify.post('/voice', async (request, reply) => {
  const form = new URLSearchParams(request.body as string);
  const host = config.publicHostname || 'CONFIGURE_PUBLIC_HOSTNAME';

  // Direction matters: on an INBOUND call the customer is `From` and the business is
  // `To`, but when Vaani rings someone (outbound rescue, `npm run callme`) it's the
  // other way round. Getting this backwards looks the customer up as if they were a tenant.
  const params = (['From', 'To', 'CallSid', 'Direction'] as const)
    .map((k) => `<Parameter name="${k}" value="${xmlEscape(form.get(k) ?? '')}" />`)
    .join('\n      ');

  reply.header('Content-Type', 'text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${host}/media-stream">
      ${params}
    </Stream>
  </Connect>
</Response>`);
});

// ── A phone call ─────────────────────────────────────────────────────────────
fastify.get('/media-stream', { websocket: true }, (ws) => {
  let session: CallSession | null = null;

  ws.on('message', async (raw: RawData) => {
    let msg: {
      event?: string;
      start?: { streamSid?: string; customParameters?: Record<string, string> };
      media?: { payload?: string };
      mark?: { name?: string };
    };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.event) {
      case 'start': {
        const streamSid = msg.start?.streamSid;
        const p = msg.start?.customParameters ?? {};
        if (!streamSid) break;

        const outbound = (p.Direction ?? '').startsWith('outbound');
        const customer = outbound ? (p.To ?? '') : (p.From ?? '');
        const businessNumber = outbound ? (p.From ?? '') : (p.To ?? '');

        fastify.log.info({ customer, businessNumber, direction: p.Direction }, '📞 call started');

        session = new CallSession(new TwilioChannel(ws, streamSid), fastify.log);
        await session.begin({
          business: await resolveBusinessByNumber(businessNumber),
          callerPhone: customer,
          callSid: p.CallSid,
          channelName: 'phone',
        });
        break;
      }

      case 'media':
        if (msg.media?.payload) session?.feed(Buffer.from(msg.media.payload, 'base64'));
        break;

      case 'mark':
        if (msg.mark?.name) session?.onMarkPlayed(msg.mark.name);
        break;

      case 'stop':
        await session?.finish();
        session = null;
        break;
    }
  });

  ws.on('close', async () => {
    await session?.finish();
    fastify.log.info('media stream closed');
  });
});

// ── The same conversation, in a browser ──────────────────────────────────────
// The page sends raw 16kHz PCM as binary frames and JSON for everything else.
fastify.get('/browser-stream', { websocket: true }, (ws) => {
  let session: CallSession | null = null;

  ws.on('message', async (raw: RawData, isBinary: boolean) => {
    // Binary = microphone audio. Everything else is control JSON.
    if (isBinary) {
      session?.feed(Buffer.from(raw as Buffer));
      return;
    }

    let msg: { type?: string; businessId?: string; name?: string };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case 'start': {
        if (session) break;
        // The dashboard names a tenant; fall back to the seeded demo business so the
        // widget works on a bare page with no query string.
        const business = msg.businessId
          ? await resolveBusinessById(msg.businessId)
          : await firstBusiness();

        fastify.log.info({ business: business?.name }, '🌐 browser call started');

        session = new CallSession(new BrowserChannel(ws), fastify.log);
        await session.begin({
          business,
          callerPhone: 'web',
          channelName: 'browser',
        });
        break;
      }

      case 'mark':
        if (msg.name) session?.onMarkPlayed(msg.name);
        break;

      case 'stop':
        await session?.finish();
        session = null;
        break;
    }
  });

  ws.on('close', async () => {
    await session?.finish();
    fastify.log.info('browser stream closed');
  });
});

// ── Boot ─────────────────────────────────────────────────────────────────────
try {
  await fastify.listen({ port: config.port, host: '0.0.0.0' });
  fastify.log.info(`Vaani listening on :${config.port}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
