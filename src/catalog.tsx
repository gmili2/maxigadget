import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import type { CategoryId, Product, Swatch, Variant } from './data';

/* Catalogue de la boutique, chargé une fois depuis l'API (produits publiés uniquement). */

type ApiSwatch = { id: string; label: string; colorHex: string | null };
type ApiVariant = { id: string; sku: string; values: ApiSwatch[]; priceCents: number; finalPriceCents: number; onSale: boolean; inStock: boolean; lowStock: boolean; imageUrl: string | null };
export type ApiShopProduct = {
  slug: string; sku: string; name: string; shortDescription: string | null; description: string;
  priceCents: number; finalPriceCents: number; onSale: boolean; priceFromCents: number; hasPriceRange: boolean;
  inStock: boolean; lowStock: boolean; stock: number | null; isFeatured: boolean; purchasable: boolean;
  brand: { name: string }; images: { url: string; alt: string | null }[]; videos?: string[];
  category: { slug: string; name: string }; collection: { name: string; slug: string } | null;
  color: string; warrantyMonths: number; ratingAvg: number; ratingCount: number;
  publishedAt: string | null; extraSpecs: { tags?: string[]; kind?: string; features?: string[]; specs?: [string, string][] } | null;
  options: { name: string; values: ApiSwatch[] }[]; variants: ApiVariant[]; swatches: ApiSwatch[];
};

type Tag = Exclude<CategoryId, 'all'>;
const TAGS: Tag[] = ['visage', 'massage', 'corps', 'epilation', 'cosmetique', 'pack', 'new'];
const CATEGORY_TAG: Record<string, Tag> = {
  'soin-visage': 'visage', massage: 'massage', 'corps-minceur': 'corps', 'epilation-cheveux': 'epilation', cosmetiques: 'cosmetique', packs: 'pack',
};
const NEW_DAYS = 45;
const HOUSE = 'MaxiGadget';
const dh = (c: number) => c / 100;
const swatch = ({ label, colorHex }: ApiSwatch): Swatch => ({ label, colorHex });

/** Étiquettes de la boutique : celles saisies au lancement, complétées par la catégorie et la date de publication. */
function tagsOf(p: ApiShopProduct): Tag[] {
  const t = new Set<Tag>((p.extraSpecs?.tags ?? []).filter((x): x is Tag => (TAGS as string[]).includes(x)));
  if (CATEGORY_TAG[p.category.slug]) t.add(CATEGORY_TAG[p.category.slug]);
  if (p.publishedAt && Date.now() - new Date(p.publishedAt).getTime() < NEW_DAYS * 86_400_000) t.add('new');
  return [...t];
}

/**
 * En ligne, les photos envoyées depuis l'admin sont servies directement par le serveur web via /media
 * (lien vers le dossier uploads de l'API) : plus rapide que de passer par Node. En local, l'API les sert.
 */
export const media = (url: string | null | undefined) =>
  url && import.meta.env.PROD && url.startsWith('/api/uploads/') ? '/media/' + url.slice('/api/uploads/'.length) : url ?? undefined;

export function toShopProduct(p: ApiShopProduct): Product {
  const x = p.extraSpecs ?? {};
  const variants: Variant[] = p.variants.map((v) => ({
    id: v.id, sku: v.sku, values: v.values.map(swatch), price: dh(v.finalPriceCents), old: v.onSale ? dh(v.priceCents) : null,
    inStock: v.inStock, lowStock: v.lowStock, imageUrl: media(v.imageUrl) ?? null,
  }));
  // Prix affiché sur les cartes : la déclinaison la moins chère (avec son prix barré éventuel).
  const cheapest = variants.length ? variants.reduce((a, b) => (b.price < a.price ? b : a)) : null;
  return {
    id: p.slug, sku: p.sku, name: p.name, brand: p.brand.name === HOUSE ? undefined : p.brand.name, image: media(p.images[0]?.url), photos: p.images.map((i) => media(i.url)!), videos: (p.videos ?? []).map((v) => media(v)!),
    col: p.collection?.name ?? '', kind: p.shortDescription ?? x.kind ?? p.category.name,
    cats: tagsOf(p),
    price: cheapest ? cheapest.price : dh(p.finalPriceCents),
    old: cheapest ? cheapest.old : p.onSale ? dh(p.priceCents) : null,
    hasRange: p.hasPriceRange, rating: p.ratingAvg, reviews: p.ratingCount, inStock: p.inStock, purchasable: p.purchasable,
    stock: !p.inStock ? 'نفد المخزون — سيعود قريباً' : p.lowStock && p.stock ? `بقي ${p.stock} فقط في المخزون` : 'متوفر — يُرسَل خلال 24 ساعة',
    features: (x.features ?? []).filter(Boolean), specs: (x.specs ?? []).filter(([k, v]) => k && v), warranty: p.warrantyMonths,
    desc: p.description, publishedAt: p.publishedAt,
    options: p.options.map((o) => ({ name: o.name, values: o.values.map(swatch) })), variants, swatches: p.swatches.map(swatch),
  };
}

