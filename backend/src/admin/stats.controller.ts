import { Controller, Get, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Roles } from '../common/decorators';
import { PrismaService } from '../prisma.service';
import { orderInclude } from './orders.service';

class RangeQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
class DaysQuery { @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days = 14; }
class LimitQuery { @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 5; }

const DAY = 86_400_000;
const DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' });
const PAID = ['PAID', 'PARTIALLY_REFUNDED'] as const;

@Roles('ADMIN')
@Controller('admin/stats')
export class AdminStatsController {
  constructor(private prisma: PrismaService) {}

  /** CA = encaissements nets des remboursements, sur les commandes passées dans la période (30 jours par défaut). */
  @Get('overview')
  async overview(@Query() q: RangeQuery) {
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * DAY);
    const range = { gte: from, lte: to };
    const [[money], orders, toProcess, customers, newCustomers, items] = await Promise.all([
      this.prisma.$queryRaw<{ revenue: bigint | number | string; paidOrders: bigint | number }[]>`
        SELECT COALESCE(SUM(p.amountCents - p.refundedCents), 0) AS revenue, COUNT(DISTINCT o.id) AS paidOrders
        FROM orders o JOIN payments p ON p.orderId = o.id
        WHERE p.status IN ('PAID', 'PARTIALLY_REFUNDED') AND o.placedAt BETWEEN ${from} AND ${to}`,
      this.prisma.order.count({ where: { placedAt: range } }),
      this.prisma.order.count({ where: { status: { in: ['PENDING', 'CONFIRMED'] } } }),
      this.prisma.user.count({ where: { role: 'CUSTOMER', deletedAt: null } }),
      this.prisma.user.count({ where: { role: 'CUSTOMER', deletedAt: null, createdAt: { gte: new Date(Date.now() - 7 * DAY) } } }),
      this.prisma.orderItem.aggregate({ _sum: { quantity: true }, where: { order: { placedAt: range, paymentStatus: { in: [...PAID] } } } }),
    ]);
    const revenueCents = Number(money.revenue), paidOrders = Number(money.paidOrders);
    return {
      data: {
        from, to, revenueCents, ordersCount: orders, paidOrders, ordersToProcess: toProcess,
        customersCount: customers, newCustomersLast7Days: newCustomers,
        averageBasketCents: paidOrders ? Math.round(revenueCents / paidOrders) : 0, itemsSold: items._sum.quantity ?? 0,
      },
    };
  }

  /**
   * Une ligne par jour (heure de Casablanca), jours sans vente inclus.
   * Regroupement fait ici : les fuseaux nommés ne sont pas toujours chargés dans MariaDB sur un hébergement mutualisé.
   */
  @Get('sales-by-day')
  async salesByDay(@Query() q: DaysQuery) {
    const dayOf = (d: Date) => DAY_FMT.format(d);
    const today = dayOf(new Date());
    const days: string[] = [];
    for (let i = q.days - 1; i >= 0; i--) days.push(dayOf(new Date(Date.parse(today + 'T12:00:00Z') - i * DAY)));
    // Marge d'un jour pour couvrir le décalage horaire, puis filtrage exact sur le jour local.
    const orders = await this.prisma.order.findMany({
      where: { placedAt: { gte: new Date(Date.parse(days[0] + 'T00:00:00Z') - DAY) } },
      select: { id: true, placedAt: true, payments: { where: { status: { in: [...PAID] } }, select: { amountCents: true, refundedCents: true } } },
    });
    const byDay = new Map(days.map((d) => [d, { revenueCents: 0, orders: 0 }]));
    for (const o of orders) {
      const slot = byDay.get(dayOf(o.placedAt));
      if (!slot) continue;
      slot.orders += 1;
      slot.revenueCents += o.payments.reduce((n, p) => n + p.amountCents - p.refundedCents, 0);
    }
    return { data: days.map((day) => ({ day, ...byDay.get(day)! })) };
  }

  @Get('top-products')
  async topProducts(@Query() q: LimitQuery) {
    const data = await this.prisma.product.findMany({
      where: { status: { not: 'ARCHIVED' } }, orderBy: { soldCount: 'desc' }, take: q.limit,
      select: { id: true, name: true, sku: true, slug: true, soldCount: true },
    });
    return { data };
  }

  @Get('recent-orders')
  async recentOrders(@Query() q: LimitQuery) {
    const data = await this.prisma.order.findMany({
      orderBy: { placedAt: 'desc' }, take: q.limit,
      select: { id: true, number: true, status: true, totalCents: true, placedAt: true, user: orderInclude.user },
    });
    return { data };
  }

  @Get('low-stock')
  async lowStock() {
    const data = await this.prisma.$queryRaw<{ id: string; name: string; sku: string; stock: number; lowStockThreshold: number }[]>`
      SELECT id, name, sku, stock, lowStockThreshold FROM products
      WHERE status <> 'ARCHIVED' AND NOT unlimitedStock AND stock <= lowStockThreshold ORDER BY stock, name`;
    return { data };
  }
}
