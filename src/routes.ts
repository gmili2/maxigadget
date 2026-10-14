import type { CategoryId } from './data';

const SLUGS: Record<Exclude<CategoryId, 'all'>, string> = {
  visage: 'soin-visage',
  massage: 'massage',
  corps: 'corps-minceur',
  epilation: 'epilation-cheveux',
  cosmetique: 'cosmetiques',
  pack: 'packs',
  new: 'nouveautes',
};

export const shopPath = (cat: CategoryId = 'all') => (cat === 'all' ? '/produits' : `/produits/${SLUGS[cat]}`);
export const productPath = (id: string) => `/produit/${id}`;

export function catFromSlug(slug?: string): CategoryId | null {
  if (!slug) return 'all';
  const hit = (Object.keys(SLUGS) as Exclude<CategoryId, 'all'>[]).find((k) => SLUGS[k] === slug);
  return hit ?? null;
}

export const PATHS = {
  home: '/',
  admin: '/admin',
  collections: '/categories',
  cart: '/panier',
  checkout: '/commande',
  about: '/a-propos',
  contact: '/contact',
  faq: '/faq',
  cgv: '/cgv',
  privacy: '/confidentialite',
  account: '/compte',
  charte: '/charte-graphique',
};
