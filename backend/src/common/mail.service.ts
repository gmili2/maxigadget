import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type Mail = { to: string | string[]; subject: string; html: string; text: string; replyTo?: string };

/**
 * Envoi d'e-mails via l'API HTTP de Resend (https://resend.com/docs/api-reference/emails/send-email).
 * Sans RESEND_API_KEY, rien n'est envoyé : l'e-mail est seulement signalé dans les logs.
 */
@Injectable()
export class MailService {
  private logger = new Logger('Mail');

  constructor(private config: ConfigService) {}

  /** Envoie un e-mail ; ne lève jamais d'erreur (un e-mail raté ne doit pas faire échouer l'action). */
  async send(mail: Mail): Promise<boolean> {
    const key = this.config.get<string>('RESEND_API_KEY');
    if (!key) {
      this.logger.log(`RESEND_API_KEY absent, e-mail non envoyé : « ${mail.subject} » → ${String(mail.to)}`);
      return false;
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: this.config.getOrThrow<string>('MAIL_FROM'),
          to: mail.to, subject: mail.subject, html: mail.html, text: mail.text,
          ...(mail.replyTo && { reply_to: mail.replyTo }),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.logger.error(`Resend a refusé « ${mail.subject} » (${res.status}) : ${await res.text()}`);
        return false;
      }
      return true;
    } catch (e) {
      this.logger.error(`Envoi impossible de « ${mail.subject} » : ${(e as Error).message}`);
      return false;
    }
  }
}
