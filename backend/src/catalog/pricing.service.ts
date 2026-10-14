import { Injectable } from '@nestjs/common';
import type { Product, Promotion, PromotionTarget } from '@prisma/client';
import { PrismaService } from '../prisma.service';

type PromoWithTargets = Promotion & { targets: PromotionTarget[] };
type Priceable = Pick<Product, 'id' | 'categoryId' | 'collectionId' | 'priceCents' | 'salePriceCents' | 'saleStartsAt' | 'saleEndsAt'>;

export type Price = {
  priceCents: number; // prix de référence (barré si remise)
  finalPriceCents: number; // prix payé
  onSale: boolean;
  promotion: { id: string; name: string } | null;
};

/** Seule source de vérité des prix affichés et facturés : prix promo du produit et promotions automatiques. */
@Injectable()
export class PricingService {
  constructor(private prisma: PrismaService) {}

  activePromotions(at = new Date()): Promise<PromoWithTargets[]> {
    return this.prisma.promotion.findMany({
      where: { isActive: true, startsAt: { lte: at }, endsAt: { gte: at } },
      include: { targets: true },
      orderBy: { priority: 'desc' },
    });
  }

  /** Prix d'une déclinaison : son prix propre s'il existe, sinon celui du produit (promo comprise). */
  variantPrice(p: Priceable, v: { priceCents: number | null; salePriceCents: number | null }, promos: PromoWithTargets[], at = new Date()): Price {
    const own = v.priceCents != null;
    return this.price({
      ...p,
      priceCents: v.priceCents ?? p.priceCents,
      salePriceCents: own ? v.salePriceCents : v.salePriceCents ?? p.salePriceCents,
      ...(own && { saleStartsAt: null, saleEndsAt: null }),
    }, promos, at);
  }

  /** Garde la remise la plus avantageuse pour le client ; une promotion sans cible s'applique à tout le catalogue. */
  price(p: Priceable, promos: PromoWithTargets[], at = new Date()): Price {
    let final = p.priceCents;
    let promotion: Price['promotion'] = null;
    const saleLive = p.salePriceCents != null && (!p.saleStartsAt || p.saleStartsAt <= at) && (!p.saleEndsAt || p.saleEndsAt >= at);
    if (saleLive) final = p.salePriceCents!;

    for (const promo of promos) {
      const applies = !promo.targets.length || promo.targets.some((t) =>
        t.productId === p.id || (t.categoryId && t.categoryId === p.categoryId) || (t.collectionId && t.collectionId === p.collectionId));
      if (!applies) continue;
      const discounted = promo.type === 'PERCENTAGE'
        ? Math.round(p.priceCents * (100 - promo.value) / 100)
        : p.priceCents - promo.value;
      if (discounted > 0 && discounted < final) { final = discounted; promotion = { id: promo.id, name: promo.name }; }
    }
    return { priceCents: p.priceCents, finalPriceCents: final, onSale: final < p.priceCents, promotion };
  }
}
