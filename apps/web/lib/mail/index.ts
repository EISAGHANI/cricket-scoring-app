import "server-only";
import nodemailer from "nodemailer";
import { env } from "../env";

export interface Message {
	to: string;
	subject: string;
	text: string;
	html?: string;
}

/** Sends transactional email. Implementations: Resend (prod), SMTP (Mailpit in dev), console. */
export interface Mailer {
	send(message: Message): Promise<void>;
}

class ResendMailer implements Mailer {
	constructor(private readonly apiKey: string) {}
	async send(m: Message): Promise<void> {
		const res = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
			body: JSON.stringify({
				from: env.MAIL_FROM,
				to: m.to,
				subject: m.subject,
				text: m.text,
				html: m.html,
			}),
		});
		if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
	}
}

class SmtpMailer implements Mailer {
	private readonly transport;
	constructor(url: string) {
		this.transport = nodemailer.createTransport(url);
	}
	async send(m: Message): Promise<void> {
		await this.transport.sendMail({ from: env.MAIL_FROM, ...m });
	}
}

class ConsoleMailer implements Mailer {
	async send(m: Message): Promise<void> {
		console.info(`[mail] to=${m.to} subject=${m.subject}\n${m.text}`);
	}
}

export const mailer: Mailer = env.RESEND_API_KEY
	? new ResendMailer(env.RESEND_API_KEY)
	: env.SMTP_URL
		? new SmtpMailer(env.SMTP_URL)
		: new ConsoleMailer();
