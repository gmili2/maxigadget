import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { AppError } from '../common/http';

type Tx = Prisma.TransactionClient;

export class OptionValueDto {
  @IsString() @MinLength(1) @MaxLength(60) label: string;
  @IsOptional() @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Couleur : format #RRGGBB' }) colorHex?: string | null;
}
export class OptionDto {
  @IsString() @MinLength(1) @MaxLength(40) name: string;
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => OptionValueDto) values: OptionValueDto[];
}
export class VariantDto {
  @IsOptional() @IsUUID() id?: string;
  /** Libellés des valeurs, dans l'ordre des options. */
  @IsArray() @ArrayMaxSize(3) @IsString({ each: true }) values: string[];
  @Matches(/^[A-Z0-9][A-Z0-9-]{1,59}$/, { message: 'SKU : majuscules, chiffres et tirets' }) sku: string;
  @IsOptional() @IsInt() @Min(1) priceCents?: number | null;
  @IsOptional() @IsInt() @Min(1) salePriceCents?: number | null;
  @IsInt() @Min(0) @Max(100_000) stock: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  /** Photo de la déclinaison : une photo du site (/api/uploads/…, /fichier.jpg) ou une adresse https. */
  @IsOptional() @MaxLength(500) @Matches(/^(https:\/\/\S+|\/[\w./-]+\.(jpe?g|png|webp))$/i, { message: 'Photo de déclinaison invalide' }) imageUrl?: string | null;
}
export class VariantsDto {
  @IsArray() @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => OptionDto) options: OptionDto[];
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => VariantDto) variants: VariantDto[];
}

export const variantInclude = {
  options: { orderBy: { position: 'asc' }, include: { values: { orderBy: { position: 'asc' } } } },
  variants: {
    orderBy: { position: 'asc' },
    include: { values: { include: { optionValue: { select: { id: true, label: true, colorHex: true, option: { select: { position: true } } } } } } },
  },
} satisfies Prisma.ProductInclude;

type WithVariants = Prisma.ProductGetPayload<{ include: typeof variantInclude }>;

/** Valeurs d'une déclinaison, triées dans l'ordre des options. */
export const variantValues = (v: WithVariants['variants'][number]) =>
  v.values.map((x) => x.optionValue).sort((a, b) => a.option.position - b.option.position).map(({ id, label, colorHex }) => ({ id, label, colorHex }));
export const variantLabel = (v: WithVariants['variants'][number]) => variantValues(v).map((x) => x.label).join(' · ');

