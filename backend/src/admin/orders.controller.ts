import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { PageQuery, paged, skipTake } from '../common/http';
import { PrismaService } from '../prisma.service';
import { orderInclude, OrdersService } from './orders.service';

class OrderListQuery extends PageQuery {
  @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus;
  @IsOptional() @IsEnum(PaymentStatus) paymentStatus?: PaymentStatus;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}
class StatusDto {
  @IsEnum(OrderStatus) status: OrderStatus;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}
class ShipmentDto {
  @IsIn(['Amana', 'CTM Messagerie', 'Aramex', 'DHL Express']) carrier: string;
  @Matches(/^[A-Za-z0-9-]{6,40}$/, { message: 'Numéro de suivi invalide' }) trackingNumber: string;
}
class RefundDto {
  /** Absent : remboursement du solde restant. */
  @IsOptional() @IsInt() @Min(1) amountCents?: number;
  @IsOptional() @IsString() @MaxLength(255) reason?: string;
}

export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/** Résout le nom de l'auteur de chaque étape de l'historique (client ou membre de l'équipe). */
async function withActors(prisma: PrismaService, orders: OrderRow[]) {
  const ids = [...new Set(orders.flatMap((o) => o.history.map((h) => h.actorId).filter((x): x is string => !!x)))];
  const actors = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, role: true } }))
    .map((u) => [u.id, u.role === 'ADMIN' ? 'Admin' : u.firstName]));
  return orders.map((o) => ({
    ...o,
    history: o.history.map((h) => ({ ...h, actor: h.actorId ? actors.get(h.actorId) ?? 'Équipe' : 'Client' })),
  }));
}

@Roles('ADMIN')
@Controller('admin')
export class AdminOrdersController {
  constructor(private prisma: PrismaService, private orders: OrdersService) {}

  @Get('orders')
  async list(@Query() q: OrderListQuery) {
    const where: Prisma.OrderWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.paymentStatus) where.paymentStatus = q.paymentStatus;
    if (q.q) where.OR = [
      { number: { contains: q.q } }, { user: { email: { contains: q.q } } },
      { user: { lastName: { contains: q.q } } },
    ];
    const [rows, total, counts] = await Promise.all([
      this.prisma.order.findMany({ where, include: orderInclude, orderBy: { placedAt: 'desc' }, ...skipTake(q) }),
      this.prisma.order.count({ where }),
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const res = paged(await withActors(this.prisma, rows), total, q);
    return { ...res, meta: { ...res.meta, countsByStatus: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) } };
  }

  @Get('orders/:id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return { data: (await withActors(this.prisma, [await this.orders.get(id)]))[0] };
  }

  @Patch('orders/:id/status')
  async status(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusDto, @CurrentUser() me: AuthUser) {
    return { data: (await withActors(this.prisma, [await this.orders.changeStatus(id, dto.status, dto.note, me.id)]))[0] };
  }

  @Post('orders/:id/shipments')
  async ship(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ShipmentDto, @CurrentUser() me: AuthUser) {
    return { data: (await withActors(this.prisma, [await this.orders.ship(id, dto.carrier, dto.trackingNumber.toUpperCase(), me.id)]))[0] };
  }

  /** Espèces encaissées à la livraison ou virement reçu (`cod-collected` gardé pour compatibilité). */
  @Post(['orders/:id/payment-received', 'orders/:id/cod-collected']) @HttpCode(200)
  async paymentReceived(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() me: AuthUser) {
    return { data: (await withActors(this.prisma, [await this.orders.paymentReceived(id, me.id)]))[0] };
  }

  @Post('payments/:id/refund') @HttpCode(200)
  async refund(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RefundDto, @CurrentUser() me: AuthUser) {
    return { data: (await withActors(this.prisma, [await this.orders.refund(id, dto.amountCents, dto.reason, me.id)]))[0] };
  }
}
