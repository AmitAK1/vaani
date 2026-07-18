---
title: Vaani Telephony
emoji: 🎙️
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
short_description: Realtime Hinglish voice receptionist engine (STT · LLM · TTS over WebSocket)
---

# Vaani — telephony engine

The realtime voice engine behind **Vaani**, an AI phone receptionist for Indian small
businesses. It bridges a live phone call (Twilio Media Streams) or a browser mic to a
speech pipeline — **Deepgram** (Hinglish STT) → **Groq gpt-oss-120b** (tool-calling brain)
→ **Cartesia Sonic** (TTS) — and books appointments into **Supabase** while the caller is
still on the line.

This Space runs the same engine for both transports over a `Channel` abstraction, so the
browser demo is a real call, not a mock. It is stateless — all data lives in Supabase — so
no persistent disk is needed.

## Endpoints
- `GET /health` — liveness check
- `POST /voice` — Twilio voice webhook (returns TwiML that opens the media stream)
- `WS /media-stream` — Twilio Media Streams (μ-law 8kHz)
- `WS /browser-stream` — browser mic demo (PCM16)

## Configuration
Secrets are set in **Space settings → Variables and secrets** (never committed): the
Groq / Deepgram / Cartesia / Twilio / Supabase keys. The public hostname is auto-detected
from Hugging Face's `SPACE_HOST` env var — no manual step.

Dashboard (the owner-facing UI) is a separate Next.js app. Source:
<https://github.com/AmitAK1/vaani>
