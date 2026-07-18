import { config } from '../config';
import { twilioClient } from './twilio';

/**
 * Send the booking confirmation SMS.
 *
 * NOTE: on a Twilio TRIAL account this only works for numbers you've added to
 * Verified Caller IDs. An unverified caller will fail here with error 21608.
 * That's expected — we record the failure and let the call continue rather than
 * blowing up a working booking over an SMS we were never allowed to send.
 */
export async function sendConfirmationSms(params: {
  to: string;
  businessName: string;
  service: string;
  when: string;
  code: string;
}): Promise<'sent' | 'failed' | 'skipped'> {
  // 'web' is the browser demo's placeholder caller — there's no real phone to text, so
  // skip cleanly rather than attempting a send that fails and makes Vaani apologise.
  if (!config.twilio.phoneNumber || !params.to || params.to === 'web') return 'skipped';

  const body =
    `${params.businessName}: your ${params.service} is confirmed for ${params.when}. ` +
    `Confirmation code ${params.code}. Reply to this number to reschedule. — Vaani`;

  try {
    await twilioClient.messages.create({ from: config.twilio.phoneNumber, to: params.to, body });
    return 'sent';
  } catch {
    return 'failed';
  }
}
