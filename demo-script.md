# Vaani — Demo Video Script & Run Sheet
Target length: **~2.5 minutes**. Tone: confident, warm, human.
Legend:  🎬 = do this on screen  ·  🎤 = say this (voiceover, English)  ·  🗣️ = speak this to Vaani (Hinglish, into the mic)

---

## PART 0 — Before you hit record (5-minute setup)

**A. Start the backend (two terminals, keep both open):**
```
# Terminal 1 — the engine
cd "D:/OneDrive/Desktop/FlowZint Unstop Hackathon/vaani/telephony"
npm run start

# Terminal 2 — the tunnel
ngrok http --url=eloquence-confess-makeshift.ngrok-free.dev 8080
```

**B. Confirm it's alive** (Terminal 3, or just open in browser):
- Visit: https://eloquence-confess-makeshift.ngrok-free.dev/health → should say `{"ok":true}`

**C. Open the demo:**
- Browser tab 1: **https://vaani-rosy.vercel.app/**  (full screen, close other tabs/notifications)
- Allow the microphone when asked.

**D. Audio setup (important for quality):**
- Wear **headphones** so Vaani's voice doesn't echo back into your mic.
- Use a screen recorder that captures **BOTH system audio (her voice) and your mic (your voice)** — OBS Studio (free) does this. On Windows you can also use **Win + G** (Game Bar) but it may not capture system audio well; OBS is safer.
- Record in **1080p, landscape**, quiet room.

**E. Do ONE full practice run** before the real take — it warms the engine and lets you check the mic hears you. (Note: keep the conversation to ~4 exchanges; the Groq free tier has a per-minute limit and a very long call can stall.)

---

## PART 1 — The hook (0:00–0:12)

🎬 Open on the Vaani landing page (the hero, "Never miss a customer call again").

🎤 *"Every day, small businesses in India miss half their phone calls — someone's busy, it's after hours, the line's engaged. And every missed call is a lost customer. This is Vaani — an AI receptionist that never misses one."*

---

## PART 2 — Talk to her live (0:12–1:20)  ← the heart of the demo

🎬 Point to the glowing "Talk" orb.

🎤 *"She's not a demo video of a bot — this is the real engine, running live in the browser. Watch. I'll book an appointment the way a real customer would — in Hinglish."*

🎬 **Click "Talk."** Wait for "Listening — just speak."

🗣️ **"Namaste! Mujhe kal subah ek haircut ke liye appointment book karni hai."**

⏳ She greets you and starts offering morning slots.

🎤 (quietly, over her voice) *"She's checking real availability in the database as she speaks."*

🎬 **BARGE-IN MOMENT** — while she's still listing slots, cut in and talk over her:

🗣️ **"Haan haan, saade das baje perfect rahega."**

🎤 *"Notice she stopped the instant I spoke — just like a person. No waiting for the bot to finish."*

⏳ She confirms **10:30** (saade das) and asks your name.

🗣️ **"Mera naam Amit hai."**

⏳ She books it and reads out a confirmation code.

🗣️ **"Bas itna hi, thank you Vaani!"**

⏳ She gives a warm closing line and **ends the call herself**.

🎤 *"She booked the exact slot I asked for, captured my name, and hung up on her own — the whole thing in under a minute."*

---

## PART 3 — The proof: live dashboard (1:20–1:50)

🎬 **Scroll down** the same page to "The owner's live dashboard."

🎤 *"And here's what the business owner sees — live. Everything you just heard is already here."*

🎬 Point to each, slowly:
- **Transcript** — *"the full conversation, transcribed."*
- **Response latency** bars — *"every reply landed in well under a second — that's why it feels like a person, not a bot."*
- **Appointments** row — *"and the booking itself: my name, the service, 10:30 tomorrow, a confirmation code."*

🎤 *"No dashboard refresh, no delay — it all appeared while I was still talking."*

---

## PART 4 — Under the hood (1:50–2:10)

🎬 Point to the footer tech line (or show a simple slide).

🎤 *"Under the hood: Deepgram understands Hinglish code-switching, Groq's model runs the conversation and calls the booking tools, Cartesia gives her a natural Hindi voice, and Supabase stores it all in real time. And it's the same engine whether you call the phone number or click 'Talk' in the browser."*

---

## PART 5 — Close (2:10–2:30)

🎬 Back to the hero.

🎤 *"Vaani answers every call, in the language your customers actually speak, and turns a missed call into a booked customer — 24 hours a day. Never miss a call again."*

🎬 End card / hold on the page with the phone number and the URL visible.

---

## OPTIONAL POWER-UP — real phone + real SMS (splice in after Part 2 if you want)

This proves it answers a **real phone** and sends a **real SMS** — very credible. Do it as a
short separate clip (film your phone screen).

🎬 On your laptop, run:
```
cd "D:/OneDrive/Desktop/FlowZint Unstop Hackathon/vaani/telephony"
npm run callme -- +91XXXXXXXXXX      # your own number
```
🎬 Your phone rings. **Answer, press 1** (Twilio trial preamble), then book just like above.
🎤 *"She also answers a real phone number — and the moment the booking is done…"*
🎬 …film your phone showing the **SMS confirmation** arriving with the code.
🎤 *"…the customer gets a text. Nothing to install, nothing to remember."*

(The browser demo intentionally skips the SMS — there's no real phone to text — so use this
clip if you want the SMS moment.)

---

## PART 6 — After recording

1. **Trim** dead air at the start/end.
2. **Add captions** — especially **English subtitles** under the Hinglish conversation, so judges who don't speak Hindi follow every line. This single step makes it far more accessible and impressive.
3. Add a title card at the start: **"Vaani — AI Phone Receptionist · FlowZint AI Hackathon 2026."**
4. **Upload to YouTube as "Unlisted"** (or Google Drive with link-sharing on), so the link always works — this is your can't-fail submission artifact.
5. Put the video link + the live URL (https://vaani-rosy.vercel.app/) + the GitHub repo (https://github.com/AmitAK1/vaani) into the FlowZint portal.

---

## Quick reference — what to say to Vaani (Hinglish lines only)
1. "Namaste! Mujhe kal subah ek haircut ke liye appointment book karni hai."
2. (interrupt her) "Haan haan, saade das baje perfect rahega."
3. "Mera naam Amit hai."
4. "Bas itna hi, thank you Vaani!"
