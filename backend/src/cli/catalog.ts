/**
 * Catalogue de départ (produits, catégories, marque, livraison), partagé par :
 * - prisma/seed.ts (données de démonstration complètes, base vidée au préalable) ;
 * - src/cli/bootstrap.ts (premier démarrage en production, sans rien écraser).
 */
import { PrismaClient, ProductStatus } from '@prisma/client';
import products from './catalog-products.json';

/** Montant en dirhams → centimes. Les prix du catalogue (catalog-products.json) sont en DH. */
const dh = (n: number) => Math.round(n * 100);

export const HOUSE = 'MaxiGadget';

/* Options et déclinaisons de démonstration (leur stock total doit égaler celui du produit). */
export const VARIANTS: Record<string, {
  options: { name: string; values: [label: string, hex: string | null][] }[];
  variants: { values: string[]; suffix: string; stock: number; priceCents?: number }[];
}> = {
  'fascia-gun': {
    options: [{ name: 'Couleur', values: [['Blanc', '#F2F2F0'], ['Noir', '#1D1D1F']] }],
    variants: [{ values: ['Blanc'], suffix: 'BL', stock: 30 }, { values: ['Noir'], suffix: 'NO', stock: 15 }],
  },
};

/* Images de départ : photos présentes dans public/ (remplaçables depuis Admin → Catégories). */
export const CATEGORIES: [slug: string, name: string, description: string, imageUrl: string | null][] = [
  ['soin-visage', 'Soin du visage', 'Lifting, LED, nettoyage : des soins d’institut, à la maison.', '/neck-beauty-device.jpg'],
  ['massage', 'Massage', 'Pistolets, masseurs cervicaux et coussins pour détendre chaque muscle.', '/fascia-gun.jpg'],
  ['corps-minceur', 'Corps & minceur', 'Ceintures EMS, rouleaux et appareils pour sculpter et tonifier.', null],
  ['epilation-cheveux', 'Épilation & cheveux', 'Épilateurs IPL, brosses lissantes et soins capillaires.', null],
  ['cosmetiques', 'Cosmétiques', 'Sérums, crèmes et huiles pour compléter votre routine.', null],
  ['packs', 'Packs', 'Deux produits ou plus réunis, à prix réduit.', '/pack-beaute-bien-etre.jpg'],
];

export type CatalogProduct = { id: string; name: string; sku: string; unit: number; variants: Record<string, { id: string; sku: string; unit: number }> };

/** Marque maison, catégories et livraison : créées seulement si elles n'existent pas. */
export async function installReferenceData(prisma: PrismaClient) {
  const brands: Record<string, string> = {};
  const house = await prisma.brand.findUnique({ where: { slug: 'maxigadget' } })
    ?? await prisma.brand.create({ data: { name: HOUSE, slug: 'maxigadget', description: 'Solutions pratiques au quotidien.' } });
  brands[HOUSE] = house.id;

  const cats: Record<string, string> = {};
  for (const [i, [slug, name, description, imageUrl]] of CATEGORIES.entries()) {
    const c = await prisma.category.findUnique({ where: { slug } })
      ?? await prisma.category.create({ data: { slug, name, description, imageUrl, position: i } });
    cats[slug] = c.id;
  }

  let shipping = await prisma.shippingMethod.findFirst({ where: { isActive: true }, orderBy: { position: 'asc' } });
  if (!shipping) {
    const zone = await prisma.shippingZone.create({ data: { name: 'Maroc', countries: ['MA'] } });
    shipping = await prisma.shippingMethod.create({
      data: { zoneId: zone.id, name: 'Livraison gratuite', carrier: 'Amana', priceCents: 0, minDays: 1, maxDays: 3, codAllowed: true, position: 0 },
    });
  }
  return { brands, cats, shipping };
}

/**
 * Produits du catalogue de départ (avec photos, options et déclinaisons). Les produits déjà présents (même slug) sont ignorés.
 * Les produits sans photo sont créés en brouillon : à publier depuis l'admin une fois les photos ajoutées.
 */
export async function installCatalog(prisma: PrismaClient, actorId: string, refs: Awaited<ReturnType<typeof installReferenceData>>) {
  const { brands, cats } = refs;
  const prod: Record<string, CatalogProduct> = {};
  for (const p of products) {
    if (await prisma.product.findUnique({ where: { slug: p.slug }, select: { id: true } })) continue;
    const status = p.status as ProductStatus;
    const isNew = p.cats.includes('new');
    const created = await prisma.product.create({
      data: {
        name: p.name, slug: p.slug, shortDescription: p.kind, description: p.desc, reference: p.sku, sku: p.sku,
        priceCents: dh(p.old ?? p.price), salePriceCents: p.old ? dh(p.price) : null, stock: p.stock, status, isFeatured: isNew,
        brandId: brands[HOUSE], categoryId: cats[p.category],
        // Colonnes héritées du modèle « montre » de la base : valeurs neutres, non affichées en boutique.
        movementType: 'QUARTZ', caseMaterial: '—', strapMaterial: '—', diameterMm: 10, waterResistanceM: 0, glass: '—',
        color: p.color, warrantyMonths: p.warranty,
        extraSpecs: { tags: p.cats, features: p.features, specs: p.specs },
        soldCount: p.sold,
        publishedAt: status === 'ACTIVE' ? new Date(isNew ? '2026-10-01T09:00:00Z' : '2026-06-01T09:00:00Z') : null,
        stockMovements: { create: { delta: p.stock, reason: 'INITIAL', actorId } },
        // Photos servies par le front (public/) tant que Cloudinary/S3 n'est pas configuré.
        images: p.images.length ? {
          create: p.images.map((url, i) => ({ provider: 'LOCAL' as const, storageKey: url.replace(/^\//, ''), url, alt: p.name, position: i, isPrimary: i === 0 })),
        } : undefined,
      },
    });
    prod[p.slug] = { id: created.id, name: p.name, sku: p.sku, unit: p.price * 100, variants: {} };

    const conf = VARIANTS[p.slug];
    if (conf) {
      const valueIds = new Map<string, string>();
      for (const [i, o] of conf.options.entries()) {
        const option = await prisma.productOption.create({
          data: { productId: created.id, name: o.name, position: i, values: { create: o.values.map(([label, colorHex], j) => ({ label, colorHex, position: j })) } },
          include: { values: true },
        });
        option.values.forEach((v) => valueIds.set(v.label, v.id));
      }
      // Le stock initial du produit est remplacé par celui des déclinaisons (même total).
      await prisma.stockMovement.deleteMany({ where: { productId: created.id } });
      for (const [i, v] of conf.variants.entries()) {
        const sku = `${p.sku}-${v.suffix}`;
        const variant = await prisma.productVariant.create({
          data: {
            productId: created.id, sku, stock: v.stock, priceCents: v.priceCents ?? null, position: i,
            values: { create: v.values.map((label) => ({ optionValueId: valueIds.get(label)! })) },
            stockMovements: v.stock ? { create: { productId: created.id, delta: v.stock, reason: 'INITIAL', actorId } } : undefined,
          },
        });
        prod[p.slug].variants[v.values.join(' · ')] = { id: variant.id, sku, unit: v.priceCents ?? p.price * 100 };
      }
      const total = conf.variants.reduce((n, v) => n + v.stock, 0);
      if (total !== p.stock) throw new Error(`Stock des déclinaisons de ${p.slug} (${total}) ≠ ${p.stock}`);
    }
  }
  return prod;
}
