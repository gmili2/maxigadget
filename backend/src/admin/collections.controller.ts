import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { AuditService } from '../common/audit.service';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { PrismaService } from '../prisma.service';

class CollectionStatusDto { @IsBoolean() isActive: boolean; }

const select = {
  id: true, name: true, slug: true, isActive: true,
  _count: { select: { products: true } },
} as const;

/**
 * Collections (toutes, archivées comprises : le formulaire d'une montre doit pouvoir garder sa collection).
 * Archiver une collection la retire de la boutique avec toutes ses montres, sans changer leur statut
 * (voir catalog/visibility.ts) : la restaurer remet la boutique dans l'état précédent.
 */
@Roles('ADMIN')
@Controller('admin/collections')
export class AdminCollectionsController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Get()
  async list() {
    return { data: await this.prisma.collection.findMany({ orderBy: { name: 'asc' }, select }) };
  }

  @Patch(':id/status')
  async status(@Param('id', ParseUUIDPipe) id: string, @Body() { isActive }: CollectionStatusDto, @CurrentUser() me: AuthUser) {
    const data = await this.prisma.$transaction(async (tx) => {
      const c = await tx.collection.update({ where: { id }, data: { isActive }, select });
      await this.audit.log(me.id, isActive ? 'collection.restore' : 'collection.archive', 'collection', id, { name: c.name, products: c._count.products }, tx);
      return c;
    });
    return { data };
  }
}
