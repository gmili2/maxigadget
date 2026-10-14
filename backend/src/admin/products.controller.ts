import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { PartialType } from '@nestjs/mapped-types';
import { Gender, MovementType, Prisma, ProductStatus, StockReason } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, NotEquals,
} from 'class-validator';
import { AuditService } from '../common/audit.service';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { AppError, PageQuery, paged, skipTake } from '../common/http';
import { MAX_UPLOAD_BYTES, UploadsService } from '../common/uploads.service';
import { ImportService } from './import.service';
import { PrismaService } from '../prisma.service';
import { replaceVariants, syncProductStock, variantInclude, variantValues, VariantsDto } from './variants';

export class CreateProductDto {
  @IsString() @MinLength(2) @MaxLength(160) name: string;
  @IsOptional() @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'slug : minuscules, chiffres et tirets' }) @MaxLength(180) slug?: string;
  @Matches(/^[A-Z0-9][A-Z0-9-]{1,59}$/, { message: 'SKU : majuscules, chiffres et tirets' }) sku: string;
  @IsOptional() @IsString() @MaxLength(60) reference?: string;
  @IsOptional() @IsString() @MaxLength(300) shortDescription?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsInt() @Min(1) priceCents: number;
  @IsOptional() @IsInt() @Min(1) salePriceCents?: number | null;
  @IsOptional() @IsDateString() saleStartsAt?: string | null;
  @IsOptional() @IsDateString() saleEndsAt?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(100_000) stock?: number;
  @IsOptional() @IsInt() @Min(0) lowStockThreshold?: number;
  @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus;
  @IsOptional() @IsBoolean() isFeatured?: boolean;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
  @IsUUID() brandId: string;
  @IsUUID() categoryId: string;
  @IsOptional() @IsUUID() collectionId?: string | null;
  @IsEnum(MovementType) movementType: MovementType;
  @IsOptional() @IsString() @MaxLength(60) caliber?: string;
  @IsString() @MinLength(1) @MaxLength(60) caseMaterial: string;
  @IsString() @MinLength(1) @MaxLength(60) strapMaterial: string;
  @IsString() @MinLength(1) @MaxLength(40) color: string;
  @IsOptional() @IsString() @MaxLength(40) dialColor?: string;
  @IsNumber({ maxDecimalPlaces: 1 }) @Min(10) @Max(99) diameterMm: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(1) @Max(99) thicknessMm?: number | null;
  @IsOptional() @IsInt() @Min(4) @Max(40) lugWidthMm?: number | null;
  @IsInt() @Min(0) @Max(20_000) waterResistanceM: number;
  @IsString() @MinLength(1) @MaxLength(60) glass: string;
  @IsOptional() @IsInt() @Min(0) @Max(2000) powerReserveHours?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(120) warrantyMonths?: number;
  @IsOptional() @IsObject() extraSpecs?: Record<string, unknown>;
}
/** Le stock ne se modifie pas ici : il passe par un mouvement de stock tracé (POST :id/stock). */
class UpdateProductDto extends PartialType(CreateProductDto) {
  @IsIn([undefined], { message: 'Utilisez POST /admin/products/:id/stock pour modifier le stock' }) declare stock?: number;
}
class StatusDto { @IsEnum(ProductStatus) status: ProductStatus; }
class StockDto {
  /** Obligatoire pour un produit à déclinaisons. */
  @IsOptional() @IsUUID() variantId?: string;
  @IsInt() @NotEquals(0) @Min(-100_000) @Max(100_000) delta: number;
  @IsIn([StockReason.RESTOCK, StockReason.ADJUSTMENT]) reason: StockReason;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}
class ProductListQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus;
  @IsOptional() @Type(() => Boolean) @IsBoolean() lowStock?: boolean;
}

const include = {
  brand: { select: { id: true, name: true } },
  category: { select: { id: true, name: true, slug: true } },
  collection: { select: { id: true, name: true, slug: true } },
  images: { orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }] },
  ...variantInclude,
} satisfies Prisma.ProductInclude;

export const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const toDto = (p: Prisma.ProductGetPayload<{ include: typeof include }>) => ({
  ...p, diameterMm: Number(p.diameterMm), thicknessMm: p.thicknessMm == null ? null : Number(p.thicknessMm), ratingAvg: Number(p.ratingAvg),
  options: p.options.map((o) => ({ id: o.id, name: o.name, values: o.values.map(({ id, label, colorHex }) => ({ id, label, colorHex })) })),
  variants: p.variants.map(({ values: _v, ...v }) => ({ ...v, values: variantValues({ ...v, values: _v }) })),
});

/** Textes descriptifs (extraSpecs) dérivés de champs structurés : à oublier quand l'admin modifie le champ. */
const SPEC_SOURCES: Record<string, (keyof CreateProductDto)[]> = {
  kind: ['shortDescription'],
  movement: ['movementType', 'caliber', 'powerReserveHours'],
  dims: ['diameterMm', 'thicknessMm', 'lugWidthMm'],
  strap: ['strapMaterial'],
  glass: ['glass'],
  water: ['waterResistanceM'],
};

