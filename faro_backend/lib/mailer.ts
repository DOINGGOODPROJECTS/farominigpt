import nodemailer from 'nodemailer';

type MailPayload = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function getTransporter() {
  const user = process.env.MAIL_USER || process.env.GMAIL_USER;
  const pass = process.env.MAIL_PASSWORD || process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) return null;

  const host = process.env.MAIL_HOST;
  const port = process.env.MAIL_PORT ? Number(process.env.MAIL_PORT) : undefined;
  const secure =
    process.env.MAIL_SECURE?.toLowerCase() === 'true' ||
    process.env.MAIL_SECURE === '1';

  if (host) {
    return nodemailer.createTransport({
      host,
      port: port || 587,
      secure,
      auth: { user, pass },
    });
  }

  const service = process.env.MAIL_PROVIDER || 'gmail';
  return nodemailer.createTransport({
    service,
    auth: { user, pass },
  });
}

export type MailResult = {
  messageId?: string;
  response?: string;
};

export async function sendMail(payload: MailPayload): Promise<MailResult> {
  const transporter = getTransporter();
  if (!transporter) {
    throw new Error('Gmail transport is not configured.');
  }

  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.GMAIL_USER,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });

  return { messageId: info.messageId, response: info.response };
}
