import "server-only";
import { mailer } from "../mail";

/** Sends SMS. No provider is chosen yet (Phase 2, Q1); add one by implementing this interface. */
export interface SmsSender {
	send(phoneNumber: string, text: string): Promise<void>;
}

/**
 * Development sender: logs the message and copies it to the dev mailbox (Mailpit) addressed to
 * `sms+<digits>@sms.local`, so codes can be read in the Mailpit UI and by end-to-end tests.
 */
class DevSmsSender implements SmsSender {
	async send(phoneNumber: string, text: string): Promise<void> {
		console.info(`[sms] to=${phoneNumber}: ${text}`);
		await mailer.send({
			to: `sms+${phoneNumber.replace(/\D/g, "")}@sms.local`,
			subject: `SMS to ${phoneNumber}`,
			text,
		});
	}
}

export const sms: SmsSender = new DevSmsSender();
