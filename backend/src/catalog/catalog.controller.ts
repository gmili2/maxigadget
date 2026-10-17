import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Gender, MovementType, Prisma } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { HttpStatus } from '@nestjs/common';
import { Public } from '../common/decorators';
import { AppError, PageQuery, paged, skipTake } from '../common/http';
import { PrismaService } from '../prisma.service';
import { variantInclude, variantValues } from '../admin/variants';
import { SiteAccess, SiteAccessGuard } from '../shop/site-access';
import { PricingService } from './pricing.service';
import { COLLECTION_VISIBLE, VISIBLE } from './visibility';

const bool = () => Transform(({ value }) => value === true || value === 'true' || value === '1');
const NEW_DAYS = 60;

class ProductQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() collection?: string;
  @IsOptional() @IsString() brand?: string;
  /** Étiquette du site (homme, femme, auto, classique, sport, new). */
  @IsOptional() @IsString() tag?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsEnum(MovementType) movement?: MovementType;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxPrice?: number;
  @IsOptional() @bool() @IsBoolean() inStock?: boolean;
  @IsOptional() @bool() @IsBoolean() onSale?: boolean;
  @IsOptional() @bool() @IsBoolean() isNew?: boolean;
  @IsOptional() @bool() @IsBoolean() featured?: boolean;
  @IsOptional() @IsIn(['price_asc', 'price_desc', 'newest', 'popular', 'rating']) sort?: string;
}

const include = {
  brand: { select: { name: true, slug: true } },
  category: { select: { name: true, slug: true } },
  collection: { select: { name: true, slug: true } },
  images: { orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }], select: { url: true, alt: true, width: true, height: true, isPrimary: true } },
  videos: { orderBy: { position: 'asc' }, select: { url: true } },
  ...variantInclude,
} satisfies Prisma.ProductInclude;
type ProductRow = Prisma.ProductGetPayload<{ include: typeof include }>;

@Public()
@Controller()
export class CatalogController {
  constructor(private prisma: PrismaService, private pricing: PricingService, private access: SiteAccess) {}

  @UseGuards(SiteAccessGuard)
  @Get('products')
  async products(@Query() q: ProductQuery) {
    // Les produits d'une catégorie masquée ou d'une collection archivée n'apparaissent nulle part dans la boutique.
    const where: Prisma.ProductWhereInput = { ...VISIBLE };
    const and: Prisma.ProductWhereInput[] = [COLLECTION_VISIBLE];
    if (q.q) and.push({ OR: [
      { name: { contains: q.q } }, { description: { contains: q.q } },
      { sku: { contains: q.q } }, { collection: { name: { contains: q.q } } },
    ] });
    if (q.category) where.category = { isActive: true, slug: q.category };
    if (q.collection) where.collection = { slug: q.collection };
    if (q.brand) where.brand = { slug: q.brand };
    if (q.tag) where.extraSpecs = { path: '$.tags', array_contains: [q.tag] };
    // Couleur principale du produit ou l'une de ses déclinaisons actives.
    if (q.color) and.push({ OR: [
      { color: { equals: q.color } },
      { variants: { some: { isActive: true, values: { some: { optionValue: { label: { equals: q.color } } } } } } },
    ] });
    if (q.movement) where.movementType = q.movement;
    if (q.gender) where.gender = q.gender;
    if (q.inStock) and.push({ OR: [{ stock: { gt: 0 } }, { unlimitedStock: true }] });
    if (q.featured) where.isFeatured = true;
    if (q.isNew) where.publishedAt = { gte: new Date(Date.now() - NEW_DAYS * 86_400_000) };
    where.AND = and;

    const orderBy: Prisma.ProductOrderByWithRelationInput = {
      price_asc: { priceCents: 'asc' as const }, price_desc: { priceCents: 'desc' as const }, newest: { publishedAt: 'desc' as const },
      rating: { ratingAvg: 'desc' as const }, popular: { soldCount: 'desc' as const },
    }[q.sort ?? 'popular']!;

    // Les filtres de prix et « en promotion » portent sur le prix final : ils sont appliqués après calcul.
    const priceFilter = q.minPrice != null || q.maxPrice != null || q.onSale;
    const [rows, total, promos] = await Promise.all([
      this.prisma.product.findMany({ where, orderBy: [orderBy, { id: 'asc' }], include, ...(priceFilter ? {} : skipTake(q)) }),
      this.prisma.product.count({ where }),
      this.pricing.activePromotions(),
    ]);
    let items = rows.map((p) => this.toDto(p, promos));
    if (!priceFilter) return paged(items, total, q);

    items = items.filter((p) => (q.minPrice == null || p.finalPriceCents >= q.minPrice) && (q.maxPrice == null || p.finalPriceCents <= q.maxPrice) && (!q.onSale || p.onSale));
    const { skip, take } = skipTake(q);
    return paged(items.slice(skip, skip + take), items.length, q);
  }

