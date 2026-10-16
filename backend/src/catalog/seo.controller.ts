import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { variantInclude } from '../admin/variants';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma.service';
import { SiteAccess } from '../shop/site-access';
import { PricingService } from './pricing.service';
import { VISIBLE } from './visibility';

/**
 * Référencement. Le site est une application React : sans aide, robots et aperçus de partage (WhatsApp,
 * Facebook, Instagram) ne voient que l'index.html générique. Le serveur web confie donc à l'API
 * /produit/…, /produits…, /sitemap.xml et /robots.txt (voir main.ts) : elle renvoie l'index.html du site
 * complété du titre, de la description, de la photo, du prix et des données structurées de la page.
 */

const SHOP = 'MaxiGadget';
const SHOP_AR = 'ماكسي غادجت';
const PITCH = 'التوصيل مجاني لجميع مدن المغرب، والدفع عند الاستلام.';

/** Pages de la boutique (mêmes adresses que src/routes.ts du site). */
const SHOP_PAGES: Record<string, { title: string; description: string }> = {
  '': { title: 'جميع المنتجات', description: `أجهزة التجميل والتدليك والعناية بالجسم في المغرب. ${PITCH}` },
  'soin-visage': { title: 'العناية بالوجه', description: `أجهزة شدّ البشرة، العلاج بالضوء والتنظيف العميق في المغرب. ${PITCH}` },
  massage: { title: 'التدليك', description: `مسدسات التدليك وأجهزة الرقبة والوسائد في المغرب. ${PITCH}` },
  'corps-minceur': { title: 'الجسم والتنحيف', description: `أحزمة EMS وأجهزة نحت الجسم وشدّه في المغرب. ${PITCH}` },
  'epilation-cheveux': { title: 'إزالة الشعر والعناية بالشعر', description: `أجهزة IPL وفُرَش التمليس ومنتجات العناية بالشعر في المغرب. ${PITCH}` },
  cosmetiques: { title: 'مستحضرات التجميل', description: `سيروم، كريمات وزيوت للعناية في المغرب. ${PITCH}` },
  packs: { title: 'العروض المجمّعة', description: `منتجان أو أكثر في عرض واحد بسعر مخفَّض. ${PITCH}` },
  nouveautes: { title: 'الجديد', description: `آخر المنتجات الواصلة إلى ماكسي غادجت. ${PITCH}` },
};
const STATIC_PAGES = ['/a-propos', '/contact', '/faq', '/cgv', '/confidentialite'];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** JSON dans une balise <script> : « </ » ne doit pas fermer la balise. */
const json = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c');
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');
const dh = (cents: number) => (cents / 100).toFixed(2);
const fmtDh = (cents: number) => `${Math.round(cents / 100).toLocaleString('fr-FR').replace(/ /g, ' ')} درهم`;

type Meta = { title: string; description: string; path: string; image?: string; type?: string; jsonLd?: unknown[]; body?: string; noindex?: boolean; status?: number };

@Public()
@Controller('seo')
export class SeoController {
  private index = { mtime: 0, html: '' };

  constructor(private prisma: PrismaService, private pricing: PricingService, private access: SiteAccess, private config: ConfigService) {}

  private get origin() {
    return (this.config.get<string[]>('FRONTEND_URL') ?? [])[0]?.replace(/\/$/, '') || 'https://maxigadget.store';
  }
  private abs(url: string) {
    // Photos de l'admin : adresse servie directement par le serveur web (voir src/catalog.tsx du site).
    const u = url.startsWith('/api/uploads/') ? '/media/' + url.slice('/api/uploads/'.length) : url;
    return /^https?:\/\//.test(u) ? u : this.origin + u;
  }

  /** index.html du site, relu seulement après un déploiement. */
  private template() {
    const file = this.config.get<string>('SITE_INDEX_FILE') || join(homedir(), 'public_html/index.html');
    const { mtimeMs } = statSync(file);
    if (mtimeMs !== this.index.mtime) this.index = { mtime: mtimeMs, html: readFileSync(file, 'utf8') };
    return this.index.html;
  }

