import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { hasRealEmail } from './no-email';

/** Contexte navigateur de la commande, transmis à Meta pour reconnaître le visiteur de la publicité. */
export type BrowserContext = { ip?: string; userAgent?: string; fbp?: string; fbc?: string; url?: string };

type PurchaseOrder = {
  number: string; totalCents: number; userId: string; placedAt: Date;
  customer: { firstName: string; lastName?: string; phone: string; email?: string; city: string };
  items: { slug: string; quantity: number }[];
};

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
/** Téléphone au format international sans « + » (06… → 2126…), comme Meta l'attend avant hachage. */
export function metaPhone(raw: string) {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '212' + d.slice(1);
  return d;
}
/** Identifiant commun au pixel (eventID) et au serveur : Meta ne compte l'achat qu'une fois. */
export const purchaseEventId = (orderNumber: string) => `order-${orderNumber}`;

/**
 * API Conversions de Meta : l'achat est aussi envoyé par le serveur, pour être compté même quand le
 * pixel du navigateur est bloqué (iPhone, bloqueurs de publicité). Actif seulement avec FB_PIXEL_ID et
 * FB_CAPI_TOKEN ; un échec n'empêche jamais la commande. Données personnelles hachées (SHA-256).
 */
@Injectable()
export class MetaCapi {
  private logger = new Logger('MetaCapi');
  constructor(private config: ConfigService) {}

  async purchase(o: PurchaseOrder, ctx: BrowserContext) {
    const pixel = this.config.get<string>('FB_PIXEL_ID');
    const token = this.config.get<string>('FB_CAPI_TOKEN');
    if (!pixel || !token) return;
    const version = this.config.get<string>('FB_GRAPH_VERSION') || 'v26.0';
    const testCode = this.config.get<string>('FB_TEST_EVENT_CODE');
    const c = o.customer;
    const userData = {
      ph: [sha(metaPhone(c.phone))],
      ...(c.email && hasRealEmail(c.email) && { em: [sha(c.email.trim().toLowerCase())] }),
      ...(norm(c.firstName) && { fn: [sha(norm(c.firstName))] }),
      ...(c.lastName && norm(c.lastName) && { ln: [sha(norm(c.lastName))] }),
      ...(norm(c.city) && { ct: [sha(norm(c.city))] }),
      country: [sha('ma')],
      external_id: [sha(o.userId)],
      ...(ctx.ip && { client_ip_address: ctx.ip }),
      ...(ctx.userAgent && { client_user_agent: ctx.userAgent }),
      ...(ctx.fbp && { fbp: ctx.fbp }),
      ...(ctx.fbc && { fbc: ctx.fbc }),
    };
    const body = {
      data: [{
        event_name: 'Purchase',
        event_time: Math.floor(o.placedAt.getTime() / 1000),
        event_id: purchaseEventId(o.number),
        action_source: 'website',
        ...(ctx.url && { event_source_url: ctx.url }),
        user_data: userData,
        custom_data: {
          currency: 'MAD', value: o.totalCents / 100, order_id: o.number, content_type: 'product',
          content_ids: [...new Set(o.items.map((i) => i.slug))], num_items: o.items.reduce((n, i) => n + i.quantity, 0),
        },
      }],
      ...(testCode && { test_event_code: testCode }),
    };
    try {
      const res = await fetch(`https://graph.facebook.com/${version}/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) this.logger.warn(`Achat ${o.number} refusé par Meta (${res.status}) : ${(await res.text()).slice(0, 300)}`);
    } catch (e) {
      this.logger.warn(`Achat ${o.number} non envoyé à Meta : ${(e as Error).message}`);
    }
  }
}