  @UseGuards(SiteAccessGuard)
  @Get('products/:slug')
  async product(@Param('slug') slug: string) {
    const p = await this.prisma.product.findFirst({ where: { slug, ...VISIBLE }, include });
    if (!p) throw new AppError(HttpStatus.NOT_FOUND, 'PRODUCT_NOT_FOUND', 'المنتج غير موجود');
    const reviews = await this.prisma.review.findMany({
      where: { productId: p.id, status: 'APPROVED' }, orderBy: { createdAt: 'desc' }, take: 20,
      select: { id: true, rating: true, title: true, comment: true, createdAt: true, user: { select: { firstName: true, lastName: true } } },
    });
    return {
      data: {
        ...this.toDto(p, await this.pricing.activePromotions()),
        reviews: reviews.map(({ user, ...r }) => ({ ...r, author: user.lastName ? `${user.firstName} ${user.lastName.charAt(0)}.` : user.firstName })),
      },
    };
  }

  @Get('categories')
  async categories() {
    const data = await this.prisma.category.findMany({ where: { isActive: true }, orderBy: { position: 'asc' }, select: { id: true, name: true, slug: true, description: true, imageUrl: true, parentId: true } });
    return { data };
  }

  @Get('collections')
  async collections() {
    const data = await this.prisma.collection.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, description: true, coverUrl: true } });
    return { data };
  }

  @Get('brands')
  async brands() {
    const data = await this.prisma.brand.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, description: true, logoUrl: true } });
    return { data };
  }

  private toDto(p: ProductRow, promos: Awaited<ReturnType<PricingService['activePromotions']>>) {
    const variants = p.variants.filter((v) => v.isActive).map((v) => ({
      id: v.id, sku: v.sku, values: variantValues(v), ...this.pricing.variantPrice(p, v, promos),
      inStock: p.unlimitedStock || v.stock > 0, lowStock: !p.unlimitedStock && v.stock > 0 && v.stock <= p.lowStockThreshold, imageUrl: v.imageUrl,
    }));
    // Les valeurs sans déclinaison active sont masquées ; une option avec pastilles sert d'aperçu des coloris.
    const used = new Set(variants.flatMap((v) => v.values.map((x) => x.id)));
    const options = p.options.map((o) => ({
      name: o.name, values: o.values.filter((v) => used.has(v.id)).map(({ id, label, colorHex }) => ({ id, label, colorHex })),
    })).filter((o) => o.values.length);
    const base = this.pricing.price(p, promos);
    const finals = variants.map((v) => v.finalPriceCents);
    return {
      id: p.id, slug: p.slug, name: p.name, shortDescription: p.shortDescription, description: p.description, sku: p.sku,
      currency: p.currency, ...base,
      priceFromCents: finals.length ? Math.min(...finals) : base.finalPriceCents,
      hasPriceRange: finals.length > 1 && Math.min(...finals) !== Math.max(...finals),
      inStock: p.unlimitedStock || p.stock > 0, lowStock: !p.unlimitedStock && p.stock > 0 && p.stock <= p.lowStockThreshold,
      stock: !p.unlimitedStock && p.stock <= p.lowStockThreshold ? p.stock : null,
      isFeatured: p.isFeatured, purchasable: p.purchasable || this.access.enabled, gender: p.gender, brand: p.brand, category: p.category, collection: p.collection,
      movementType: p.movementType, caliber: p.caliber, caseMaterial: p.caseMaterial, strapMaterial: p.strapMaterial,
      color: p.color, dialColor: p.dialColor, diameterMm: Number(p.diameterMm), thicknessMm: p.thicknessMm == null ? null : Number(p.thicknessMm),
      lugWidthMm: p.lugWidthMm, waterResistanceM: p.waterResistanceM, glass: p.glass, powerReserveHours: p.powerReserveHours,
      warrantyMonths: p.warrantyMonths, extraSpecs: p.extraSpecs, ratingAvg: Number(p.ratingAvg), ratingCount: p.ratingCount,
      publishedAt: p.publishedAt, images: p.images, videos: p.videos.map((v) => v.url),
      swatches: options.find((o) => o.values.some((v) => v.colorHex))?.values ?? [],
      options, variants,
    };
  }

}
