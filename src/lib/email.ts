import nodemailer from "nodemailer";

const smtpHost = process.env.SMTP_HOST?.trim();
const smtpPort = Number(process.env.SMTP_PORT ?? "587");
const smtpUser = process.env.SMTP_USER?.trim();
const smtpPass = process.env.SMTP_PASS?.trim();
const smtpFrom = process.env.SMTP_FROM?.trim();

const transporter =
	smtpHost && smtpUser && smtpPass
		? nodemailer.createTransport({
				host: smtpHost,
				port: smtpPort,
				secure: smtpPort === 465,
				connectionTimeout: 15000,
				greetingTimeout: 15000,
				auth: {
					user: smtpUser,
					pass: smtpPass,
				},
		  })
		: null;

type EmailInput = {
	to: string;
	subject: string;
	text: string;
	html?: string;
};

export const sendEmail = async ({ to, subject, text, html }: EmailInput) => {
	if (!transporter) {
		throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM.");
	}

	console.info("[auth] SMTP transport config", {
		host: smtpHost,
		port: smtpPort,
		secure: smtpPort === 465,
		user: smtpUser,
		from: smtpFrom ?? smtpUser,
	});

	await transporter.sendMail({
		from: smtpFrom ?? smtpUser,
		to,
		subject,
		text,
		html,
	});
};
