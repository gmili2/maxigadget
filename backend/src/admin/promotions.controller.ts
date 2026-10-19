import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { DiscountType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { AuditService } from '../common/audit.service';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { AppError } from '../common/http';
import { PrismaService } from '../prisma.service';

class QuantityTierDto {
  @IsInt() @Min(2) @Max(50) minQty: number;
  @IsInt() @Min(100) @Max(10_000_000) amountCents: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
class QuantityTiersDto {
  @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => QuantityTierDto) tiers: QuantityTierDto[];
}

class CouponDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase().replace(/\s/g, '') : value))
  @Matches(/^[A-Z0-9_-]{3,40}$/, { message: 'Code : 3 à 40 caractères, lettres, chiffres, - ou _' }) code: string;
  @IsEnum(DiscountType) type: DiscountType;
  /** PERCENTAGE : 1–100 ; FIXED_AMOUNT : centimes. */
  @IsInt() @Min(1) value: number;
  @IsOptional() @IsInt() @Min(1) maxDiscountCents?: number | null;
  @IsOptional() @IsInt() @Min(0) minOrderCents?: number;
  @IsOptional() @IsDateString() startsAt?: string | null;
  @IsOptional() @IsDateString() expiresAt?: string | null;
  @IsOptional() @IsInt() @Min(1) maxUses?: number | null;
  @IsOptional() @IsInt() @Min(1) maxUsesPerUser?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
class UpdateCouponDto extends PartialType(CouponDto) {}

class TargetDto {
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() collectionId?: string;
}
class PromotionDto {
  @IsString() @MinLength(2) @MaxLength(100) name: string;
  @IsEnum(DiscountType) type: DiscountType;
  @IsInt() @Min(1) value: number;
  @IsDateString() startsAt: string;
  @IsDateString() endsAt: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(100) priority?: number;
  /** Vide : tout le catalogue. */
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => TargetDto) targets?: TargetDto[];
}
class UpdatePromotionDto extends PartialType(PromotionDto) {}

