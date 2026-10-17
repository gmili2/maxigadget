import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useCatalog } from './catalog';
import type { Product, Variant } from './data';
import { track } from './pixel';

/** Ligne de panier : produit (slug) et, le cas échéant, déclinaison choisie. */
export interface CartLine { id: string; qty: number; variantId?: string; }
/** Ligne résolue avec le catalogue courant (prix et libellés à jour). */
export interface CartItem { key: string; qty: number; product: Product; variant?: Variant; unit: number; label: string | null; sku: string; image?: string; }

export const lineKey = (id: string, variantId?: string) => (variantId ? `${id}:${variantId}` : id);
const keyOf = (l: CartLine) => lineKey(l.id, l.variantId);

interface Store {
  cart: CartLine[];
  items: CartItem[];
  favs: string[];
  count: number;
  subtotal: number;
  /** Remise par quantité estimée (DH) et son libellé ; prochain palier à atteindre. */
  qtyDiscount: number;
  qtyLabel: string | null;
  nextTier: { missing: number; amount: number } | null;
  add: (id: string, qty?: number, variantId?: string) => void;
  setQty: (key: string, delta: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  toggleFav: (id: string) => void;
  drawer: boolean;
  menu: boolean;
  search: boolean;
  openDrawer: () => void;
  openMenu: () => void;
  openSearch: () => void;
  closeAll: () => void;
}

const Ctx = createContext<Store | null>(null);

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const catalog = useCatalog();
  const [cart, setCart] = useState<CartLine[]>(() => load<CartLine[]>('gm:cart', []));
  const [favs, setFavs] = useState<string[]>(() => load<string[]>('gm:favs', []));
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);

  useEffect(() => save('gm:cart', cart), [cart]);

  // Une fois le catalogue chargé, retire les produits ou déclinaisons qui ne sont plus en vente.
  useEffect(() => {
    if (catalog.status !== 'ready') return;
    setCart((c) => {
      const ok = c.filter((l) => {
        const p = catalog.find(l.id);
        if (!p || !p.purchasable) return false;
        return l.variantId ? p.variants.some((v) => v.id === l.variantId) : !p.variants.length;
      });
      return ok.length === c.length ? c : ok;
    });
  }, [catalog]);
  useEffect(() => save('gm:favs', favs), [favs]);

  const closeAll = useCallback(() => { setDrawer(false); setMenu(false); setSearch(false); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAll(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeAll]);

  // Bloque le défilement de la page quand un panneau est ouvert
  useEffect(() => {
    document.body.style.overflow = drawer || menu ? 'hidden' : '';
  }, [drawer, menu]);

  const value = useMemo<Store>(() => {
    const items: CartItem[] = cart.flatMap((l) => {
      const product = catalog.find(l.id);
      if (!product) return [];
      const variant = l.variantId ? product.variants.find((v) => v.id === l.variantId) : undefined;
      if (l.variantId && !variant) return [];
      return [{
        key: keyOf(l), qty: l.qty, product, variant, unit: variant?.price ?? product.price,
        label: variant ? variant.values.map((v) => v.label).join(' · ') : null, sku: variant?.sku ?? product.sku ?? product.id,
        // Photo de la couleur choisie, sinon la photo principale.
        image: variant?.imageUrl ?? product.image,
      }];
    });
    const count = items.reduce((a, l) => a + l.qty, 0);
    const subtotal = items.reduce((a, l) => a + l.unit * l.qty, 0);
    const tier = [...catalog.qtyTiers].reverse().find((t) => t.minQty <= count);
    const next = catalog.qtyTiers.find((t) => t.minQty > count);
    const qtyDiscount = tier ? Math.min(tier.amount, subtotal) : 0;
    return {
      cart, items, favs, count, subtotal, drawer, menu, search,
      qtyDiscount, qtyLabel: tier ? `خصم ${tier.minQty} منتجات` : null, nextTier: count && next ? { missing: next.minQty - count, amount: next.amount } : null,
      add: (id, qty = 1, variantId) => {
        const key = lineKey(id, variantId);
        const p = catalog.find(id);
        const unit = (variantId && p?.variants.find((v) => v.id === variantId)?.price) || p?.price;
        if (p) track('AddToCart', { content_ids: [id], content_name: p.name, content_type: 'product', value: (unit ?? 0) * qty, currency: 'MAD' });
        setCart((c) => {
          const i = c.findIndex((l) => keyOf(l) === key);
          if (i < 0) return [...c, { id, qty, ...(variantId && { variantId }) }];
          const next = c.slice();
          next[i] = { ...next[i], qty: next[i].qty + qty };
          return next;
        });
        setMenu(false); setSearch(false); setDrawer(true);
      },
      setQty: (key, d) => setCart((c) => c.map((l) => (keyOf(l) === key ? { ...l, qty: Math.min(10, Math.max(1, l.qty + d)) } : l))),
      remove: (key) => setCart((c) => c.filter((l) => keyOf(l) !== key)),
      clear: () => setCart([]),
      toggleFav: (id) => setFavs((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id])),
      openDrawer: () => { setMenu(false); setSearch(false); setDrawer(true); },
      openMenu: () => setMenu(true),
      openSearch: () => { setMenu(false); setDrawer(false); setSearch(true); },
      closeAll,
    };
  }, [cart, catalog, favs, drawer, menu, search, closeAll]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore doit être utilisé dans <StoreProvider>');
  return s;
}