  private render(m: Meta) {
    const url = this.origin + m.path;
    const title = esc(m.title);
    const desc = esc(m.description);
    const tags = [
      `<title>${title}</title>`,
      `<meta name="description" content="${desc}" />`,
      `<link rel="canonical" href="${esc(url)}" />`,
      m.noindex ? '<meta name="robots" content="noindex" />' : '',
      `<meta property="og:site_name" content="${SHOP_AR}" />`,
      `<meta property="og:locale" content="ar_MA" />`,
      `<meta property="og:type" content="${m.type ?? 'website'}" />`,
      `<meta property="og:title" content="${title}" />`,
      `<meta property="og:description" content="${desc}" />`,
      `<meta property="og:url" content="${esc(url)}" />`,
      `<meta property="og:image" content="${esc(m.image ?? this.origin + '/pack-beaute-bien-etre.jpg')}" />`,
      `<meta name="twitter:card" content="${m.image ? 'summary_large_image' : 'summary'}" />`,
      ...(m.jsonLd ?? []).map((o) => `<script type="application/ld+json">${json(o)}</script>`),
    ].filter(Boolean).join('\n    ');
    let html = this.template();
    // Bloc SEO par défaut de index.html (accueil) remplacé par celui de la page.
    html = html.replace(/<!-- seo -->[\s\S]*?<!-- \/seo -->/, `<!-- seo -->\n    ${tags}\n    <!-- /seo -->`);
    // Texte lisible sans JavaScript ; React remplace le contenu de #root au démarrage.
    if (m.body) html = html.replace('<div id="root"></div>', `<div id="root">${m.body}</div>`);
    return html;
  }

