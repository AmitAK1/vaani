import { config } from '../config';
import { supabase } from '../lib/supabase';

/**
 * Seed a demo tenant and map the Twilio number to it, so an inbound call
 * resolves to a real business instead of falling back to a generic greeting.
 *   npm run seed
 */

const BUSINESS = {
  name: 'Sunrise Dental Clinic',
  type: 'clinic',
  timezone: 'Asia/Kolkata',
  owner_email: 'owner@sunrisedental.in',
  greeting:
    'Namaste! Sunrise Dental Clinic mein aapka swagat hai. Main Vaani bol rahi hoon. Bataiye, main aapki kya madad kar sakti hoon?',
};

const SERVICES = [
  { name: 'Dental Checkup', duration_minutes: 30, price: 500 },
  { name: 'Teeth Cleaning', duration_minutes: 45, price: 1500 },
  { name: 'Root Canal', duration_minutes: 90, price: 6000 },
  { name: 'Tooth Extraction', duration_minutes: 45, price: 2500 },
];

const { data: business, error } = await supabase
  .from('businesses')
  .insert(BUSINESS)
  .select('id')
  .single();

if (error || !business) {
  console.error('failed to create business:', error);
  process.exit(1);
}
console.log(`✅ business  ${BUSINESS.name}  (${business.id})`);

// Mon–Sat 9:00–19:00, closed Sunday.
await supabase.from('business_hours').insert(
  Array.from({ length: 7 }, (_, day) => ({
    business_id: business.id,
    day_of_week: day,
    open_time: '09:00',
    close_time: '19:00',
    is_closed: day === 0,
  })),
);
console.log('✅ hours     Mon–Sat 9:00–19:00, Sun closed');

await supabase
  .from('services')
  .insert(SERVICES.map((s) => ({ ...s, business_id: business.id })));
console.log(`✅ services  ${SERVICES.map((s) => s.name).join(', ')}`);

if (!config.twilio.phoneNumber) {
  console.warn('⚠️  TWILIO_PHONE_NUMBER is empty — skipping the number mapping.');
  console.warn('   Inbound calls will not resolve to this business until you set it.');
  process.exit(0);
}

const { error: numErr } = await supabase.from('phone_numbers').insert({
  business_id: business.id,
  e164: config.twilio.phoneNumber,
  label: 'Twilio main line',
});

if (numErr) console.error('failed to map phone number:', numErr);
else console.log(`✅ number    ${config.twilio.phoneNumber} → ${BUSINESS.name}`);
