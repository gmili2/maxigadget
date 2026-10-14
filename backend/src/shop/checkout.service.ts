import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod, Prisma } from '@prisma/client';
import { randomBytes, randomInt } from 'node:crypto';
import { syncProductStock, variantInclude, variantLabel } from '../admin/variants';
import { AuthService } from '../auth/auth.service';
import { PricingService } from '../catalog/pricing.service';
import { AppError } from '../common/http';
import { PrismaService } from '../prisma.service';
import { emailForPhone } from './no-email';
import { OrderMail } from './order-mail';
import { SiteAccess } from './site-access';
import type { CheckoutDto, QuoteDto } from './checkout.controller';

type Db = Prisma.TransactionClient | PrismaService;
type Line = {
  productId: string; variantId: string | null; slug: string; name: string; variantLabel: string | null; sku: string;
  imageUrl: string | null; unitPriceCents: number; quantity: number; totalCents: number; available: number;
};

const err = (status: HttpStatus, code: string, message: string, details?: unknown) => new AppError(status, code, message, details);
const PROVIDER = { CASH_ON_DELIVERY: 'COD', BANK_TRANSFER: 'BANK_TRANSFER' } as const;

/**
 * Commande en ligne. Le client n'envoie que des produits, déclinaisons et quantités :
 * prix, promotions, coupon, livraison et total sont toujours recalculés ici.
 */
@Injectable()
export class CheckoutService {
  constructor(private prisma: PrismaService, private pricing: PricingService, private config: ConfigService, private access: SiteAccess, private orderMail: OrderMail) {}

  /** Méthodes de livraison actives pour un pays. */
  async shippingMethods(country: string) {
    return this.prisma.shippingMethod.findMany({
      where: { isActive: true, zone: { isActive: true, countries: { path: '$', array_contains: [country] } } },
      orderBy: { position: 'asc' },
      select: { id: true, name: true, carrier: true, priceCents: true, freeAboveCents: true, minDays: true, maxDays: true, codAllowed: true, codFeeCents: true },
    });
  }

  /** Devis sans écriture : sert au récapitulatif avant validation. */
  async quote(dto: QuoteDto) {
    const r = await this.compute(this.prisma, dto, null);
    return this.summary(r);
  }