export type ShopCategory = { slug: string; name: string; description: string | null; imageUrl: string | null };
/** Catégorie en base correspondant à une carte de collection du site (« Nouveautés » n'en a pas). */
export const CATEGORY_OF: Partial<Record<Tag, string>> = Object.fromEntries(Object.entries(CATEGORY_TAG).map(([slug, tag]) => [tag, slug]));

/** Boutique en accès privé : code requis ? déjà saisi sur ce navigateur ? */
export type SiteInfo = { private: boolean; unlocked: boolean; pixelId?: string | null };

type Catalog = {
  site: SiteInfo | null;
  /** À appeler après la saisie du bon code d'accès. */
  unlocked: () => void;
  products: Product[];
  categories: ShopCategory[];
  /** Image d'une carte de collection : celle de la catégorie, sinon la photo du produit le plus récent concerné. */
  imageFor: (tag: Tag) => string | undefined;
  /** Carte ou filtre lié à une catégorie masquée dans l'administration. */
  hidden: (id: CategoryId) => boolean;
  status: 'loading' | 'ready' | 'error';
  find: (slug: string) => Product | undefined;
  reload: () => void;
};
const Ctx = createContext<Catalog | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [status, setStatus] = useState<Catalog['status']>('loading');
  const [site, setSite] = useState<SiteInfo | null>(null);

  const load = useCallback(async () => {
    try {
      // Les pages de l'API sont limitées à 50 : la première s'affiche dès son arrivée, les suivantes sont demandées en parallèle.
      const page = (n: number) => api<{ data: ApiShopProduct[]; meta: { totalPages: number } }>(`/products?sort=popular&limit=50&page=${n}`);
      const [first, cats] = await Promise.all([page(1), api<{ data: ShopCategory[] }>('/categories')]);
      setCategories(cats.data);
      setProducts(first.data.map(toShopProduct));
      const rest = await Promise.all(Array.from({ length: first.meta.totalPages - 1 }, (_, i) => page(i + 2)));
      // « ready » seulement une fois tout reçu : une fiche absente du premier lot n'est pas encore introuvable.
      setProducts([first, ...rest].flatMap((r) => r.data).map(toShopProduct));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    api<{ data: SiteInfo }>('/site').then((r) => setSite(r.data)).catch(() => setSite({ private: false, unlocked: true }));
  }, []);
  // Catalogue demandé sans attendre /site : boutique publique dans le cas courant.
  // En accès privé, le serveur refuse ce premier essai et le catalogue est rechargé au déverrouillage.
  useEffect(() => { load(); }, [load]);

  const value = useMemo<Catalog>(() => {
    const bySlug = new Map(products.map((p) => [p.id, p]));
    const imageFor = (tag: Tag) => {
      const own = media(categories.find((c) => c.slug === CATEGORY_OF[tag])?.imageUrl);
      if (own) return own;
      return products.filter((p) => p.image && p.cats.includes(tag))
        .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))[0]?.image;
    };
    // Carte ou filtre masqué quand sa catégorie l'est (/categories ne renvoie que les visibles), ou quand plus aucune
    // montre visible ne le concerne (collection archivée, nouveautés épuisées…) : pas de carte vide dans la boutique.
    const hidden = (id: CategoryId) => status === 'ready' && id !== 'all' && (
      (!!CATEGORY_OF[id] && !categories.some((c) => c.slug === CATEGORY_OF[id])) || !products.some((p) => p.cats.includes(id as Tag))
    );
    return { site, unlocked: () => { setSite((s) => (s ? { ...s, unlocked: true } : s)); setStatus('loading'); load(); }, products, categories, imageFor, hidden, status, find: (slug) => bySlug.get(slug), reload: () => { setStatus('loading'); load(); } };
  }, [site, products, categories, status, load]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCatalog() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCatalog doit être utilisé dans <CatalogProvider>');
  return c;
}
