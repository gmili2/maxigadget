import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

/** Attribue un identifiant à chaque requête (repris de X-Request-Id s'il est fourni). */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  const id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  (req as Request & { id: string }).id = id;
  res.setHeader('X-Request-Id', id);
  next();
}

/** Erreur métier avec un code stable lisible par le front. */
export class AppError extends HttpException {
  constructor(status: HttpStatus, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message, status);
  }
}

const CODES: Record<number, string> = {
  400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 413: 'PAYLOAD_TOO_LARGE', 429: 'TOO_MANY_REQUESTS',
};

/** Contraintes CHECK de la base (migration initiale) traduites pour l'admin. */
const CHECKS: Record<string, string> = {
  products_price_positive: 'Le prix doit être positif',
  products_sale_lt_price: 'Le prix promo doit être inférieur au prix',
  products_stock_non_negative: 'Le stock ne peut pas être négatif',
  products_sale_window: 'La fin de la promo doit suivre son début',
  coupons_value: 'Valeur de remise invalide',
  payments_refund_lte: 'Remboursement supérieur au montant payé',
  reviews_rating: 'La note doit être comprise entre 1 et 5',
};

/** Format d'erreur unique : { statusCode, code, message, details?, requestId }. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private logger = new Logger('HTTP');

  catch(err: unknown, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<Request & { id?: string }>();
    const res = host.switchToHttp().getResponse<Response>();
    let statusCode = 500, code = 'INTERNAL_ERROR', message = 'Erreur interne', details: unknown;

    if (err instanceof AppError) {
      statusCode = err.getStatus(); code = err.code; message = err.message; details = err.details;
    } else if (err instanceof HttpException) {
      statusCode = err.getStatus(); code = CODES[statusCode] ?? 'ERROR';
      const body = err.getResponse() as { message?: string | string[] } | string;
      const msg = typeof body === 'string' ? body : body.message;
      if (Array.isArray(msg)) { code = 'VALIDATION_ERROR'; message = 'Données invalides'; details = msg; } else if (msg) message = msg;
    } else if ((err instanceof Prisma.PrismaClientUnknownRequestError || err instanceof Prisma.PrismaClientKnownRequestError) && /CONSTRAINT `\w+` failed/i.test(err.message)) {
      // MariaDB : « CONSTRAINT `products_sale_lt_price` failed for `maxigadget`.`products` »
      const constraint = err.message.match(/CONSTRAINT `(\w+)` failed/i)?.[1];
      statusCode = 400; code = 'VALIDATION_ERROR'; message = (constraint && CHECKS[constraint]) || 'Valeurs incohérentes'; details = constraint;
    } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') { statusCode = 409; code = 'CONFLICT'; message = 'Cette valeur existe déjà'; details = err.meta?.target; }
      else if (err.code === 'P2025') { statusCode = 404; code = 'NOT_FOUND'; message = 'Ressource introuvable'; }
      else if (err.code === 'P2003') { statusCode = 409; code = 'CONFLICT'; message = 'Ressource encore référencée'; }
    }

    if (statusCode >= 500) this.logger.error(`${req.method} ${req.url} [${req.id}]`, err instanceof Error ? err.stack : String(err));
    res.status(statusCode).json({ statusCode, code, message, ...(details !== undefined && { details }), requestId: req.id });
  }
}

export class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}

export const paged = <T>(data: T[], total: number, q: PageQuery) => ({
  data, meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
});
export const skipTake = (q: PageQuery) => ({ skip: (q.page - 1) * q.limit, take: q.limit });
