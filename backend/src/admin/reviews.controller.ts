import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { Prisma, ReviewStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { AuditService } from '../common/audit.service';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { PageQuery, paged, skipTake } from '../common/http';
import { PrismaService } from '../prisma.service';

class ReviewListQuery extends PageQuery { @IsOptional() @IsEnum(ReviewStatus) status?: ReviewStatus; }
class ModerateDto { @IsIn(['APPROVED', 'REJECTED']) status: 'APPROVED' | 'REJECTED'; }

const include = {
  product: { select: { id: true, name: true, slug: true } },
  user: { select: { firstName: true, lastName: true, email: true } },
} satisfies Prisma.ReviewInclude;

@Roles('ADMIN')
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Get()
  async list(@Query() q: ReviewListQuery) {
    const where: Prisma.ReviewWhereInput = q.status ? { status: q.status } : {};
    const [rows, total, counts] = await Promise.all([
      this.prisma.review.findMany({ where, include, orderBy: { createdAt: 'desc' }, ...skipTake(q) }),
      this.prisma.review.count({ where }),
      this.prisma.review.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const res = paged(rows.map(({ user, ...r }) => ({ ...r, author: `${user.firstName} ${user.lastName.charAt(0)}.`, authorEmail: user.email })), total, q);
    return { ...res, meta: { ...res.meta, countsByStatus: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) } };
  }

  /** Publication / refus. La note moyenne du produit est ajustée de façon incrémentale (seuls les avis publiés comptent). */
  @Patch(':id/status')
  async moderate(@Param('id', ParseUUIDPipe) id: string, @Body() { status }: ModerateDto, @CurrentUser() me: AuthUser) {
    const data = await this.prisma.$transaction(async (tx) => {
      const before = await tx.review.findUniqueOrThrow({ where: { id } });
      const review = await tx.review.update({ where: { id }, data: { status, moderatedById: me.id, moderatedAt: new Date() }, include });
      const delta = (status === 'APPROVED' ? 1 : 0) - (before.status === 'APPROVED' ? 1 : 0);
      if (delta) {
        // Verrou sur la ligne produit : deux modérations simultanées ne faussent pas la moyenne.
        const [p] = await tx.$queryRaw<{ ratingAvg: Prisma.Decimal; ratingCount: number }[]>`
          SELECT ratingAvg, ratingCount FROM products WHERE id = ${before.productId} FOR UPDATE`;
        const count = Number(p.ratingCount) + delta;
        const avg = count > 0 ? (Number(p.ratingAvg) * Number(p.ratingCount) + delta * before.rating) / count : 0;
        await tx.product.update({ where: { id: before.productId }, data: { ratingCount: count, ratingAvg: Math.min(5, Math.max(0, Math.round(avg * 10) / 10)) } });
      }
      await this.audit.log(me.id, 'review.moderate', 'review', id, { from: before.status, to: status }, tx);
      return review;
    });
    const { user, ...r } = data;
    return { data: { ...r, author: `${user.firstName} ${user.lastName.charAt(0)}.`, authorEmail: user.email } };
  }
}