const bad = (message: string, details?: unknown) => new AppError(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', message, details);
const norm = (s: string) => s.trim().toLocaleLowerCase('fr');

function validate(dto: VariantsDto, basePrice: number, baseSale: number | null) {
  const names = dto.options.map((o) => norm(o.name));
  if (new Set(names).size !== names.length) throw bad('Deux options portent le même nom');
  for (const o of dto.options) {
    if (!o.values.length) throw bad(`L’option « ${o.name} » n’a aucune valeur`);
    const labels = o.values.map((v) => norm(v.label));
    if (new Set(labels).size !== labels.length) throw bad(`Valeur en double dans « ${o.name} »`);
  }
  if (!dto.options.length && dto.variants.length) throw bad('Des déclinaisons sans option');
  if (dto.options.length && !dto.variants.length) throw bad('Ajoutez au moins une déclinaison');

  const combos = new Set<string>(), skus = new Set<string>();
  for (const v of dto.variants) {
    if (v.values.length !== dto.options.length) throw bad(`Déclinaison ${v.sku} : une valeur par option est attendue`);
    v.values.forEach((label, i) => {
      if (!dto.options[i].values.some((x) => norm(x.label) === norm(label))) throw bad(`Déclinaison ${v.sku} : « ${label} » n’existe pas dans « ${dto.options[i].name} »`);
    });
    const key = v.values.map(norm).join('|');
    if (combos.has(key)) throw bad(`Combinaison en double : ${v.values.join(' · ')}`);
    combos.add(key);
    if (skus.has(v.sku)) throw bad(`SKU en double : ${v.sku}`);
    skus.add(v.sku);
    const price = v.priceCents ?? basePrice;
    const sale = v.priceCents != null ? v.salePriceCents : v.salePriceCents ?? baseSale;
    if (sale != null && sale >= price) throw bad(`Déclinaison ${v.sku} : le prix promo doit être inférieur au prix`);
  }
}

/** Somme du stock des déclinaisons actives, recopiée sur le produit (filtres, alertes stock faible). */
export async function syncProductStock(tx: Tx, productId: string) {
  const agg = await tx.productVariant.aggregate({ where: { productId, isActive: true }, _sum: { stock: true }, _count: true });
  if (agg._count) await tx.product.update({ where: { id: productId }, data: { stock: agg._sum.stock ?? 0 } });
}

/**
 * Remplace la configuration complète options + déclinaisons d'un produit.
 * Les déclinaisons existantes (par id) sont conservées et leurs écarts de stock journalisés ;
 * une déclinaison supprimée garde sa trace dans les commandes (libellé et SKU figés).
 */
export async function replaceVariants(tx: Tx, productId: string, dto: VariantsDto, actorId: string) {
  const product = await tx.product.findUniqueOrThrow({ where: { id: productId }, include: variantInclude });
  validate(dto, product.priceCents, product.salePriceCents);

  // Options et valeurs : mises à jour sur place pour garder des identifiants stables.
  const keepOptions = new Set<string>();
  const valueIds: Map<string, string>[] = [];
  for (const [i, o] of dto.options.entries()) {
    const existing = product.options.find((x) => norm(x.name) === norm(o.name));
    const option = existing
      ? await tx.productOption.update({ where: { id: existing.id }, data: { name: o.name.trim(), position: i } })
      : await tx.productOption.create({ data: { productId, name: o.name.trim(), position: i } });
    keepOptions.add(option.id);
    const ids = new Map<string, string>();
    const keepValues: string[] = [];
    for (const [j, v] of o.values.entries()) {
      const prev = existing?.values.find((x) => norm(x.label) === norm(v.label));
      const data = { label: v.label.trim(), colorHex: v.colorHex?.toUpperCase() ?? null, position: j };
      const value = prev
        ? await tx.productOptionValue.update({ where: { id: prev.id }, data })
        : await tx.productOptionValue.create({ data: { ...data, optionId: option.id } });
      ids.set(norm(v.label), value.id);
      keepValues.push(value.id);
    }
    await tx.productOptionValue.deleteMany({ where: { optionId: option.id, id: { notIn: keepValues } } });
    valueIds.push(ids);
  }
  await tx.productOption.deleteMany({ where: { productId, id: { notIn: [...keepOptions] } } });

  // Déclinaisons.
  const keepVariants: string[] = [];
  for (const [i, v] of dto.variants.entries()) {
    const prev = v.id ? product.variants.find((x) => x.id === v.id) : undefined;
    if (v.id && !prev) throw bad('Déclinaison inconnue pour ce produit', v.id);
    const data = {
      sku: v.sku, priceCents: v.priceCents ?? null, salePriceCents: v.salePriceCents ?? null, stock: v.stock,
      isActive: v.isActive ?? true, imageUrl: v.imageUrl ?? null, position: i,
    };
    const variant = prev
      ? await tx.productVariant.update({ where: { id: prev.id }, data })
      : await tx.productVariant.create({ data: { ...data, productId } });
    keepVariants.push(variant.id);
    const delta = v.stock - (prev?.stock ?? 0);
    if (delta) {
      await tx.stockMovement.create({
        data: { productId, variantId: variant.id, delta, reason: prev ? 'ADJUSTMENT' : 'INITIAL', actorId, note: prev ? 'Fiche produit' : 'Nouvelle déclinaison' },
      });
    }
    await tx.productVariantValue.deleteMany({ where: { variantId: variant.id } });
    await tx.productVariantValue.createMany({ data: v.values.map((label, k) => ({ variantId: variant.id, optionValueId: valueIds[k].get(norm(label))! })) });
  }
  for (const gone of product.variants.filter((x) => !keepVariants.includes(x.id))) {
    if (gone.stock) {
      await tx.stockMovement.create({ data: { productId, delta: -gone.stock, reason: 'ADJUSTMENT', actorId, note: `Déclinaison ${gone.sku} supprimée` } });
    }
    await tx.productVariant.delete({ where: { id: gone.id } });
  }

  if (dto.variants.length) await syncProductStock(tx, productId);
}
