/** Palier : dès `minQty` montres, `amountCents` de réduction. */
export type Tier = { minQty: number; amountCents: number };
type Line = { productId: string; name: string; quantity: number; totalCents: number };

const best = (tiers: Tier[], qty: number) => tiers.filter((t) => t.minQty <= qty).sort((a, b) => b.minQty - a.minQty)[0] ?? null;
const next = (tiers: Tier[], qty: number) => tiers.filter((t) => t.minQty > qty).sort((a, b) => a.minQty - b.minQty)[0] ?? null;

/**
 * Remise par quantité d'un panier.
 * - Une montre qui a ses propres paliers : ils comptent les exemplaires de ce modèle (remise plafonnée à son montant).
 * - Les autres montres comptent ensemble pour les paliers généraux.
 * Renvoie la remise totale, son libellé et le prochain palier le plus proche (« Ajoutez 1 … et économisez X DH »).
 */
export function quantityDiscount(lines: Line[], productTiers: Map<string, Tier[]>, globalTiers: Tier[]) {
  const byProduct = new Map<string, { name: string; qty: number; cents: number }>();
  for (const l of lines) {
    const g = byProduct.get(l.productId) ?? { name: l.name, qty: 0, cents: 0 };
    g.qty += l.quantity; g.cents += l.totalCents;
    byProduct.set(l.productId, g);
  }
  const parts: string[] = [];
  const hints: { missing: number; amountCents: number; productName: string | null }[] = [];
  let total = 0;
  let pool = { qty: 0, cents: 0 };
  for (const [id, g] of byProduct) {
    const own = productTiers.get(id);
    if (!own?.length) { pool = { qty: pool.qty + g.qty, cents: pool.cents + g.cents }; continue; }
    const t = best(own, g.qty);
    if (t) { total += Math.min(t.amountCents, g.cents); parts.push(`خصم ${g.qty} × ${g.name}`); }
    const n = next(own, g.qty);
    if (n) hints.push({ missing: n.minQty - g.qty, amountCents: n.amountCents, productName: g.name });
  }
  if (pool.qty) {
    const t = best(globalTiers, pool.qty);
    if (t) { total += Math.min(t.amountCents, pool.cents); parts.push(`خصم ${t.minQty} منتجات`); }
    const n = next(globalTiers, pool.qty);
    if (n) hints.push({ missing: n.minQty - pool.qty, amountCents: n.amountCents, productName: null });
  }
  hints.sort((a, b) => a.missing - b.missing || b.amountCents - a.amountCents);
  return {
    amountCents: total,
    label: parts.length === 1 ? parts[0].slice(0, 100) : parts.length ? 'خصومات الكمية' : null,
    nextTier: hints[0] ?? null,
  };
}
