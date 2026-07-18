import 'dotenv/config';

/**
 * Centralised, typed config. Missing values warn (not throw) so the server can
 * boot in Phase 0 before all accounts exist. Phase 1+ will hard-require keys
 * that a given feature needs.
 */
function read(name: string, { required = false }: { required?: boolean } = {}): string {
  const v = process.env[name]?.trim() ?? '';
  if (!v && required) {
    console.warn(`[config] ⚠️  Missing env var: ${name} (some features will not work yet)`);
  }
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  // The host Twilio dials back into for the media stream. Locally this is the ngrok
  // domain (set in .env). In the cloud the platform injects its own hostname at runtime
  // (Render → RENDER_EXTERNAL_HOSTNAME, Hugging Face Spaces → SPACE_HOST), so a deploy
  // needs no manual hostname step and can never point at a stale tunnel.
  publicHostname:
    read('PUBLIC_HOSTNAME') ||
    process.env.RENDER_EXTERNAL_HOSTNAME?.trim() ||
    process.env.SPACE_HOST?.trim() ||
    '',
  groq: {
    apiKey: read('GROQ_API_KEY', { required: true }),
    // gpt-oss-120b tool-calls reliably. llama-3.3-70b did not: it wrote calls out as
    // literal <function=...> XML, which the TTS then read aloud to the caller, and it
    // booked a slot the caller never agreed to. Both reproduced by `npm run llmcheck`.
    model: process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b',
  },
  deepgram: {
    apiKey: read('DEEPGRAM_API_KEY', { required: true }),
    // nova-3 + language=multi is the only combo that handles Hinglish code-switching
    // inside a single streaming session. nova-2's `multi` is Spanish+English only.
    model: process.env.DEEPGRAM_MODEL?.trim() || 'nova-3',
  },
  cartesia: {
    apiKey: read('CARTESIA_API_KEY', { required: true }),
    model: process.env.CARTESIA_MODEL?.trim() || 'sonic-3.5',
    voiceId: read('CARTESIA_VOICE_ID'),
    version: '2026-03-01',
  },
  twilio: {
    accountSid: read('TWILIO_ACCOUNT_SID', { required: true }),
    authToken: read('TWILIO_AUTH_TOKEN', { required: true }),
    phoneNumber: read('TWILIO_PHONE_NUMBER'),
  },
  supabase: {
    url: read('SUPABASE_URL', { required: true }),
    serviceRoleKey: read('SUPABASE_SERVICE_ROLE_KEY', { required: true }),
  },
} as const;
