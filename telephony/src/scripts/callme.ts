import twilio from 'twilio';
import { config } from '../config';

/**
 * Make Vaani ring YOUR phone, instead of you dialling a US number from India.
 *
 *   npm run callme +919876543210
 *
 * Twilio places the call and points it at the same /voice webhook an inbound
 * call would hit, so you're talking to exactly the same engine — no test-only
 * code path that could work here and fail on the real thing.
 *
 * On a trial account the destination must be a Verified Caller ID.
 * This is also the plumbing the Autonomous Outbound Rescue reuses.
 */

const to = process.argv[2];

if (!to?.startsWith('+')) {
  console.error('usage: npm run callme -- +919876543210   (E.164, with country code)');
  process.exit(1);
}

if (!config.publicHostname) {
  console.error('PUBLIC_HOSTNAME is empty — start ngrok and set it in .env first.');
  process.exit(1);
}

const client = twilio(config.twilio.accountSid, config.twilio.authToken);
const url = `https://${config.publicHostname}/voice`;

try {
  const call = await client.calls.create({
    to,
    from: config.twilio.phoneNumber,
    url,
    method: 'POST',
  });
  console.log(`📞 calling ${to} from ${config.twilio.phoneNumber}`);
  console.log(`   webhook: ${url}`);
  console.log(`   call sid: ${call.sid}`);
  console.log('\nPick up — Vaani will greet you.\n');
} catch (err: any) {
  console.error(`Twilio refused the call: ${err.message}`);
  if (err.code === 21210 || err.code === 21211) {
    console.error('→ On a trial account the number must be a Verified Caller ID.');
    console.error('  Add it: Twilio Console → Phone Numbers → Verified Caller IDs.');
  }
  process.exit(1);
}