const invalid = (message: string) => new AppError(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', message);

function checkDiscount(type?: DiscountType, value?: number) {
  if (type === 'PERCENTAGE' && value != null && value > 100) throw invalid('Un pourcentage doit être compris entre 1 et 100');
}
function checkWindow(start?: string | Date | null, end?: string | Date | null) {
  if (start && end && new Date(start) >= new Date(end)) throw invalid('La date de fin doit suivre la date de début');
}
function checkTargets(targets?: TargetDto[]) {
  for (const t of targets ?? []) {
    if ([t.productId, t.categoryId, t.collectionId].filter(Boolean).length !== 1) throw invalid('Chaque cible vise exactement un produit, une catégorie ou une collection');
  }
}

const promoInclude = {
  targets: {
    include: {
      product: { select: { id: true, name: true } }, category: { select: { id: true, name: true } }, collection: { select: { id: true, name: true } },
    },
  },
} as const;

@Roles('ADMIN')
@Controller('admin')
export class AdminPromotionsController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /* ---------- remise par quantité ---------- */

  @Get('quantity-discounts')
  async quantityDiscounts() {
    return { data: await this.prisma.quantityDiscount.findMany({ orderBy: { minQty: 'asc' } }) };
  }

  /** Remplace tous les paliers (liste complète envoyée par l'admin). */
  @Patch('quantity-discounts')
  async setQuantityDiscounts(@Body() dto: QuantityTiersDto, @CurrentUser() me: AuthUser) {
    const qtys = dto.tiers.map((t) => t.minQty);
    if (new Set(qtys).size !== qtys.length) throw new AppError(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Deux paliers ont le même nombre de produits');
    const sorted = [...dto.tiers].sort((a, b) => a.minQty - b.minQty);
    if (sorted.some((t, i) => i > 0 && t.amountCents <= sorted[i - 1].amountCents)) {
      throw new AppError(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Chaque palier doit offrir une remise plus grande que le précédent');
    }
    const data = await this.prisma.$transaction(async (tx) => {
      await tx.quantityDiscount.deleteMany({});
      for (const t of sorted) await tx.quantityDiscount.create({ data: { minQty: t.minQty, amountCents: t.amountCents, isActive: t.isActive ?? true } });
      await this.audit.log(me.id, 'quantity_discount.update', 'quantity_discount', 'all', dto, tx);
      return tx.quantityDiscount.findMany({ orderBy: { minQty: 'asc' } });
    });
    return { data };
  }

  /* ---------- coupons ---------- */

  @Get('coupons')
  async coupons() {
    return { data: await this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } }) };
  }

  @Post('coupons')
  async createCoupon(@Body() dto: CouponDto, @CurrentUser() me: AuthUser) {
    checkDiscount(dto.type, dto.value);
    checkWindow(dto.startsAt, dto.expiresAt);
    const data = await this.prisma.$transaction(async (tx) => {
      const c = await tx.coupon.create({ data: dto });
      await this.audit.log(me.id, 'coupon.create', 'coupon', c.id, dto, tx);
      return c;
    });
    return { data };
  }

  @Patch('coupons/:id')
  async updateCoupon(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCouponDto, @CurrentUser() me: AuthUser) {
    const data = await this.prisma.$transaction(async (tx) => {
      const before = await tx.coupon.findUniqueOrThrow({ where: { id } });
      checkDiscount(dto.type ?? before.type, dto.value ?? before.value);
      checkWindow(dto.startsAt !== undefined ? dto.startsAt : before.startsAt, dto.expiresAt !== undefined ? dto.expiresAt : before.expiresAt);
      const c = await tx.coupon.update({ where: { id }, data: dto });
      await this.audit.log(me.id, 'coupon.update', 'coupon', id, dto, tx);
      return c;
    });
    return { data };
  }

  /** Un coupon déjà utilisé ne peut pas être supprimé (les commandes y font référence) : il faut le désactiver. */
  @Delete('coupons/:id') @HttpCode(204)
  async deleteCoupon(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() me: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.coupon.findUniqueOrThrow({ where: { id }, include: { _count: { select: { redemptions: true, orders: true } } } });
      if (c._count.redemptions || c._count.orders) throw new AppError(HttpStatus.CONFLICT, 'COUPON_IN_USE', 'Coupon déjà utilisé : désactivez-le plutôt');
      await tx.coupon.delete({ where: { id } });
      await this.audit.log(me.id, 'coupon.delete', 'coupon', id, { code: c.code }, tx);
    });
  }

  /* ---------- promotions automatiques ---------- */

  @Get('promotions')
  async promotions() {
    return { data: await this.prisma.promotion.findMany({ orderBy: { startsAt: 'desc' }, include: promoInclude }) };
  }

  @Post('promotions')
  async createPromotion(@Body() dto: PromotionDto, @CurrentUser() me: AuthUser) {
    checkDiscount(dto.type, dto.value);
    checkWindow(dto.startsAt, dto.endsAt);
    checkTargets(dto.targets);
    const { targets = [], ...rest } = dto;
    const data = await this.prisma.$transaction(async (tx) => {
      const p = await tx.promotion.create({ data: { ...rest, targets: { create: targets } }, include: promoInclude });
      await this.audit.log(me.id, 'promotion.create', 'promotion', p.id, dto, tx);
      return p;
    });
    return { data };
  }

  @Patch('promotions/:id')
  async updatePromotion(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePromotionDto, @CurrentUser() me: AuthUser) {
    checkTargets(dto.targets);
    const { targets, ...rest } = dto;
    const data = await this.prisma.$transaction(async (tx) => {
      const before = await tx.promotion.findUniqueOrThrow({ where: { id } });
      checkDiscount(dto.type ?? before.type, dto.value ?? before.value);
      checkWindow(dto.startsAt ?? before.startsAt, dto.endsAt ?? before.endsAt);
      const p = await tx.promotion.update({
        where: { id }, include: promoInclude,
        data: { ...rest, ...(targets && { targets: { deleteMany: {}, create: targets } }) },
      });
      await this.audit.log(me.id, 'promotion.update', 'promotion', id, dto, tx);
      return p;
    });
    return { data };
  }

  @Delete('promotions/:id') @HttpCode(204)
  async deletePromotion(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() me: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const p = await tx.promotion.delete({ where: { id } });
      await this.audit.log(me.id, 'promotion.delete', 'promotion', id, { name: p.name }, tx);
    });
  }
}
