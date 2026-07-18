# Vaani — the AI receptionist that never misses a call

An AI **phone receptionist** for Indian small businesses (clinics, salons, dentists,
repair shops) that lose customers every day to missed calls. Vaani answers a **real phone
number** — or a browser mic — 24/7 in **Hinglish** (natural Hindi-English code-switching),
**books appointments live** while the caller is still on the line, captures leads, sends an
**SMS confirmation**, and shows the owner a **realtime dashboard** of every call.

> FlowZint AI Hackathon 2026 · Category: Customer Care Bot · Solo build

### ▶ Try it right now
- **🔴 Live demo (browser):** https://vaani-rosy.vercel.app — click **Talk** and book an appointment in Hinglish. It's the *same engine* that answers the phone, running in your browser.
- **📞 Real phone number:** +1 650 582 4480
- **🎥 Demo video:** _add link_

---

## What it does
- **Answers every call, 24/7** — no missed call, no lost customer.
- **Speaks Hinglish** — understands code-switching mid-sentence (*"kal subah saade das baje"*), not stiff textbook Hindi.
- **Books appointments live** — checks real availability, locks the exact agreed slot, and confirms before hanging up.
- **Captures leads** — takes a name and reason even when the caller doesn't book.
- **Texts a confirmation** — an SMS with the date, time, and a confirmation code.
- **Lets you interrupt her** — barge in mid-sentence and she stops instantly, like a person.
- **Sub-second replies** — time-to-first-word stays under a second, so it never feels like a bot.
- **Live owner dashboard** — transcripts, bookings, and per-turn latency update in realtime as the call happens.

## What makes it different
- **One engine, two transports.** A `Channel` abstraction runs the *identical* pipeline over a phone call (Twilio Media Streams) or a browser mic. The public browser demo is the real product, not a mock — which matters because judges will never dial a US trial number.
- **Barge-in done right.** Twilio buffers audio ahead, so stopping the stream isn't enough — Vaani flushes the buffer (`clear`) and tracks `mark` events to know what the caller actually heard, then truncates her own memory to only what was spoken.
- **Books the slot you actually said.** The model can't reliably do Hindi clock arithmetic (*"saade das"* → it once booked 12:30), so each open slot is labelled in the exact Hinglish the caller will say — turning a translation into a string match.
- **Tuned for real latency.** Sentence-chunked streaming TTS, a pre-warmed voice socket, and prefetched availability bring each turn to ~500–650 ms.

---

## Architecture

```
 Caller ──dials──▶ Twilio number ─┐          Browser mic ──▶ /browser-stream ─┐
   (Media Streams, μ-law 8kHz)    │            (PCM16, WebSocket)             │
                                  ▼                                          ▼
                    ┌───────────────────────────────────────────────────────────┐
                    │  telephony/  (Node + Fastify + ws)   — one engine          │
                    │    Channel abstraction (phone ⇄ browser)                   │
                    │    audio ─▶ Deepgram nova-3 STT (language=multi, Hinglish) │
                    │          ─▶ Groq gpt-oss-120b (conversation + tool-calls)  │
                    │             tools: check_availability, book_appointment,   │
                    │                    capture_lead, end_call                  │
                    │          ─▶ Cartesia Sonic TTS ─▶ back to caller           │
                    └───────────────┬───────────────────────────────────────────┘
                                    │ writes calls / transcripts / bookings / leads
                                    ▼
                        Supabase (Postgres + Realtime) ──▶ Twilio SMS confirmation
                                    │ realtime
                                    ▼
                    dashboard/  (Next.js 15, on Vercel) — live calls, transcripts,
                                                          bookings, latency
```

## Tech stack
| Layer | Choice | Why |
|---|---|---|
| Speech-to-text | **Deepgram nova-3** (`language=multi`) | the only model whose `multi` includes Hindi — survives Hinglish code-switching in one stream |
| Brain | **Groq `gpt-oss-120b`** | native, reliable tool-calling (llama-3.3 emitted tool calls as XML the TTS read aloud) |
| Text-to-speech | **Cartesia Sonic** | natural Hindi voice, native μ-law 8kHz for phone (Deepgram Aura has no Hindi voice) |
| Telephony + SMS | **Twilio** | Programmable Voice + Media Streams + Messaging |
| Data | **Supabase** | Postgres + Realtime (dashboard updates live) |
| Dashboard | **Next.js 15** on **Vercel** | one-page owner console |

## Repo layout
```
vaani/
├── db/                        # Postgres schema + migrations (run in Supabase SQL editor)
├── telephony/                 # Node + TS voice engine (the backend)
│   ├── src/
│   │   ├── server.ts          # Fastify HTTP + /media-stream + /browser-stream
│   │   ├── session.ts         # transport-agnostic call engine (barge-in, tools, latency)
│   │   ├── config.ts          # typed env loader
│   │   └── lib/
│   │       ├── channel.ts     # phone ⇄ browser transport abstraction
│   │       ├── stt.ts tts.ts llm.ts tools.ts schedule.ts sms.ts twilio.ts
│   │   └── scripts/           # offline verification (llmcheck, dedupcheck, browsercheck, …)
│   ├── Dockerfile             # container image (for Render / HF / any host)
│   └── render.yaml is at repo root
└── dashboard/                 # Next.js 15 owner dashboard (deployed to Vercel)
```

---

## Run it locally

```bash
# 1) the voice engine
cd telephony
cp .env.example .env          # fill in the keys (see below)
npm install
npm run start                 # http://localhost:8080

# 2) the dashboard (separate terminal)
cd dashboard
cp .env.example .env.local    # Supabase URL + anon key + NEXT_PUBLIC_VAANI_WS_URL
npm install
npm run dev                   # http://localhost:3000

# 3) expose the engine to Twilio (separate terminal)
ngrok http 8080               # put the HTTPS host in PUBLIC_HOSTNAME + the Twilio webhook
```

Keys you'll need (all have free tiers): **Groq**, **Deepgram**, **Cartesia**, **Twilio**, **Supabase**.
See [`telephony/.env.example`](telephony/.env.example) for the full list. Run the Postgres
schema in [`db/`](db/) once in the Supabase SQL editor.

**Verify without burning a phone call:** `npm run llmcheck` drives a whole Hinglish booking
offline and asserts no markup gets spoken, the agreed slot is booked, and the call ends;
`npm run browsercheck` proves the browser channel works without a microphone.

## Deployment
- **Dashboard → Vercel** (auto-deploys on push to `main`): https://vaani-rosy.vercel.app
- **Engine →** any host that runs a persistent WebSocket server. A `Dockerfile` and
  `render.yaml` are included; the server auto-detects its public host from the platform
  (`RENDER_EXTERNAL_HOSTNAME` / `SPACE_HOST`), so no manual hostname step is needed.

## Build status
| # | What | Status |
|---|---|---|
| 0 | Scaffold + schema + accounts | ✅ done |
| 1 | Telephony — call the number, hear the bot | ✅ done |
| 2 | Live Hinglish STT (streamed transcript) | ✅ done |
| 3 | Conversational brain + barge-in | ✅ done |
| 4 | Agentic booking + SMS confirmation | ✅ done |
| 5 | Realtime dashboard + browser channel | ✅ done |
| 6 | Deploy (dashboard live on Vercel) | ✅ done |
| 7 | Autonomous outbound rescue (missed call → call back) | 🚧 in progress |

## Security notes
- The Supabase **service-role** key lives only in `telephony/.env` (server-side) and is never shipped to the browser.
- The dashboard uses the **anon** key; Row-Level Security guards the data.
- `.env` files are gitignored; only placeholder `.env.example` files are committed.
