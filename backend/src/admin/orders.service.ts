import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { OrderStatus, Prisma, StockReason } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { AppError } from '../common/http';
import { PrismaService } from '../prisma.service';
import { syncProductStock } from './variants';

type Tx = Prisma.TransactionClient;
const dh = (cents: number) => (cents / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' DH';

/** Machine à états des commandes. REFUNDED n'est atteint que par un remboursement (POST payments/:id/refund). */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
  REFUNDED: [],
};
const LABELS: Record<OrderStatus, string> = {
  PENDING: 'En attente', CONFIRMED: 'Confirmée', PROCESSING: 'En préparation', SHIPPED: 'Expédiée',
  DELIVERED: 'Livrée', CANCELLED: 'Annulée', REFUNDED: 'Remboursée',
};

export const orderInclude = {
  user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } },
  items: { include: { product: { select: { slug: true } } } },
  payments: { include: { refunds: true }, orderBy: { createdAt: 'asc' } },
  shipments: { orderBy: { createdAt: 'desc' } },
  history: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  private logger = new Logger('Orders');

  constructor(private prisma: PrismaService, private audit: AuditService) {}

  get(id: string) {
    return this.prisma.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
  }

  async changeStatus(id: string, to: OrderStatus, note: string | undefined, actorId: string) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { id }, include: { items: true, payments: true, shipments: true } });
      if (to === order.status) return;
      if (to === 'REFUNDED') throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, 'USE_REFUND', 'Le remboursement se fait depuis le bloc Paiement');
      if (!TRANSITIONS[order.status].includes(to)) {
        throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, 'INVALID_TRANSITION', `Impossible de passer de « ${LABELS[order.status]} » à « ${LABELS[to]} »`,
          { from: order.status, allowed: TRANSITIONS[order.status] });
      }
      // Carte et virement : paiement avant expédition, donc avant confirmation.
      if (to === 'CONFIRMED' && order.paymentMethod !== 'CASH_ON_DELIVERY' && order.paymentStatus !== 'PAID') {
        throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, 'PAYMENT_REQUIRED',
          order.paymentMethod === 'BANK_TRANSFER' ? 'Le virement n’est pas encore reçu' : 'Le paiement par carte n’est pas encore reçu');
      }
      if (to === 'SHIPPED' && !order.shipments.length) {
        throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, 'SHIPMENT_REQUIRED', 'Renseignez d’abord le transporteur et le numéro de suivi');
      }

      await this.move(tx, order.id, order.status, to, note, actorId);

      if (to === 'CANCELLED') {
        await this.restock(tx, order.id, order.items, 'ORDER_CANCELLED', actorId);
        await this.releaseCoupon(tx, order.id);
        // Une commande carte déjà payée est remboursée intégralement à l'annulation.
        const paid = order.payments.find((p) => p.status === 'PAID' || p.status === 'PARTIALLY_REFUNDED');
        if (paid) await this.recordRefund(tx, paid, paid.amountCents - paid.refundedCents, 'Annulation de la commande', actorId);
        // Un paiement jamais reçu (livraison, virement) est clos.
        await tx.payment.updateMany({ where: { orderId: id, status: 'PENDING' }, data: { status: 'FAILED', failureReason: 'Commande annulée' } });
        await tx.order.update({
          where: { id }, data: { cancelledAt: new Date(), paymentStatus: paid ? 'REFUNDED' : order.paymentStatus === 'PENDING' ? 'FAILED' : order.paymentStatus },
        });
      }
      if (to === 'DELIVERED') {
        await tx.shipment.updateMany({ where: { orderId: id, deliveredAt: null }, data: { status: 'DELIVERED', deliveredAt: new Date() } });
      }
      await this.audit.log(actorId, 'order.status', 'order', id, { from: order.status, to, note }, tx);
    });
    return this.get(id);
  }

  /** Enregistre l'expédition ; une commande en préparation passe automatiquement à « Expédiée ». */
  async ship(id: string, carrier: string, trackingNumber: string, actorId: string) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { id }, include: { shipments: { orderBy: { createdAt: 'desc' }, take: 1 } } });
      if (!['CONFIRMED', 'PROCESSING', 'SHIPPED'].includes(order.status)) {
        throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, 'INVALID_TRANSITION', `Une commande « ${LABELS[order.status]} » ne peut pas être expédiée`);
      }
      const trackingUrl = trackingLink(carrier, trackingNumber);
      const existing = order.shipments[0];
      if (order.status === 'SHIPPED') {
        // Correction du suivi d'un colis déjà parti.
        if (existing) await tx.shipment.update({ where: { id: existing.id }, data: { carrier, trackingNumber, trackingUrl } });
        else await tx.shipment.create({ data: { orderId: id, carrier, trackingNumber, trackingUrl, status: 'IN_TRANSIT', shippedAt: new Date() } });
      } else {
        await tx.shipment.create({ data: { orderId: id, carrier, trackingNumber, trackingUrl, status: 'IN_TRANSIT', shippedAt: new Date() } });
        if (order.status === 'CONFIRMED') await this.move(tx, id, 'CONFIRMED', 'PROCESSING', null, actorId);
        await this.move(tx, id, 'PROCESSING', 'SHIPPED', `${carrier} · ${trackingNumber}`, actorId);
      }
      await this.audit.log(actorId, 'order.ship', 'order', id, { carrier, trackingNumber }, tx);
    });
    return this.get(id);
  }

  /** Paiement reçu hors carte : espèces à la livraison ou virement bancaire. */
  async paymentReceived(id: string, actorId: string) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { id }, include: { payments: true } });
      const payment = order.payments.find((p) => (p.provider === 'COD' || p.provider === 'BANK_TRANSFER') && p.status === 'PENDING');
      if (!payment) {
        throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, 'NO_PENDING_PAYMENT', 'Aucun paiement en attente pour cette commande');
      }
      if (['CANCELLED', 'REFUNDED'].includes(order.status)) {
        throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, 'INVALID_TRANSITION', 'Commande annulée');
      }
      const note = payment.provider === 'COD' ? 'Paiement à la livraison encaissé' : 'Virement bancaire reçu';
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'PAID', paidAt: new Date() } });
      await tx.order.update({ where: { id }, data: { paymentStatus: 'PAID' } });
      await tx.orderStatusHistory.create({ data: { orderId: id, from: order.status, to: order.status, note, actorId } });
      await this.audit.log(actorId, 'order.payment_received', 'order', id, { provider: payment.provider, amountCents: payment.amountCents }, tx);
    });
    return this.get(id);
  }

  async refund(paymentId: string, amountCents: number | undefined, reason: string | undefined, actorId: string) {
    const orderId = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: { include: { items: true } } } });
      if (payment.status !== 'PAID' && payment.status !== 'PARTIALLY_REFUNDED') {
        throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, 'NOT_REFUNDABLE', 'Ce paiement n’est pas remboursable');
      }
      const remaining = payment.amountCents - payment.refundedCents;
      const amount = amountCents ?? remaining;
      if (amount > remaining) {
        throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, 'REFUND_TOO_HIGH', `Au maximum ${dh(remaining)} remboursables`);
      }
      const full = await this.recordRefund(tx, payment, amount, reason, actorId);
      const { order } = payment;
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: full ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
      if (full && order.status !== 'CANCELLED' && order.status !== 'REFUNDED') {
        await this.move(tx, order.id, order.status, 'REFUNDED', reason ?? 'Remboursement intégral', actorId);
        await this.restock(tx, order.id, order.items, 'ORDER_REFUNDED', actorId);
      } else if (!full) {
        await tx.orderStatusHistory.create({
          data: { orderId: order.id, from: order.status, to: order.status, note: `Remboursement partiel de ${dh(amount)}`, actorId },
        });
      }
      await this.audit.log(actorId, 'payment.refund', 'payment', paymentId, { amountCents: amount, reason, orderId: order.id }, tx);
      return order.id;
    });
    return this.get(orderId);
  }

  /** Transition conditionnelle : échoue si le statut a changé entre-temps (deux admins sur la même commande). */
  private async move(tx: Tx, orderId: string, from: OrderStatus, to: OrderStatus, note: string | null | undefined, actorId: string) {
    const { count } = await tx.order.updateMany({ where: { id: orderId, status: from }, data: { status: to } });
    if (!count) throw new AppError(HttpStatus.CONFLICT, 'STALE_ORDER', 'La commande a été modifiée entre-temps, rechargez la page');
    await tx.orderStatusHistory.create({ data: { orderId, from, to, note: note ?? null, actorId } });
  }

  private async restock(tx: Tx, orderId: string, items: { productId: string | null; variantId: string | null; quantity: number }[], reason: StockReason, actorId: string) {
    for (const it of items) {
      if (!it.productId) continue;
      // Stock illimité : rien n'avait été décompté, rien n'est remis.
      const product = await tx.product.findUnique({ where: { id: it.productId }, select: { unlimitedStock: true } });
      if (product?.unlimitedStock) {
        await tx.product.updateMany({ where: { id: it.productId, soldCount: { gte: it.quantity } }, data: { soldCount: { decrement: it.quantity } } });
        continue;
      }
      // La déclinaison a pu être supprimée depuis : le stock revient alors au produit seul.
      const variant = it.variantId ? await tx.productVariant.findUnique({ where: { id: it.variantId } }) : null;
      if (variant) {
        await tx.productVariant.update({ where: { id: variant.id }, data: { stock: { increment: it.quantity } } });
        await syncProductStock(tx, it.productId);
      } else {
        await tx.product.update({ where: { id: it.productId }, data: { stock: { increment: it.quantity } } });
      }
      await tx.product.updateMany({ where: { id: it.productId, soldCount: { gte: it.quantity } }, data: { soldCount: { decrement: it.quantity } } });
      await tx.stockMovement.create({ data: { productId: it.productId, variantId: variant?.id, delta: it.quantity, reason, orderId, actorId } });
    }
  }

  private async releaseCoupon(tx: Tx, orderId: string) {
    const redemption = await tx.couponRedemption.findUnique({ where: { orderId } });
    if (!redemption) return;
    await tx.couponRedemption.delete({ where: { id: redemption.id } });
    await tx.coupon.updateMany({ where: { id: redemption.couponId, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
  }

  /**
   * Enregistre un remboursement. Stripe n'est pas encore branché : pour un paiement carte, le remboursement
   * doit aussi être effectué dans le tableau de bord Stripe tant que l'intégration n'est pas faite.
   * Renvoie true si le paiement est désormais intégralement remboursé.
   */
  private async recordRefund(tx: Tx, payment: { id: string; provider: string; amountCents: number; refundedCents: number }, amount: number, reason: string | undefined, actorId: string) {
    if (amount <= 0) return payment.refundedCents >= payment.amountCents;
    if (payment.provider === 'STRIPE') this.logger.warn(`Stripe non configuré : remboursement de ${amount} c enregistré sans appel à Stripe (paiement ${payment.id})`);
    const refunded = payment.refundedCents + amount;
    const full = refunded >= payment.amountCents;
    await tx.refund.create({ data: { paymentId: payment.id, amountCents: amount, reason, status: 'SUCCEEDED', actorId } });
    await tx.payment.update({ where: { id: payment.id }, data: { refundedCents: refunded, status: full ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
    return full;
  }
}

function trackingLink(carrier: string, n: string) {
  const code = encodeURIComponent(n);
  switch (carrier) {
    case 'Aramex': return `https://www.aramex.com/track/results?ShipmentNumber=${code}`;
    case 'DHL Express': return `https://www.dhl.com/ma-fr/home/tracking.html?tracking-id=${code}`;
    default: return null;
  }
}
