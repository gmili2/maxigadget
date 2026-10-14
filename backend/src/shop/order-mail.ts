import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../common/mail.service';
import { PrismaService } from '../prisma.service';
import { hasRealEmail } from './no-email';

type Address = { firstName: string; lastName: string; phone: string; line1: string; line2?: string; city: string; postalCode?: string; country: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const dh = (cents: number) => `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} DH`;
const PAYMENT = { CASH_ON_DELIVERY: 'Paiement à la livraison (espèces)', BANK_TRANSFER: 'Virement bancaire avant expédition' } as const;

/** E-mails envoyés quand une commande est passée : confirmation au client, alerte à la boutique. */
@Injectable()
export class OrderMail {
  private logger = new Logger('OrderMail');

  constructor(private prisma: PrismaService, private mail: MailService, private config: ConfigService) {}

  async placed(orderId: string) {
    try {
      const o = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, user: { select: { email: true } } } });
      const a = o.shippingAddress as Address;
      const payment = PAYMENT[o.paymentMethod as keyof typeof PAYMENT] ?? o.paymentMethod;

      const rows = o.items.map((i) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee">${esc(i.productName)}${i.variantLabel ? `<br><span style="color:#888;font-size:13px">${esc(i.variantLabel)}</span>` : ''}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center">× ${i.quantity}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${dh(i.totalCents)}</td></tr>`).join('');
      const totals = [
        ['Sous-total', dh(o.subtotalCents)],
        ...(o.discountCents ? [[`Réduction${o.couponCode ? ` (${esc(o.couponCode)})` : ''}`, `− ${dh(o.discountCents)}`]] : []),
        ['Livraison', o.shippingCents ? dh(o.shippingCents) : 'Incluse'],
      ].map(([k, v]) => `<tr><td colspan="2" style="padding:4px 0;color:#666">${k}</td><td style="padding:4px 0;text-align:right">${v}</td></tr>`).join('');
      const address = [`${a.firstName} ${a.lastName}`, a.line1, a.line2, [a.postalCode, a.city].filter(Boolean).join(' '), a.phone].filter(Boolean).map((l) => esc(l!)).join('<br>');
      const recap = `<table style="width:100%;border-collapse:collapse;font-size:15px">${rows}${totals}
        <tr><td colspan="2" style="padding:10px 0;font-weight:bold">Total</td><td style="padding:10px 0;text-align:right;font-weight:bold">${dh(o.totalCents)}</td></tr></table>
        <p style="margin:20px 0 4px;font-weight:bold">Livraison</p><p style="margin:0;color:#444">${address}</p>
        <p style="margin:20px 0 4px;font-weight:bold">Paiement</p><p style="margin:0;color:#444">${payment}</p>`;
      const bank = o.paymentMethod === 'BANK_TRANSFER'
        ? `<div style="margin-top:20px;padding:16px;background:#f5f4f1;border-radius:8px">
            <p style="margin:0 0 8px;font-weight:bold">Coordonnées pour le virement</p>
            <p style="margin:0;color:#444">Titulaire : ${esc(this.config.get<string>('BANK_HOLDER') ?? '—')}<br>Banque : ${esc(this.config.get<string>('BANK_NAME') ?? '—')}<br>
            RIB : ${esc(this.config.get<string>('BANK_RIB') ?? '—')}<br>Référence à indiquer : <b>${o.number}</b></p>
            <p style="margin:8px 0 0;color:#666;font-size:13px">Votre commande sera expédiée dès réception du virement.</p></div>`
        : '';
      const page = (body: string) => `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
        <p style="font-size:20px;letter-spacing:.2em;margin:0 0 24px">MAXIGADGET</p>${body}</div>`;

      const shop = this.config.get<string>('ORDER_NOTIFY_EMAIL');
      const email = hasRealEmail(o.user.email) ? o.user.email : null;
      const name = `${a.firstName} ${a.lastName}`.trim();
      const contact = [email, a.phone].filter(Boolean).join(', ');
      await Promise.all([
        // Commande passée sans e-mail : pas de confirmation au client, seulement l'alerte à la boutique.
        email && this.mail.send({
          to: email,
          subject: `Votre commande ${o.number} est bien reçue`,
          html: page(`<p>Bonjour ${esc(a.firstName)},</p><p>Merci pour votre commande <b>${o.number}</b>. Nous la préparons et vous contacterons pour la livraison.</p>${bank}<div style="margin-top:24px">${recap}</div>`),
          text: `Bonjour ${a.firstName},\n\nMerci pour votre commande ${o.number} (${dh(o.totalCents)}). Nous la préparons et vous contacterons pour la livraison.\nPaiement : ${payment}${o.paymentMethod === 'BANK_TRANSFER' ? `\nRIB : ${this.config.get<string>('BANK_RIB') ?? '—'} — référence ${o.number}` : ''}\n\nMaxiGadget`,
          replyTo: shop,
        }),
        shop && this.mail.send({
          to: shop.split(',').map((s) => s.trim()).filter(Boolean),
          subject: `Nouvelle commande ${o.number} — ${dh(o.totalCents)}`,
          html: page(`<p>Nouvelle commande <b>${o.number}</b> de ${esc(name)} (${esc(contact)}).</p>${o.customerNote ? `<p style="color:#444"><b>Note du client :</b> ${esc(o.customerNote)}</p>` : ''}${recap}`),
          text: `Nouvelle commande ${o.number} de ${name} (${contact}) : ${dh(o.totalCents)}, ${payment}.`,
          replyTo: email ?? undefined,
        }),
      ]);
    } catch (e) {
      this.logger.error(`E-mails de la commande ${orderId} non envoyés : ${(e as Error).message}`);
    }
  }
}
