import nodemailer from "nodemailer";
import type { EmailMessage, EmailSender } from "@/application/ports/email-sender";

export type SmtpTransportSettings = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
};

export function smtpEmailSender(settings: SmtpTransportSettings): EmailSender {
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth:
      settings.username === "" ? undefined : { user: settings.username, pass: settings.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return {
    async send(message: EmailMessage): Promise<void> {
      await transport.sendMail({
        from:
          settings.fromName === ""
            ? settings.fromEmail
            : `"${settings.fromName}" <${settings.fromEmail}>`,
        to: message.to,
        replyTo: settings.replyTo === "" ? undefined : settings.replyTo,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    },
  };
}
