import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

type Tx = Prisma.TransactionClient;

/** Journal d'audit : chaque action admin y est inscrite (qui, quoi, sur quoi, avec quels changements). */
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  log(actorId: string, action: string, entity: string, entityId: string | null, changes?: unknown, tx?: Tx) {
    return (tx ?? this.prisma).auditLog.create({
      data: { actorId, action, entity, entityId, changes: changes === undefined ? undefined : (changes as Prisma.InputJsonValue) },
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