/**
 * Renvoie extraSpecs sans les textes devenus faux (la boutique reconstruit alors le texte depuis les champs),
 * ou undefined si rien ne change.
 */
function staleFree(before: Prisma.ProductGetPayload<object>, dto: Partial<CreateProductDto>) {
  const specs = before.extraSpecs as Record<string, unknown> | null;
  if (!specs) return undefined;
  const changed = (k: keyof CreateProductDto) => dto[k] !== undefined && String(dto[k] ?? '') !== String((before as Record<string, unknown>)[k] ?? '');
  const stale = Object.keys(SPEC_SOURCES).filter((key) => key in specs && SPEC_SOURCES[key].some(changed));
  if (!stale.length) return undefined;
  return Object.fromEntries(Object.entries(specs).filter(([k]) => !stale.includes(k)));
}

@Roles('ADMIN')
@Controller('admin/products')
export class AdminProductsController {
  constructor(private prisma: PrismaService, private audit: AuditService, private uploads: UploadsService, private importer: ImportService) {}

  /* ---------- import CSV (catalogue fournisseur) ---------- */

  /** Lecture et contrôle du fichier, sans rien enregistrer. */
  @Post('import/preview') @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  importPreview(@UploadedFile() file: Express.Multer.File) {
    return { data: this.importer.analyse(file) };
  }

  /** Crée les produits valides du fichier (en brouillon sauf « statut = actif ») et télécharge leurs photos. */
  @Post('import') @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  async importRun(@UploadedFile() file: Express.Multer.File, @CurrentUser() me: AuthUser) {
    return { data: await this.importer.run(file, me.id) };
  }

