import { Controller, Get, Query } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Roles } from '../common/decorators';
import { PageQuery, paged, skipTake } from '../common/http';
import { PrismaService } from '../prisma.service';

class UserListQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
}

@Roles('ADMIN')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@Query() q: UserListQuery) {
    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (q.role) where.role = q.role;
    if (q.q) where.OR = [
      { email: { contains: q.q } }, { lastName: { contains: q.q } }, { firstName: { contains: q.q } },
    ];
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where, orderBy: { createdAt: 'desc' }, ...skipTake(q),
        select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, status: true, createdAt: true, lastLoginAt: true },
      }),
      this.prisma.user.count({ where }),
    ]);
    // Total dépensé : commandes payées, nettes des remboursements.
    const stats = await this.prisma.order.groupBy({
      by: ['userId'], where: { userId: { in: rows.map((u) => u.id) } }, _count: { _all: true },
    });
    const spent = rows.length ? await this.prisma.$queryRaw<{ userId: string; spent: bigint | number | string }[]>`
      SELECT o.userId, COALESCE(SUM(p.amountCents - p.refundedCents), 0) AS spent
      FROM orders o JOIN payments p ON p.orderId = o.id
      WHERE p.status IN ('PAID', 'PARTIALLY_REFUNDED') AND o.userId IN (${Prisma.join(rows.map((u) => u.id))})
      GROUP BY o.userId` : [];
    const count = new Map(stats.map((s) => [s.userId, s._count._all]));
    const total$ = new Map(spent.map((s) => [s.userId, Number(s.spent)]));
    return paged(rows.map((u) => ({ ...u, ordersCount: count.get(u.id) ?? 0, totalSpentCents: total$.get(u.id) ?? 0 })), total, q);
  }
}
