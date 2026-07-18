import { supabase } from './supabase';

/**
 * The business's diary, held in memory for the duration of one call.
 *
 * Availability used to be three sequential Supabase round-trips (services, hours,
 * existing appointments) executed WHILE the caller waited in silence. But none of
 * it changes during a 90-second call, so we fetch it once the moment the phone is
 * answered — in parallel with the greeting, where it costs nothing — and answer
 * `check_availability` from memory in ~0ms.
 */

const IST = '+05:30';
const HORIZON_DAYS = 14;

export interface Service {
  name: string;
  durationMinutes: number;
  price: number | null;
}

interface Hours {
  open: number; // minutes from midnight
  close: number;
  closed: boolean;
}

const toMinutes = (hhmmss: string): number => {
  const [h, m] = hhmmss.split(':').map(Number);
  return h * 60 + m;
};

const istIso = (date: string, minutes: number): string => {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${date}T${hh}:${mm}:00${IST}`;
};

const HINDI_NUMERALS = [
  '',
  'ek',
  'do',
  'teen',
  'chaar',
  'paanch',
  'chhah',
  'saat',
  'aath',
  'nau',
  'das',
  'gyarah',
  'barah',
];

/**
 * 10:30 → "subah saade das baje".
 *
 * This is not decoration. The model kept booking 12:30 when the caller said "saade
 * das baje", because it was translating Hindi clock-speak into numbers in its head
 * and getting it wrong. Labelling each slot in the SAME words the caller will use
 * turns that translation into a string match — which models are reliable at.
 */
const spokenHinglish = (minutes: number): string => {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;

  const period =
    h24 < 12 ? 'subah' : h24 < 16 ? 'dopahar' : h24 < 20 ? 'shaam' : 'raat';

  let time: string;
  if (m === 0) {
    time = `${HINDI_NUMERALS[h12]} baje`;
  } else if (m === 30) {
    // Hindi is irregular at 1:30 and 2:30 — "derh" and "dhai", never "saade ek".
    if (h12 === 1) time = 'derh baje';
    else if (h12 === 2) time = 'dhai baje';
    else time = `saade ${HINDI_NUMERALS[h12]} baje`;
  } else {
    time = `${HINDI_NUMERALS[h12]} baj kar ${m} minute`;
  }

  return `${period} ${time}`;
};

/** 17:30 → "5:30 PM" — the English form, kept alongside for callers who use it. */
const spokenEnglish = (minutes: number): string => {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
};

export class Schedule {
  private services: Service[] = [];
  private hours = new Map<number, Hours>(); // day_of_week → hours
  /** epoch ms of every confirmed appointment, so lookups are O(1). */
  private booked = new Set<number>();
  private loaded: Promise<void> | null = null;

  constructor(private readonly businessId: string | null) {}

  /** Fire this as soon as the call connects; don't await it. */
  prefetch(): void {
    void this.load();
  }

  private load(): Promise<void> {
    if (this.loaded) return this.loaded;
    if (!this.businessId) return (this.loaded = Promise.resolve());

    const from = new Date().toISOString();
    const to = new Date(Date.now() + HORIZON_DAYS * 86_400_000).toISOString();

    this.loaded = (async () => {
      // One round trip, not three.
      const [services, hours, appts] = await Promise.all([
        supabase
          .from('services')
          .select('name, duration_minutes, price')
          .eq('business_id', this.businessId)
          .eq('active', true),
        supabase
          .from('business_hours')
          .select('day_of_week, open_time, close_time, is_closed')
          .eq('business_id', this.businessId),
        supabase
          .from('appointments')
          .select('scheduled_for')
          .eq('business_id', this.businessId)
          .eq('status', 'confirmed')
          .gte('scheduled_for', from)
          .lte('scheduled_for', to),
      ]);

      this.services = (services.data ?? []).map((s) => ({
        name: s.name,
        durationMinutes: s.duration_minutes,
        price: s.price,
      }));

      for (const h of hours.data ?? []) {
        this.hours.set(h.day_of_week, {
          open: h.open_time ? toMinutes(h.open_time) : 0,
          close: h.close_time ? toMinutes(h.close_time) : 0,
          closed: h.is_closed || !h.open_time || !h.close_time,
        });
      }

      for (const a of appts.data ?? []) this.booked.add(new Date(a.scheduled_for).getTime());
    })();

    return this.loaded;
  }

  async list(): Promise<Service[]> {
    await this.load();
    return this.services;
  }

  /** Loose match — the model says "cleaning" when the row says "Teeth Cleaning". */
  async findService(name: string): Promise<Service | undefined> {
    await this.load();
    const q = name.trim().toLowerCase();
    return this.services.find(
      (s) =>
        s.name.toLowerCase() === q ||
        s.name.toLowerCase().includes(q) ||
        q.includes(s.name.toLowerCase()),
    );
  }

  async isFree(iso: string): Promise<boolean> {
    await this.load();
    return !this.booked.has(new Date(iso).getTime());
  }

  /** Keep the in-memory diary honest after we write a booking. */
  markBooked(iso: string): void {
    this.booked.add(new Date(iso).getTime());
  }

  /**
   * Free slots for a service on a date, as `[{ spoken, iso }]`.
   * Returns null if the business is closed that day.
   */
  async slotsFor(
    service: Service,
    date: string,
  ): Promise<{ spoken: string; english: string; iso: string }[] | null> {
    await this.load();

    // Noon IST lands on the same calendar day in UTC, so the weekday is safe here.
    const dow = new Date(`${date}T12:00:00${IST}`).getUTCDay();
    const h = this.hours.get(dow);
    if (!h || h.closed) return null;

    const now = Date.now();
    const free: { spoken: string; english: string; iso: string }[] = [];

    for (let m = h.open; m + service.durationMinutes <= h.close; m += service.durationMinutes) {
      const iso = istIso(date, m);
      const t = new Date(iso).getTime();
      if (t < now) continue; // don't offer a slot that has already passed today
      if (this.booked.has(t)) continue;
      free.push({ spoken: spokenHinglish(m), english: spokenEnglish(m), iso });
    }

    return free;
  }
}