  @Get()
  async list(@Query() q: ProductListQuery) {
    const where: Prisma.ProductWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.q) where.OR = [
      { name: { contains: q.q } }, { sku: { contains: q.q } },
      { reference: { contains: q.q } }, { collection: { name: { contains: q.q } } },
    ];
    if (q.lowStock) where.stock = { lte: 3 };
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({ where, include, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], ...skipTake(q) }),
      this.prisma.product.count({ where }),
    ]);
    return paged(rows.map(toDto), total, q);
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return { data: toDto(await this.prisma.product.findUniqueOrThrow({ where: { id }, include })) };
  }

  @Post()
  async create(@Body() dto: CreateProductDto, @CurrentUser() me: AuthUser) {
    const { stock = 0, slug, description = '', reference, ...rest } = dto;
    const data = await this.prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          ...(rest as Prisma.ProductUncheckedCreateInput), slug: slug || slugify(dto.name), description, reference: reference || dto.sku, stock,
          extraSpecs: dto.extraSpecs as Prisma.InputJsonValue | undefined,
          publishedAt: dto.status === 'ACTIVE' ? new Date() : null,
          stockMovements: stock ? { create: { delta: stock, reason: 'INITIAL', actorId: me.id } } : undefined,
        },
        include,
      });
      await this.audit.log(me.id, 'product.create', 'product', p.id, { sku: p.sku, name: p.name }, tx);
      return p;
    });
    return { data: toDto(data) };
  }

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto, @CurrentUser() me: AuthUser) {
    const data = await this.prisma.$transaction(async (tx) => {
      const before = await tx.product.findUniqueOrThrow({ where: { id } });
      const { extraSpecs, ...rest } = dto;
      const specs = extraSpecs !== undefined ? extraSpecs : staleFree(before, dto);
      const p = await tx.product.update({
        where: { id },
        data: {
          ...(rest as Prisma.ProductUncheckedUpdateInput),
          ...(specs !== undefined && { extraSpecs: specs as Prisma.InputJsonValue }),
          ...(dto.status === 'ACTIVE' && !before.publishedAt && { publishedAt: new Date() }),
        },
        include,
      });
      await this.audit.log(me.id, 'product.update', 'product', id, dto, tx);
      return p;
    });
    return { data: toDto(data) };
  }

  @Patch(':id/status')
  async status(@Param('id', ParseUUIDPipe) id: string, @Body() { status }: StatusDto, @CurrentUser() me: AuthUser) {
    const data = await this.prisma.$transaction(async (tx) => {
      const before = await tx.product.findUniqueOrThrow({ where: { id } });
      const p = await tx.product.update({
        where: { id }, include,
        data: { status, ...(status === 'ACTIVE' && !before.publishedAt && { publishedAt: new Date() }) },
      });
      await this.audit.log(me.id, 'product.status', 'product', id, { from: before.status, to: status }, tx);
      return p;
    });
    return { data: toDto(data) };
  }

  @Post(':id/stock')
  async stock(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StockDto, @CurrentUser() me: AuthUser) {
    const data = await this.prisma.$transaction(async (tx) => {
      const variants = await tx.productVariant.count({ where: { productId: id } });
      if (variants && !dto.variantId) throw new AppError(HttpStatus.BAD_REQUEST, 'VARIANT_REQUIRED', 'Ce produit a des déclinaisons : précisez laquelle');
      if (!variants && dto.variantId) throw new AppError(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Ce produit n’a pas de déclinaison');
      // Décrément conditionnel : le stock ne peut pas passer sous zéro, même en cas d'écritures concurrentes.
      const guard = dto.delta < 0 ? { stock: { gte: -dto.delta } } : {};
      const { count } = dto.variantId
        ? await tx.productVariant.updateMany({ where: { id: dto.variantId, productId: id, ...guard }, data: { stock: { increment: dto.delta } } })
        : await tx.product.updateMany({ where: { id, ...guard }, data: { stock: { increment: dto.delta } } });
      if (!count) {
        if (dto.variantId) await tx.productVariant.findFirstOrThrow({ where: { id: dto.variantId, productId: id } });
        else await tx.product.findUniqueOrThrow({ where: { id } });
        throw new AppError(HttpStatus.CONFLICT, 'INSUFFICIENT_STOCK', 'Le stock ne peut pas devenir négatif');
      }
      if (dto.variantId) await syncProductStock(tx, id);
      await tx.stockMovement.create({ data: { productId: id, variantId: dto.variantId, delta: dto.delta, reason: dto.reason, note: dto.note, actorId: me.id } });
      await this.audit.log(me.id, 'product.stock', 'product', id, dto, tx);
      return tx.product.findUniqueOrThrow({ where: { id }, include });
    });
    return { data: toDto(data) };
  }

  /** Remplace options (Couleur, Bracelet…) et déclinaisons. Options vides : le produit redevient simple. */
  @Put(':id/variants')
  async variants(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VariantsDto, @CurrentUser() me: AuthUser) {
    const data = await this.prisma.$transaction(async (tx) => {
      await replaceVariants(tx, id, dto, me.id);
      await this.audit.log(me.id, 'product.variants', 'product', id, dto, tx);
      return tx.product.findUniqueOrThrow({ where: { id }, include });
    }, { timeout: 20_000 });
    return { data: toDto(data) };
  }

  /* ---------- photos ---------- */

  @Post(':id/images')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async addImage(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() me: AuthUser) {
    const product = await this.prisma.product.findUniqueOrThrow({ where: { id }, include: { images: true } });
    if (product.images.length >= 12) throw new AppError(HttpStatus.CONFLICT, 'TOO_MANY_IMAGES', '12 photos au maximum par produit');
    const saved = await this.uploads.saveImage(file, 'products');
    try {
      const data = await this.prisma.$transaction(async (tx) => {
        await tx.productImage.create({
          data: {
            productId: id, provider: 'LOCAL', storageKey: saved.key, url: saved.url, alt: product.name,
            position: Math.max(-1, ...product.images.map((i) => i.position)) + 1, isPrimary: !product.images.some((i) => i.isPrimary),
          },
        });
        await this.audit.log(me.id, 'product.image_add', 'product', id, { url: saved.url }, tx);
        return tx.product.findUniqueOrThrow({ where: { id }, include });
      });
      return { data: toDto(data) };
    } catch (e) {
      await this.uploads.removeByUrl(saved.url);
      throw e;
    }
  }

  /** Photo principale : affichée sur les cartes et en premier sur la fiche. */
  @Patch(':id/images/:imageId/primary')
  async primaryImage(@Param('id', ParseUUIDPipe) id: string, @Param('imageId', ParseUUIDPipe) imageId: string, @CurrentUser() me: AuthUser) {
    const data = await this.prisma.$transaction(async (tx) => {
      await tx.productImage.findFirstOrThrow({ where: { id: imageId, productId: id } });
      // Index unique partiel « une seule principale » : on retire l'ancienne avant de poser la nouvelle.
      await tx.productImage.updateMany({ where: { productId: id, isPrimary: true }, data: { isPrimary: false } });
      await tx.productImage.update({ where: { id: imageId }, data: { isPrimary: true, position: -1 } });
      const rest = await tx.productImage.findMany({ where: { productId: id }, orderBy: { position: 'asc' } });
      for (const [i, img] of rest.entries()) await tx.productImage.update({ where: { id: img.id }, data: { position: i } });
      await this.audit.log(me.id, 'product.image_primary', 'product', id, { imageId }, tx);
      return tx.product.findUniqueOrThrow({ where: { id }, include });
    });
    return { data: toDto(data) };
  }

  @Delete(':id/images/:imageId')
  async removeImage(@Param('id', ParseUUIDPipe) id: string, @Param('imageId', ParseUUIDPipe) imageId: string, @CurrentUser() me: AuthUser) {
    let url = '';
    const data = await this.prisma.$transaction(async (tx) => {
      const img = await tx.productImage.findFirstOrThrow({ where: { id: imageId, productId: id } });
      url = img.url;
      await tx.productImage.delete({ where: { id: imageId } });
      if (img.isPrimary) {
        const next = await tx.productImage.findFirst({ where: { productId: id }, orderBy: { position: 'asc' } });
        if (next) await tx.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
      }
      await this.audit.log(me.id, 'product.image_remove', 'product', id, { url: img.url }, tx);
      return tx.product.findUniqueOrThrow({ where: { id }, include });
    });
    await this.uploads.removeByUrl(url);
    return { data: toDto(data) };
  }
}