  async create(dto: CheckoutDto, idempotencyKey: string | undefined) {
    if (idempotencyKey) {
      const existing = await this.prisma.order.findUnique({ where: { idempotencyKey } });
      if (existing) return this.confirmation(existing);
    }
    const email = dto.customer.email ?? emailForPhone(dto.customer.phone);
    const lastName = dto.customer.lastName ?? '';
    const order = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { email } })
        ?? await tx.user.create({
          data: {
            email, firstName: dto.customer.firstName, lastName, phone: dto.customer.phone,
            // Compte client créé à la commande : pas de mot de passe connu tant que l'espace client n'existe pas.
            passwordHash: await AuthService.hashPassword(randomBytes(24).toString('hex')),
          },
        });
      const r = await this.compute(tx, dto, user.id);

      const number = await this.newNumber(tx);
      const address = { ...dto.address, firstName: dto.customer.firstName, lastName, phone: dto.customer.phone };
      const created = await tx.order.create({
        data: {
          number, userId: user.id, status: 'PENDING', paymentStatus: 'PENDING', paymentMethod: dto.paymentMethod,
          subtotalCents: r.subtotal, shippingCents: r.shipping, discountCents: r.discount, totalCents: r.total,
          taxCents: Math.round(r.total - r.total / 1.2), couponId: r.coupon?.id, couponCode: r.coupon?.code,
          shippingAddress: address, billingAddress: address, shippingMethodId: r.method.id, shippingMethodName: r.method.name,
          customerNote: dto.note || null, idempotencyKey: idempotencyKey ?? null,
          items: {
            create: r.lines.map((l) => ({
              productId: l.productId, variantId: l.variantId, productName: l.name, variantLabel: l.variantLabel, sku: l.sku,
              imageUrl: l.imageUrl, unitPriceCents: l.unitPriceCents, quantity: l.quantity, totalCents: l.totalCents,
            })),
          },
          payments: { create: { provider: PROVIDER[dto.paymentMethod as keyof typeof PROVIDER], amountCents: r.total, currency: 'MAD', status: 'PENDING' } },
          history: { create: { from: null, to: 'PENDING', note: 'Commande passée' } },
        },
      });

      // Réservation du stock (les lignes sont verrouillées depuis compute()).
      for (const l of r.lines) {
        if (l.variantId) {
          await tx.productVariant.update({ where: { id: l.variantId }, data: { stock: { decrement: l.quantity } } });
          await syncProductStock(tx, l.productId);
        } else {
          await tx.product.update({ where: { id: l.productId }, data: { stock: { decrement: l.quantity } } });
        }
        await tx.product.update({ where: { id: l.productId }, data: { soldCount: { increment: l.quantity } } });
        await tx.stockMovement.create({ data: { productId: l.productId, variantId: l.variantId, delta: -l.quantity, reason: 'ORDER_RESERVED', orderId: created.id } });
      }
      if (r.coupon) {
        await tx.coupon.update({ where: { id: r.coupon.id }, data: { usedCount: { increment: 1 } } });
        await tx.couponRedemption.create({ data: { couponId: r.coupon.id, userId: user.id, orderId: created.id, amountCents: r.discount } });
      }
      return created;
    }, { isolationLevel: 'ReadCommitted', timeout: 20_000 });
    // Hors transaction et sans attendre : la commande est confirmée même si l'envoi échoue.
    void this.orderMail.placed(order.id);
    return this.confirmation(order);
  }

  /**
   * Calcule lignes et totaux. Avec un userId (création), les lignes produit, déclinaison et coupon
   * sont verrouillées (FOR UPDATE) pour que deux commandes simultanées ne vendent pas la même pièce.
   */
  private async compute(db: Db, dto: QuoteDto, userId: string | null) {
    const lock = userId !== null;
    // Regroupe les doublons (même produit, même déclinaison).
    const wanted = new Map<string, { slug: string; variantId: string | null; quantity: number }>();
    for (const it of dto.items) {
      const k = `${it.slug}:${it.variantId ?? ''}`;
      const prev = wanted.get(k);
      wanted.set(k, { slug: it.slug, variantId: it.variantId ?? null, quantity: (prev?.quantity ?? 0) + it.quantity });
    }
    const slugs = [...new Set([...wanted.values()].map((w) => w.slug))];
    const products = await db.product.findMany({
      where: { slug: { in: slugs }, status: 'ACTIVE', category: { isActive: true } },
      include: { ...variantInclude, images: { where: { isPrimary: true }, take: 1 } },
    });
    if (lock && products.length) {
      const ids = products.map((p) => p.id);
      await db.$queryRaw`SELECT id FROM products WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`;
      await db.$queryRaw`SELECT id FROM product_variants WHERE productId IN (${Prisma.join(ids)}) FOR UPDATE`;
    }
    const promos = await this.pricing.activePromotions();
    const problems: { slug: string; variantId: string | null; reason: string; available?: number }[] = [];
    const lines: Line[] = [];

    for (const w of wanted.values()) {
      const p = products.find((x) => x.slug === w.slug);
      if (!p) { problems.push({ slug: w.slug, variantId: w.variantId, reason: 'UNAVAILABLE' }); continue; }
      // Produit présenté en vitrine : jamais commandable, quel que soit son stock.
      // En accès privé (boutique réservée), tous les produits sont commandables.
      if (!p.purchasable && !this.access.enabled) { problems.push({ slug: w.slug, variantId: w.variantId, reason: 'NOT_FOR_SALE' }); continue; }
      // Stock relu après verrouillage.
      const fresh = lock ? await db.product.findUniqueOrThrow({ where: { id: p.id }, select: { stock: true } }) : p;
      const active = p.variants.filter((v) => v.isActive);
      if (active.length && !w.variantId) { problems.push({ slug: w.slug, variantId: null, reason: 'VARIANT_REQUIRED' }); continue; }
      const v = w.variantId ? active.find((x) => x.id === w.variantId) : undefined;
      if (w.variantId && !v) { problems.push({ slug: w.slug, variantId: w.variantId, reason: 'UNAVAILABLE' }); continue; }
      const stock = v ? (lock ? (await db.productVariant.findUniqueOrThrow({ where: { id: v.id }, select: { stock: true } })).stock : v.stock) : fresh.stock;
      if (stock < w.quantity) { problems.push({ slug: w.slug, variantId: w.variantId, reason: 'OUT_OF_STOCK', available: stock }); continue; }
      const price = v ? this.pricing.variantPrice(p, v, promos) : this.pricing.price(p, promos);
      lines.push({
        productId: p.id, variantId: v?.id ?? null, slug: p.slug, name: p.name, variantLabel: v ? variantLabel(v) : null, sku: v?.sku ?? p.sku,
        imageUrl: v?.imageUrl ?? p.images[0]?.url ?? null, unitPriceCents: price.finalPriceCents, quantity: w.quantity,
        totalCents: price.finalPriceCents * w.quantity, available: stock,
      });
    }
    if (problems.length) {
      const out = problems.find((x) => x.reason === 'OUT_OF_STOCK');
      const showcase = problems.find((x) => x.reason === 'NOT_FOR_SALE');
      throw err(HttpStatus.CONFLICT, 'CART_INVALID', showcase
        ? 'أحد منتجات سلتك غير متاح للبيع'
        : out
        ? 'أحد منتجات سلتك لم يعد متوفراً بالكمية المطلوبة'
        : 'أحد منتجات سلتك لم يعد متوفراً', problems);
    }
    const subtotal = lines.reduce((n, l) => n + l.totalCents, 0);

    // Coupon.
    let coupon: { id: string; code: string } | null = null;
    let discount = 0;
    if (dto.couponCode) {
      const c = await db.coupon.findUnique({ where: { code: dto.couponCode } });
      const now = new Date();
      if (!c || !c.isActive || (c.startsAt && c.startsAt > now) || (c.expiresAt && c.expiresAt < now)) {
        throw err(HttpStatus.UNPROCESSABLE_ENTITY, 'COUPON_INVALID', 'رمز التخفيض هذا غير صالح');
      }
      if (lock) await db.$queryRaw`SELECT id FROM coupons WHERE id = ${c.id} FOR UPDATE`;
      const used = lock ? (await db.coupon.findUniqueOrThrow({ where: { id: c.id } })).usedCount : c.usedCount;
      if (c.maxUses != null && used >= c.maxUses) throw err(HttpStatus.UNPROCESSABLE_ENTITY, 'COUPON_EXHAUSTED', 'رمز التخفيض هذا وصل إلى حدّ الاستعمال');
      if (subtotal < c.minOrderCents) {
        throw err(HttpStatus.UNPROCESSABLE_ENTITY, 'COUPON_MINIMUM', `هذا الرمز صالح ابتداءً من ${(c.minOrderCents / 100).toLocaleString('fr-FR')} درهم من المشتريات`);
      }
      if (userId) {
        const mine = await db.couponRedemption.count({ where: { couponId: c.id, userId } });
        if (mine >= c.maxUsesPerUser) throw err(HttpStatus.UNPROCESSABLE_ENTITY, 'COUPON_ALREADY_USED', 'سبق لك استعمال رمز التخفيض هذا');
      }
      discount = c.type === 'PERCENTAGE' ? Math.round((subtotal * c.value) / 100) : c.value;
      if (c.maxDiscountCents != null) discount = Math.min(discount, c.maxDiscountCents);
      discount = Math.min(discount, subtotal);
      coupon = { id: c.id, code: c.code };
    }

    // Livraison.
    const method = await db.shippingMethod.findFirst({
      where: { ...(dto.shippingMethodId && { id: dto.shippingMethodId }), isActive: true, zone: { isActive: true, countries: { path: '$', array_contains: [dto.country] } } },
      orderBy: { position: 'asc' },
    });
    if (!method) throw err(HttpStatus.UNPROCESSABLE_ENTITY, 'SHIPPING_UNAVAILABLE', 'التوصيل غير متاح لهذا العنوان');
    if (dto.paymentMethod === PaymentMethod.CASH_ON_DELIVERY && !method.codAllowed) {
      throw err(HttpStatus.UNPROCESSABLE_ENTITY, 'COD_UNAVAILABLE', 'الدفع عند الاستلام غير متاح مع طريقة التوصيل هذه');
    }
    const free = method.freeAboveCents != null && subtotal - discount >= method.freeAboveCents;
    const shipping = (free ? 0 : method.priceCents) + (dto.paymentMethod === PaymentMethod.CASH_ON_DELIVERY ? method.codFeeCents : 0);

    return { lines, subtotal, discount, shipping, total: subtotal - discount + shipping, coupon, method };
  }

  private summary(r: Awaited<ReturnType<CheckoutService['compute']>>) {
    return {
      lines: r.lines.map(({ available: _a, productId: _p, ...l }) => l),
      subtotalCents: r.subtotal, discountCents: r.discount, shippingCents: r.shipping, totalCents: r.total,
      couponCode: r.coupon?.code ?? null, shippingMethod: { id: r.method.id, name: r.method.name },
    };
  }

  private confirmation(o: { number: string; totalCents: number; paymentMethod: PaymentMethod; placedAt: Date }) {
    const bank = o.paymentMethod === 'BANK_TRANSFER'
      ? { holder: this.config.get<string>('BANK_HOLDER') ?? null, bank: this.config.get<string>('BANK_NAME') ?? null, rib: this.config.get<string>('BANK_RIB') ?? null, reference: o.number }
      : null;
    return { number: o.number, totalCents: o.totalCents, paymentMethod: o.paymentMethod, placedAt: o.placedAt, bankTransfer: bank };
  }

  /** Numéro lisible GM-XXXXXX, unique. */
  private async newNumber(tx: Prisma.TransactionClient) {
    for (let i = 0; i < 10; i++) {
      const number = `GM-${randomInt(100000, 1000000)}`;
      if (!(await tx.order.findUnique({ where: { number }, select: { id: true } }))) return number;
    }
    throw new Error('Impossible de générer un numéro de commande');
  }
}
