import twilio from 'twilio';
import { config } from '../config';

export const twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);

/**
 * Hang up from our side.
 *
 * Vaani decides the call is over (the caller said no when asked if they needed
 * anything else), so she should end it — not sit in silence waiting for a human to
 * press red. Twilio has no "hang up" message on the Media Stream socket, so we
 * complete the call over the REST API instead.
 */
export async function hangUp(callSid: string): Promise<void> {
  if (!callSid) return;
  try {
    await twilioClient.calls(callSid).update({ status: 'completed' });
  } catch (err) {
    console.error('[twilio] hangup failed', (err as Error).message);
  }
}