  @Get('page')
  async page(@Query('path') raw: string, @Res() res: Response) {
    const path = (typeof raw === 'string' ? raw : '/').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
    // Même page que index.html servi par le serveur web : sans la politique CSP de l'API (Pixel Meta, polices, photos).
    const send = (m: Meta) => {
      res.removeHeader('Content-Security-Policy');
      res.status(m.status ?? 200).type('html').set('Cache-Control', 'no-cache').send(this.render(m));
    };

    // Boutique privée : rien à montrer aux robots.
    if (this.access.enabled) return send({ title: SHOP, description: SHOP, path, noindex: true });

    const shop = path.match(/^\/produits(?:\/([a-z0-9-]+))?$/);
    if (shop) {
      const page = SHOP_PAGES[shop[1] ?? ''];
      if (page) return send({ title: `${page.title} — ${SHOP_AR}`, description: page.description, path });
    }
    const one = path.match(/^\/produit\/([a-z0-9-]+)$/);
    const p = one && await this.prisma.product.findFirst({
      where: { slug: one[1], ...VISIBLE },
      include: { brand: { select: { name: true } }, category: { select: { name: true } }, images: { orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }], select: { url: true } }, ...variantInclude },
    });
    if (!p) return send({ title: `الصفحة غير موجودة — ${SHOP_AR}`, description: PITCH, path, noindex: true, status: 404 });

    const promos = await this.pricing.activePromotions();
    const variants = p.variants.filter((v) => v.isActive);
    const prices = variants.length ? variants.map((v) => this.pricing.variantPrice(p, v, promos).finalPriceCents) : [this.pricing.price(p, promos).finalPriceCents];
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    const inStock = p.stock > 0;
    const images = p.images.map((i) => this.abs(i.url));
    const colors = [...new Set(variants.flatMap((v) => v.values.map((x) => x.optionValue.label)))];
    const pageUrl = `${this.origin}/produit/${p.slug}`;
    const text = (p.shortDescription ? p.shortDescription + '. ' : '') + p.description;
    const description = clip(`${p.name} بـ ${fmtDh(low)}${low !== high ? ' فما فوق' : ''}. ${text} ${PITCH}`.replace(/\s+/g, ' '), 300);
    const availability = `https://schema.org/${inStock ? 'InStock' : 'OutOfStock'}`;
    const shipping = {
      '@type': 'OfferShippingDetails',
      shippingRate: { '@type': 'MonetaryAmount', value: '0', currency: 'MAD' },
      shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'MA' },
      deliveryTime: {
        '@type': 'ShippingDeliveryTime',
        handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 1, unitCode: 'DAY' },
        transitTime: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 4, unitCode: 'DAY' },
      },
    };
    const offer = low === high
      ? { '@type': 'Offer', price: dh(low), priceCurrency: 'MAD', availability, itemCondition: 'https://schema.org/NewCondition', url: pageUrl, shippingDetails: shipping, seller: { '@type': 'Organization', name: SHOP } }
      : { '@type': 'AggregateOffer', lowPrice: dh(low), highPrice: dh(high), offerCount: variants.length, priceCurrency: 'MAD', availability, url: pageUrl };
    const product = {
      '@context': 'https://schema.org', '@type': 'Product',
      name: p.name, description: clip(text.replace(/\s+/g, ' '), 5000), sku: p.sku, url: pageUrl,
      image: images, brand: { '@type': 'Brand', name: p.brand.name }, category: p.category.name,
      ...(colors.length && { color: colors.join(', ') }),
      offers: offer,
    };
    const crumbs = {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'المنتجات', item: `${this.origin}/produits` },
        { '@type': 'ListItem', position: 2, name: p.name, item: pageUrl },
      ],
    };
    const body = `<main><h1>${esc(p.name)}</h1>${images[0] ? `<img src="${esc(images[0])}" alt="${esc(p.name)}" width="400" />` : ''}`
      + `<p>${esc(fmtDh(low))}${low !== high ? ' فما فوق' : ''} · ${inStock ? 'متوفر' : 'نفد المخزون'}</p><p>${esc(text)}</p>`
      + `${colors.length ? `<p>الألوان: ${esc(colors.join('، '))}</p>` : ''}<p>${esc(PITCH)}</p><p><a href="/produits">جميع المنتجات</a></p></main>`;
    return send({ title: `${p.name} — ${fmtDh(low)} — ${SHOP_AR}`, description, path: `/produit/${p.slug}`, image: images[0], type: 'product', jsonLd: [product, crumbs], body });
  }

  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  async sitemap() {
    const products = this.access.enabled ? [] : await this.prisma.product.findMany({
      where: VISIBLE, orderBy: { publishedAt: 'desc' },
      select: { slug: true, name: true, updatedAt: true, images: { orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }], take: 1, select: { url: true } } },
    });
    const url = (loc: string, extra = '') => `  <url><loc>${esc(this.origin + loc)}</loc>${extra}</url>`;
    const lines = this.access.enabled ? [] : [
      url('/'),
      ...Object.keys(SHOP_PAGES).map((k) => url(k ? `/produits/${k}` : '/produits')),
      ...STATIC_PAGES.map((p) => url(p)),
      ...products.map((p) => url(`/produit/${p.slug}`,
        `<lastmod>${p.updatedAt.toISOString().slice(0, 10)}</lastmod>`
        + (p.images[0] ? `<image:image><image:loc>${esc(this.abs(p.images[0].url))}</image:loc><image:title>${esc(p.name)}</image:title></image:image>` : ''))),
    ];
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${lines.join('\n')}\n</urlset>\n`;
  }

  @Get('robots.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  robots() {
    if (this.access.enabled) return 'User-agent: *\nDisallow: /\n';
    return [
      'User-agent: *',
      'Disallow: /admin',
      'Disallow: /panier',
      'Disallow: /commande',
      'Disallow: /compte',
      // /api reste ouvert : Google en a besoin pour afficher les listes de produits en exécutant le site.
      '',
      `Sitemap: ${this.origin}/sitemap.xml`,
      '',
    ].join('\n');
  }
}
