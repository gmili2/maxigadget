import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, apiAll, ApiError, login, logout, refreshSession, setLogoutHandler, type ApiUser } from '../api';
import { pageList } from '../components/Pagination';
import { useLayout } from '../layout';

/* ------------------------------------------------------------------ */
/* Libellés et conversion des données de l'API vers l'interface         */
/* ------------------------------------------------------------------ */

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR') + ' DH';
const DOT = { amber: 'oklch(0.72 0.13 75)', green: 'oklch(0.6 0.11 150)', red: 'oklch(0.58 0.15 25)', ink: 'var(--ink)', grey: '#9A9A94' };
type DotKey = keyof typeof DOT;

const PSTATUS: [string, string][] = [['ACTIVE', 'Actif'], ['DRAFT', 'Brouillon'], ['ARCHIVED', 'Archivé']];
const DTYPES: [string, string][] = [['PERCENTAGE', 'Pourcentage'], ['FIXED_AMOUNT', 'Montant fixe']];
const CARRIERS = ['Amana', 'CTM Messagerie', 'Aramex', 'DHL Express'];
const labelOf = (pairs: [string, string][], k: string) => pairs.find((p) => p[0] === k)?.[1] ?? k;
const keyOf = (pairs: [string, string][], l: string) => pairs.find((p) => p[1] === l)?.[0] ?? l;

type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';
const OS: [OrderStatus, string, DotKey][] = [
  ['PENDING', 'En attente', 'amber'], ['CONFIRMED', 'Confirmée', 'ink'], ['PROCESSING', 'En préparation', 'ink'],
  ['SHIPPED', 'Expédiée', 'ink'], ['DELIVERED', 'Livrée', 'green'], ['CANCELLED', 'Annulée', 'red'], ['REFUNDED', 'Remboursée', 'grey'],
];
const osOf = (k: OrderStatus) => OS.find((o) => o[0] === k)!;
type PayStatus = 'Payé' | 'En attente' | 'Échoué' | 'Remboursé' | 'Remb. partiel' | 'À encaisser' | 'Virement attendu';
const PAYDOT: Record<PayStatus, DotKey> = { 'Payé': 'green', 'En attente': 'amber', 'Échoué': 'red', 'Remboursé': 'grey', 'Remb. partiel': 'grey', 'À encaisser': 'amber', 'Virement attendu': 'amber' };

const cents = (s: string) => Math.round(Number(s) * 100);
const euros = (c: number | null | undefined) => (c == null ? '' : String(c / 100));
// Dates affichées à l'heure de la boutique, quel que soit le fuseau du navigateur.
const TZ = 'Africa/Casablanca';
const D = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const T = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const ISO_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const frDate = (iso: string) => D.format(new Date(iso));
const frDateTime = (iso: string) => `${D.format(new Date(iso))} ${T.format(new Date(iso))}`;
const isoDay = (iso: string | null) => (iso ? ISO_DAY.format(new Date(iso)) : '');
const dayStart = (day: string) => (day ? new Date(`${day}T00:00:00`).toISOString() : null);
const dayEnd = (day: string) => (day ? new Date(`${day}T23:59:59`).toISOString() : null);
const todayIso = () => isoDay(new Date().toISOString());
const optInt = (s: string) => (String(s).trim() === '' ? null : Number(s));

type Ref = { id: string; name: string };
type ProductImage = { id: string; url: string; alt: string | null; isPrimary: boolean };
type ProductVideo = { id: string; url: string };
type ApiCollection = { id: string; name: string; slug: string; isActive: boolean; _count: { products: number } };
type ApiCategory = { id: string; name: string; slug: string; description: string | null; imageUrl: string | null; position: number; isActive: boolean; _count: { products: number } };
type ApiProduct = {
  id: string; name: string; sku: string; reference: string; description: string; priceCents: number; salePriceCents: number | null;
  stock: number; unlimitedStock: boolean; status: string; purchasable: boolean; brand: Ref; category: Ref; collection: Ref | null; shortDescription: string | null; color: string;
  extraSpecs: { features?: string[]; specs?: [string, string][]; [k: string]: unknown } | null; warrantyMonths: number; soldCount: number; images: ProductImage[]; videos: ProductVideo[];
  options: { id: string; name: string; values: { id: string; label: string; colorHex: string | null }[] }[];
  variants: { id: string; sku: string; priceCents: number | null; salePriceCents: number | null; stock: number; isActive: boolean; imageUrl: string | null; values: { label: string; colorHex: string | null }[] }[];
};
type ApiHistory = { from: OrderStatus | null; to: OrderStatus; note: string | null; createdAt: string; actor: string };
type ApiOrder = {
  id: string; number: string; status: OrderStatus; paymentStatus: string; paymentMethod: 'CARD' | 'CASH_ON_DELIVERY' | 'BANK_TRANSFER';
  subtotalCents: number; shippingCents: number; discountCents: number; totalCents: number; couponCode: string | null; placedAt: string;
  shippingMethodName: string; shippingAddress: { firstName: string; lastName: string; line1: string; line2?: string; postalCode: string; city: string; country: string; phone: string };
  user: { email: string; firstName: string; lastName: string; phone: string | null };
  items: { id: string; productName: string; variantLabel: string | null; quantity: number; unitPriceCents: number; totalCents: number }[];
  payments: { id: string; provider: string; providerPaymentId: string | null; status: string; amountCents: number; refundedCents: number }[];
  shipments: { carrier: string; trackingNumber: string | null; trackingUrl: string | null }[];
  history: ApiHistory[];
};
type ApiCoupon = { id: string; code: string; type: string; value: number; minOrderCents: number; maxUses: number | null; usedCount: number; startsAt: string | null; expiresAt: string | null; isActive: boolean };
type ApiPromo = {
  id: string; name: string; type: string; value: number; startsAt: string; endsAt: string; isActive: boolean;
  targets: { product: Ref | null; category: Ref | null; collection: Ref | null }[];
};
type ApiReview = { id: string; product: Ref; author: string; createdAt: string; rating: number; title: string | null; comment: string; status: ReviewStatus };
type ApiUserRow = { id: string; email: string; firstName: string; lastName: string; role: string; createdAt: string; ordersCount: number; totalSpentCents: number };
type Overview = { revenueCents: number; ordersCount: number; ordersToProcess: number; customersCount: number; newCustomersLast7Days: number; averageBasketCents: number };

type AProduct = {
  id: string; name: string; sku: string; reference: string; description: string; collection: string; category: string;
  price: string; sale: string; stock: string; status: string; brand: string; kind: string; features: string; specs: string; extra: string;
  color: string; warranty: string; sold: number; images: ProductImage[]; videos: ProductVideo[]; purchasable: boolean;
  /** « Oui » / « Non » (valeur du formulaire). */
  unlimited: string;
  options: VOption[]; variants: VRow[];
};
/** Option en cours d'édition (Couleur, Bracelet…) ; `color` affiche des pastilles. */
type VOption = { name: string; color: boolean; values: { label: string; hex: string }[] };
/** Déclinaison en cours d'édition ; prix vides = prix du produit. */
type VRow = { id?: string; values: string[]; sku: string; price: string; sale: string; stock: string; active: boolean; image: string };
type HistoryItem = { label: string; at: string; by: string };
type AOrder = {
  id: string; number: string; customer: string; email: string; date: string; placedAt: string; lines: { id: string; name: string; variant: string | null; qty: number; unit: number }[];
  subtotal: number; shipping: number; discount: number; total: number; coupon: string | null; status: OrderStatus; method: string; pay: PayStatus;
  paymentId: string | null; paymentRef: string; refundable: number; carrier: string; tracking: string; phone: string; address: string; history: HistoryItem[];
};
type Coupon = { id: string; code: string; type: string; value: string; min: string; max: string; used: number; start: string; end: string; active: boolean };
type Promo = { id: string; name: string; type: string; value: string; target: string; start: string; end: string; active: boolean };
type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
type Review = { id: string; product: string; author: string; date: string; rating: number; title: string; body: string; status: ReviewStatus };
type Client = { id: string; name: string; email: string; orders: number; since: string; spent: number };

/** Points forts (un par ligne) et fiche technique (« Clé : valeur » par ligne) ; les autres clés d'extraSpecs sont conservées telles quelles. */
const specFields = (x: ApiProduct['extraSpecs']) => {
  const { features = [], specs = [], ...rest } = x ?? {};
  return { features: features.join('\n'), specs: specs.map(([k, v]) => `${k} : ${v}`).join('\n'), extra: JSON.stringify(rest) };
};
const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
const specsBody = (f: Record<string, string>) => {
  let rest: Record<string, unknown> = {};
  try { rest = JSON.parse(f.extra || '{}'); } catch { /* ignoré */ }
  const specs = lines(f.specs ?? '').map((l) => { const i = l.indexOf(':'); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : [l, '']; }).filter(([k, v]) => k && v);
  return { ...rest, features: lines(f.features ?? '').slice(0, 15), specs };
};

const toProduct = (p: ApiProduct): AProduct => ({
  id: p.id, name: p.name, sku: p.sku, reference: p.reference, description: p.description, collection: p.collection?.name ?? '',
  category: p.category.name, price: euros(p.priceCents), sale: euros(p.salePriceCents), stock: String(p.stock), status: labelOf(PSTATUS, p.status),
  brand: p.brand.name, kind: p.shortDescription ?? '', color: p.color, ...specFields(p.extraSpecs),
  warranty: String(p.warrantyMonths), sold: p.soldCount, images: p.images, videos: p.videos ?? [], purchasable: p.purchasable, unlimited: p.unlimitedStock ? 'Oui' : 'Non',
  options: p.options.map((o) => ({
    name: o.name, color: o.values.some((v) => v.colorHex), values: o.values.map((v) => ({ label: v.label, hex: v.colorHex ?? '#111111' })),
  })),
  variants: p.variants.map((v) => ({
    id: v.id, values: v.values.map((x) => x.label), sku: v.sku, price: euros(v.priceCents), sale: euros(v.salePriceCents), stock: String(v.stock), active: v.isActive, image: v.imageUrl ?? '',
  })),
});

const METHOD_LABEL: Record<ApiOrder['paymentMethod'], string> = { CARD: 'Carte', CASH_ON_DELIVERY: 'Paiement à la livraison', BANK_TRANSFER: 'Virement bancaire' };
const payLabel = (o: ApiOrder): PayStatus => {
  switch (o.paymentStatus) {
    case 'PAID': return 'Payé';
    case 'FAILED': return 'Échoué';
    case 'REFUNDED': return 'Remboursé';
    case 'PARTIALLY_REFUNDED': return 'Remb. partiel';
    default: return o.paymentMethod === 'CASH_ON_DELIVERY' ? 'À encaisser' : o.paymentMethod === 'BANK_TRANSFER' ? 'Virement attendu' : 'En attente';
  }
};
const historyLabel = (h: ApiHistory) => {
  if (!h.from) return h.note ?? 'Commande passée';
  if (h.from === h.to) return h.note ?? 'Mise à jour';
  return 'Statut → ' + osOf(h.to)[1] + (h.note ? ' · ' + h.note : '');
};
/** Commandes passées sans e-mail : le compte porte une adresse technique en .invalid, on ne l'affiche pas. */
const realEmail = (e: string) => (e.endsWith('.invalid') ? '' : e);
/* ---------- période des commandes ---------- */
const PERIODS = [
  ['all', 'Toutes les dates'], ['today', 'Aujourd’hui'], ['yesterday', 'Hier'], ['7d', '7 derniers jours'], ['week', 'Cette semaine'],
  ['month', 'Ce mois'], ['lastmonth', 'Mois dernier'], ['30d', '30 derniers jours'], ['year', 'Cette année'], ['custom', 'Personnalisée'],
] as const;
type Period = (typeof PERIODS)[number][0];
/** Bornes [début, fin[ d'une période, à l'heure du navigateur ; la semaine commence le lundi. */
function periodRange(p: Period, from: string, to: string): [Date | null, Date | null] {
  const now = new Date();
  const day = (d: Date, add = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + add);
  const today = day(now);
  switch (p) {
    case 'today': return [today, day(now, 1)];
    case 'yesterday': return [day(now, -1), today];
    case '7d': return [day(now, -6), day(now, 1)];
    case '30d': return [day(now, -29), day(now, 1)];
    case 'week': { const start = day(now, -((now.getDay() + 6) % 7)); return [start, day(start, 7)]; }
    case 'month': return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)];
    case 'lastmonth': return [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 1)];
    case 'year': return [new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear() + 1, 0, 1)];
    case 'custom': {
      const d = (v: string, add = 0) => { if (!v) return null; const [y, m, j] = v.split('-').map(Number); return new Date(y, m - 1, j + add); };
      return [d(from), d(to, 1)];
    }
    default: return [null, null];
  }
}

const toOrder = (o: ApiOrder): AOrder => {
  const pay = o.payments.find((p) => p.status === 'PAID' || p.status === 'PARTIALLY_REFUNDED') ?? o.payments[o.payments.length - 1];
  const a = o.shippingAddress, ship = o.shipments[0];
  return {
    id: o.id, number: o.number, customer: `${o.user.firstName} ${o.user.lastName}`.trim(), email: realEmail(o.user.email) || a.phone || o.user.phone || '', date: frDateTime(o.placedAt), placedAt: o.placedAt,
    lines: o.items.map((i) => ({ id: i.id, name: i.productName, variant: i.variantLabel, qty: i.quantity, unit: i.unitPriceCents / 100 })),
    subtotal: o.subtotalCents / 100, shipping: o.shippingCents / 100, discount: o.discountCents / 100, total: o.totalCents / 100, coupon: o.couponCode,
    status: o.status, method: METHOD_LABEL[o.paymentMethod], pay: payLabel(o),
    paymentId: pay?.id ?? null, paymentRef: pay?.providerPaymentId ? 'Stripe · ' + pay.providerPaymentId : o.paymentMethod === 'BANK_TRANSFER' ? 'Virement · motif ' + o.number : 'Encaissement à la livraison',
    refundable: pay && (pay.status === 'PAID' || pay.status === 'PARTIALLY_REFUNDED') ? (pay.amountCents - pay.refundedCents) / 100 : 0,
    carrier: ship?.carrier ?? 'Colissimo', tracking: ship?.trackingNumber ?? '', phone: a.phone || o.user.phone || '',
    address: [a.line1, a.line2, [a.postalCode, a.city].filter(Boolean).join(' '), a.country === 'MA' ? 'Maroc' : a.country].filter(Boolean).join(', '),
    history: o.history.map((h) => ({ label: historyLabel(h), at: frDateTime(h.createdAt), by: h.actor })),
  };
};
const toCoupon = (c: ApiCoupon): Coupon => ({
  id: c.id, code: c.code, type: labelOf(DTYPES, c.type), value: c.type === 'PERCENTAGE' ? String(c.value) : euros(c.value),
  min: euros(c.minOrderCents), max: c.maxUses == null ? '' : String(c.maxUses), used: c.usedCount,
  start: isoDay(c.startsAt), end: isoDay(c.expiresAt), active: c.isActive,
});
const targetLabel = (p: ApiPromo) => {
  const t = p.targets[0];
  if (!t) return 'Tout le catalogue';
  if (t.category) return 'Catégorie · ' + t.category.name;
  if (t.collection) return 'Collection · ' + t.collection.name;
  return 'Produit · ' + (t.product?.name ?? '');
};
const toPromo = (p: ApiPromo): Promo => ({
  id: p.id, name: p.name, type: labelOf(DTYPES, p.type), value: p.type === 'PERCENTAGE' ? String(p.value) : euros(p.value),
  target: targetLabel(p), start: isoDay(p.startsAt), end: isoDay(p.endsAt), active: p.isActive,
});
const toReview = (r: ApiReview): Review => ({
  id: r.id, product: r.product.name, author: r.author, date: frDate(r.createdAt), rating: r.rating, title: r.title ?? '', body: r.comment, status: r.status,
});
const toClient = (u: ApiUserRow): Client => ({
  id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), email: realEmail(u.email) || 'Sans e-mail', orders: u.ordersCount, since: frDate(u.createdAt), spent: u.totalSpentCents / 100,
});

/* ------------------------------------------------------------------ */
/* Petits éléments d'interface                                          */
/* ------------------------------------------------------------------ */

const monoLabel: CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#6B6B66' };
const card: CSSProperties = { background: '#fff', border: '1px solid #E4E4E0' };
const thRow = (cols: string): CSSProperties => ({ display: 'grid', gridTemplateColumns: cols, gap: 16, padding: '14px 20px', borderBottom: '1px solid #E4E4E0', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#6B6B66' });
const thumb: CSSProperties = { background: '#EEEEEB', backgroundImage: 'repeating-linear-gradient(135deg,rgba(18,41,77,.05) 0 1px,transparent 1px 7px)' };

function Dot({ c, size = 6 }: { c: string; size?: number }) {
  // Contour léger sur les pastilles de couleur pour que les teintes claires restent visibles.
  return <span style={{ width: size, height: size, borderRadius: '50%', background: c, flex: 'none', ...(size >= 10 && { boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.15)' }) }} />;
}
function Pill({ dot, children }: { dot: string; children: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 26, padding: '0 10px', borderRadius: 999, background: '#F1F1EE', fontSize: 12, justifySelf: 'start', whiteSpace: 'nowrap' }}>
      <Dot c={dot} />{children}
    </span>
  );
}
function Chip({ active, onClick, children, h = 40 }: { active: boolean; onClick: () => void; children: ReactNode; h?: number }) {
  return (
    <button onClick={onClick} style={{ flex: 'none', height: h, padding: '0 15px', borderRadius: 999, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, background: active ? 'var(--ink)' : '#fff', color: active ? '#fff' : 'var(--ink)', border: `1px solid ${active ? 'var(--ink)' : '#D9D9D4'}` }}>
      {children}
    </button>
  );
}
function SmallBtn({ onClick, children, dark }: { onClick: () => void; children: ReactNode; dark?: boolean }) {
  return (
    <button className={dark ? undefined : 'adm-small'} onClick={onClick} style={{ height: 34, padding: '0 14px', borderRadius: 999, border: dark ? 0 : '1px solid #D9D9D4', background: dark ? 'var(--ink)' : '#fff', color: dark ? '#fff' : 'var(--ink)', cursor: 'pointer', fontSize: 12.5, whiteSpace: 'nowrap' }}>
      {children}
    </button>
  );
}
function OutlineBtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button className="adm-outline" onClick={onClick} style={{ height: 40, padding: '0 18px', borderRadius: 999, background: 'transparent', border: '1px solid var(--ink)', fontSize: 11, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', cursor: 'pointer' }}>
      {children}
    </button>
  );
}

const ADMIN_PER_PAGE = 25;

function AdminPager({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / ADMIN_PER_PAGE);
  if (pages <= 1) return null;
  const btn = (active: boolean, disabled = false): CSSProperties => ({
    minWidth: 34, height: 34, padding: '0 10px', borderRadius: 999, fontSize: 12.5, cursor: disabled ? 'default' : 'pointer',
    border: `1px solid ${active ? 'var(--ink)' : '#D9D9D4'}`, background: active ? 'var(--ink)' : '#fff', color: active ? '#fff' : 'var(--ink)', opacity: disabled ? 0.35 : 1,
  });
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12.5, color: '#6B6B66' }}>{(page - 1) * ADMIN_PER_PAGE + 1}–{Math.min(page * ADMIN_PER_PAGE, total)} sur {total}</span>
      <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button style={btn(false, page <= 1)} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Page précédente">←</button>
        {pageList(page, pages).map((n, i) => n === '…'
          ? <span key={`e${i}`} style={{ padding: '6px 4px', color: '#6B6B66' }}>…</span>
          : <button key={n} style={btn(n === page)} aria-current={n === page ? 'page' : undefined} onClick={() => onChange(n)}>{n}</button>)}
        <button style={btn(false, page >= pages)} disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Page suivante">→</button>
      </span>
    </div>
  );
}

type FieldDef = { k: string; label: string; ph?: string; type?: string; full?: boolean; area?: boolean; options?: string[]; disabled?: boolean };

/* ------------------------------------------------------------------ */
/* Options & déclinaisons                                               */
/* ------------------------------------------------------------------ */

const PRESETS: [string, boolean][] = [['Couleur', true], ['Bracelet', false], ['Taille', false]];
/** Teinte proposée par défaut quand on saisit une couleur courante (modifiable ensuite). */
const COLOR_GUESS: Record<string, string> = {
  noir: '#111111', blanc: '#F5F5F2', bleu: '#1F3A8A', 'bleu nuit': '#1F2A44', vert: '#2F5D3A', 'vert forêt': '#2F4A3A', rouge: '#9B1C1C',
  bordeaux: '#5E1A24', or: '#C9A44C', 'or jaune': '#C9A44C', 'or rose': '#C9A08A', argent: '#C0C0C0', acier: '#9EA3A8', gris: '#7A7A75',
  marron: '#6B4226', cognac: '#9A5B2E', nacre: '#EDE6DA', beige: '#D9C7A7', rose: '#E8B4B8', champagne: '#E6D3A3',
};
const MAX_OPTIONS = 3;
const code = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 3) || 'X';
const comboKey = (vals: string[]) => vals.map((v) => v.toLocaleLowerCase('fr')).join('|');

/**
 * Recalcule les déclinaisons (toutes les combinaisons de valeurs) en conservant les lignes existantes :
 * correspondance exacte, sinon une ligne dont les valeurs sont contenues dans la nouvelle combinaison
 * (ajout d'une option) — le SKU, le stock et l'identifiant sont ainsi préservés.
 */
function combine(opts: VOption[], prev: VRow[], baseSku: string): VRow[] {
  const usable = opts.filter((o) => o.values.length);
  if (!usable.length) return [];
  let combos: string[][] = [[]];
  for (const o of usable) combos = combos.flatMap((c) => o.values.map((v) => [...c, v.label]));
  const used = new Set<VRow>();
  const exact = new Map(prev.map((r) => [comboKey(r.values), r]));
  return combos.map((vals) => {
    const lower = vals.map((v) => v.toLocaleLowerCase('fr'));
    const hit = exact.get(comboKey(vals));
    const old = hit && !used.has(hit) ? hit : prev.find((r) => !used.has(r) && r.values.every((x) => lower.includes(x.toLocaleLowerCase('fr'))));
    if (old) { used.add(old); return { ...old, values: vals }; }
    return { values: vals, sku: [baseSku.trim().toUpperCase() || 'SKU', ...vals.map(code)].join('-'), price: '', sale: '', stock: '0', active: true, image: '' };
  });
}

/** Choix de la photo d'une déclinaison parmi les photos du produit (clic = photo suivante). */
function PhotoPick({ value, photos, onChange }: { value: string; photos: string[]; onChange: (v: string) => void }) {
  if (!photos.length) return <span title="Ajoutez d’abord des photos au produit" style={{ fontSize: 11, color: '#9A9A94' }}>—</span>;
  const i = photos.indexOf(value);
  const next = () => onChange(i + 1 < photos.length ? photos[i + 1] : '');
  return (
    <button type="button" onClick={next} title={i >= 0 ? `Photo ${i + 1} (cliquer pour changer)` : 'Aucune photo (cliquer pour en choisir une)'}
      style={{ width: 40, height: 40, padding: 0, border: '1px solid #D9D9D4', background: value ? `#EEEEEB url(${value}) center/cover` : '#fff', cursor: 'pointer', fontSize: 10, color: '#6B6B66' }}>
      {value ? '' : 'auto'}
    </button>
  );
}

function VariantsEditor({ opts, vars, baseSku, basePrice, photos, onChange }: {
  opts: VOption[]; vars: VRow[]; baseSku: string; basePrice: string; photos: string[]; onChange: (o: VOption[], v: VRow[]) => void;
}) {
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [custom, setCustom] = useState('');
  const small: CSSProperties = { height: 36, padding: '0 10px', border: '1px solid #D9D9D4', background: '#fff', fontSize: 13.5, color: 'var(--ink)', outline: 'none', minWidth: 0, width: '100%' };
  const update = (o: VOption[]) => onChange(o, combine(o, vars, baseSku));
  const setOpt = (i: number, patch: Partial<VOption>, recombine = false) => {
    const o = opts.map((x, j) => (j === i ? { ...x, ...patch } : x));
    if (recombine) update(o); else onChange(o, vars);
  };
  const addOption = (name: string, color: boolean) => {
    const n = name.trim();
    if (!n || opts.length >= MAX_OPTIONS || opts.some((o) => o.name.toLocaleLowerCase('fr') === n.toLocaleLowerCase('fr'))) return;
    onChange([...opts, { name: n, color, values: [] }], vars);
    setCustom('');
  };
  const addValue = (i: number) => {
    const label = (draft[i] ?? '').trim();
    if (!label || opts[i].values.some((v) => v.label.toLocaleLowerCase('fr') === label.toLocaleLowerCase('fr'))) return;
    setDraft((d) => ({ ...d, [i]: '' }));
    setOpt(i, { values: [...opts[i].values, { label, hex: COLOR_GUESS[label.toLocaleLowerCase('fr')] ?? '#111111' }] }, true);
  };
  const setRow = (k: number, patch: Partial<VRow>) => onChange(opts, vars.map((r, j) => (j === k ? { ...r, ...patch } : r)));
  const hexOf = (label: string) => {
    for (const o of opts) if (o.color) { const v = o.values.find((x) => x.label === label); if (v) return v.hex; }
    return null;
  };
  const total = vars.filter((r) => r.active).reduce((n, r) => n + (Number(r.stock) || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span style={monoLabel}>Options & déclinaisons</span>
        {vars.length > 0 && <span style={{ fontSize: 12, color: '#6B6B66' }}>{vars.length} déclinaison{vars.length > 1 ? 's' : ''} · stock total {total}</span>}
      </span>
      {!opts.length && <span style={{ fontSize: 13, color: '#6B6B66', lineHeight: 1.5 }}>Proposez le produit en plusieurs couleurs, modèles ou tailles. Chaque combinaison devient une déclinaison avec son SKU, son stock et, si besoin, son prix.</span>}

      {opts.map((o, i) => (
        <div key={i} style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="adm-input" value={o.name} aria-label="Nom de l’option" onChange={(e) => setOpt(i, { name: e.target.value })} style={{ ...small, fontWeight: 600, flex: 1 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#55554F', whiteSpace: 'nowrap', cursor: 'pointer' }}>
              <input type="checkbox" checked={o.color} onChange={(e) => setOpt(i, { color: e.target.checked })} />Pastilles
            </label>
            <SmallBtn onClick={() => update(opts.filter((_, j) => j !== i))}>Retirer</SmallBtn>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {o.values.map((v, k) => (
              <span key={v.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 6px 0 10px', borderRadius: 999, background: '#F1F1EE', fontSize: 13 }}>
                {o.color && (
                  <label title="Choisir la teinte" style={{ position: 'relative', width: 16, height: 16, borderRadius: '50%', background: v.hex, border: '1px solid rgba(0,0,0,.15)', cursor: 'pointer', flex: 'none' }}>
                    <input type="color" value={v.hex} onChange={(e) => setOpt(i, { values: o.values.map((x, j) => (j === k ? { ...x, hex: e.target.value.toUpperCase() } : x)) })} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                  </label>
                )}
                {v.label}
                <button aria-label={'Retirer ' + v.label} onClick={() => setOpt(i, { values: o.values.filter((_, j) => j !== k) }, true)} style={{ width: 22, height: 22, borderRadius: '50%', border: 0, background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#55554F' }}>×</button>
              </span>
            ))}
            <span style={{ display: 'inline-flex', gap: 6 }}>
              <input className="adm-input" value={draft[i] ?? ''} placeholder={o.color ? 'Ex. Bleu nuit' : 'Nouvelle valeur'}
                onChange={(e) => setDraft((d) => ({ ...d, [i]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addValue(i); } }}
                style={{ ...small, height: 32, width: 150, borderRadius: 999, padding: '0 12px' }} />
              <SmallBtn onClick={() => addValue(i)}>Ajouter</SmallBtn>
            </span>
          </div>
        </div>
      ))}

      {opts.length < MAX_OPTIONS && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {PRESETS.filter(([n]) => !opts.some((o) => o.name.toLocaleLowerCase('fr') === n.toLocaleLowerCase('fr'))).map(([n, c]) => (
            <SmallBtn key={n} onClick={() => addOption(n, c)}>+ {n}</SmallBtn>
          ))}
          <input className="adm-input" value={custom} placeholder="Autre option (ex. Gravure)" onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(custom, false); } }}
            style={{ ...small, height: 34, width: 200, borderRadius: 999, padding: '0 12px' }} />
          {custom.trim() && <SmallBtn onClick={() => addOption(custom, false)}>+ Ajouter</SmallBtn>}
        </div>
      )}

      {vars.length > 0 && (
        <div style={{ ...card, overflowX: 'auto' }}>
          <div style={{ minWidth: 540 }}>
            <div style={{ ...thRow('minmax(120px,1.2fr) 52px minmax(130px,1.4fr) 72px 72px 56px 36px'), padding: '10px 12px', gap: 8 }}>
              <span>Déclinaison</span><span>Photo</span><span>SKU</span><span>Prix DH</span><span>Promo DH</span><span>Stock</span><span>Actif</span>
            </div>
            {vars.map((r, k) => (
              <div key={comboKey(r.values)} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,1.2fr) 52px minmax(130px,1.4fr) 72px 72px 56px 36px', gap: 8, alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #EDEDEA', opacity: r.active ? 1 : 0.5 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, minWidth: 0 }}>
                  {r.values.map((v) => hexOf(v)).filter(Boolean).slice(0, 1).map((h) => <Dot key={h} c={h!} size={12} />)}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.values.join(' · ')}</span>
                </span>
                <PhotoPick value={r.image} photos={photos} onChange={(image) => setRow(k, { image })} />
                <input className="adm-input" value={r.sku} onChange={(e) => setRow(k, { sku: e.target.value.toUpperCase() })} style={{ ...small, fontFamily: 'var(--mono)', fontSize: 12 }} />
                <input className="adm-input" type="number" value={r.price} placeholder={basePrice || '—'} onChange={(e) => setRow(k, { price: e.target.value })} style={small} />
                <input className="adm-input" type="number" value={r.sale} placeholder="—" onChange={(e) => setRow(k, { sale: e.target.value })} style={small} />
                <input className="adm-input" type="number" min={0} value={r.stock} onChange={(e) => setRow(k, { stock: e.target.value })} style={small} />
                <input type="checkbox" aria-label="Déclinaison active" checked={r.active} onChange={(e) => setRow(k, { active: e.target.checked })} style={{ justifySelf: 'center' }} />
              </div>
            ))}
          </div>
        </div>
      )}
      {vars.length > 0 && <span style={{ fontSize: 12, color: '#6B6B66' }}>Prix vide : le prix du produit s’applique. Une déclinaison inactive n’est plus proposée en boutique.</span>}
    </div>
  );
}

/** Contrôles avant envoi ; renvoie un message d'erreur ou null. */
function checkVariants(opts: VOption[], vars: VRow[], basePrice: string, baseSale: string): string | null {
  if (opts.some((o) => !o.name.trim())) return 'Une option n’a pas de nom';
  const names = opts.map((o) => o.name.trim().toLocaleLowerCase('fr'));
  if (new Set(names).size !== names.length) return 'Deux options portent le même nom';
  const empty = opts.find((o) => !o.values.length);
  if (empty) return `Ajoutez au moins une valeur à « ${empty.name} »`;
  const skus = new Set<string>();
  for (const r of vars) {
    const label = r.values.join(' · ');
    if (!/^[A-Z0-9][A-Z0-9-]{1,59}$/.test(r.sku)) return `SKU invalide pour ${label}`;
    if (skus.has(r.sku)) return `SKU en double : ${r.sku}`;
    skus.add(r.sku);
    if (!Number.isInteger(Number(r.stock)) || Number(r.stock) < 0) return `Stock invalide pour ${label}`;
    const price = Number(r.price || basePrice), sale = r.price ? Number(r.sale || 0) : Number(r.sale || baseSale || 0);
    if (sale && sale >= price) return `Prix promo ≥ prix pour ${label}`;
  }
  return null;
}

type View = 'dash' | 'orders' | 'products' | 'categories' | 'promos' | 'reviews' | 'clients';
type DrawerKind = 'product' | 'coupon' | 'promo' | 'order' | 'import' | null;

/* Import CSV (catalogue fournisseur) */
type ImportReport = { line: number; name: string; errors: string[]; warnings: string[]; row?: { priceCents: number; salePriceCents: number | null; stock: number; category: string; brand: string; colors: string[]; images: string[]; publish: boolean } };
type ImportPreview = { reports: ImportReport[]; unknownColumns: string[]; summary: { total: number; valid: number; invalid: number } };
type ImportResult = {
  results: { line: number; name: string; status: 'created' | 'skipped' | 'error'; message?: string; images?: number }[];
  summary: { created: number; skipped: number; errors: number; images: number; newCategories: string[]; newBrands: string[] };
};
const IMPORT_TEMPLATE = [
  'nom;prix;prix_barre;stock;sku;categorie;marque;accroche;points_forts;couleurs;garantie;statut;description;images',
  'Masseur cervical exemple;179;299;10;EX-001;Massage;MaxiGadget;Chaleur + EMS · 6 modes;Soulage la nuque|Chaleur douce 42 °C|Rechargeable USB;Blanc|Noir;6;Brouillon;Masseur cervical chauffant à impulsions.;https://exemple.com/photo1.jpg | https://exemple.com/photo2.jpg',
].join('\r\n');
function downloadTemplate() {
  // BOM : Excel lit alors correctement les accents.
  const url = URL.createObjectURL(new Blob(['\uFEFF' + IMPORT_TEMPLATE], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'modele-import-produits.csv' });
  a.click();
  URL.revokeObjectURL(url);
}
type Refs = { categories: Ref[]; collections: Ref[]; brands: Ref[] };
const MONTH = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const SHORT = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short' });

/* ------------------------------------------------------------------ */
/* Connexion                                                            */
/* ------------------------------------------------------------------ */

export default function Admin() {
  const [user, setUser] = useState<ApiUser | null | undefined>(undefined);

  useEffect(() => {
    document.title = 'Administration — MaxiGadget';
    refreshSession().then((u) => setUser(u?.role === 'ADMIN' ? u : null));
    setLogoutHandler(() => setUser(null));
    return () => setLogoutHandler(null);
  }, []);

  if (user === undefined) return <div style={{ minHeight: '100vh', background: 'var(--ivory)' }} />;
  if (!user) return <AdminLogin onLogin={setUser} />;
  return <AdminPanel user={user} onLogout={async () => { await logout(); setUser(null); }} />;
}

function AdminLogin({ onLogin }: { onLogin: (u: ApiUser) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const u = await login(email, password);
      if (u.role !== 'ADMIN') { await logout(); setError('Ce compte n’a pas accès à l’administration.'); return; }
      onLogin(u);
    } catch (err) {
      setError(err instanceof ApiError && err.status !== 500 ? err.message : 'Serveur injoignable. L’API est-elle démarrée ?');
    } finally { setBusy(false); }
  };
  const input: CSSProperties = { height: 48, padding: '0 16px', border: '1px solid #D9D9D4', background: '#fff', fontSize: 15, color: 'var(--ink)', outline: 'none' };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'var(--ivory)', color: 'var(--ink)' }}>
      <style>{'.adm-input:focus{border-color:var(--ink)!important}'}</style>
      <form onSubmit={submit} style={{ ...card, width: 'min(420px,100%)', padding: 'clamp(24px,5vw,40px)', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--ink)', marginBottom: 6 }}>
          <img src="/logo-mark.svg" alt="" style={{ width: 44, height: 44 }} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontStretch: '125%', fontWeight: 600, fontSize: 14, letterSpacing: '.04em' }}>MAXIGADGET</span>
            <span style={{ ...monoLabel, fontSize: 9.5 }}>Administration</span>
          </span>
        </Link>
        <h1 className="display" style={{ fontSize: 28, lineHeight: 1 }}>Connexion</h1>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: '#55554F' }}>E-mail
          <input className="adm-input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} style={input} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: '#55554F' }}>Mot de passe
          <input className="adm-input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} style={input} />
        </label>
        {error && <span role="alert" style={{ fontSize: 13, color: DOT.red }}>{error}</span>}
        <button className="btn btn-primary" disabled={busy} style={{ height: 50, opacity: busy ? 0.6 : 1 }}>{busy ? 'Connexion…' : 'Se connecter'}</button>
        <Link to="/" style={{ fontSize: 13, color: '#6B6B66', textAlign: 'center' }}>← Retour à la boutique</Link>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

function AdminPanel({ user, onLogout }: { user: ApiUser; onLogout: () => void }) {
  const { mobile: m } = useLayout();
  const [view, setView] = useState<View>('dash');
  const [loaded, setLoaded] = useState(false);
  const [products, setProducts] = useState<AProduct[]>([]);
  const [orders, setOrders] = useState<AOrder[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [sales, setSales] = useState<{ day: string; revenue: number }[]>([]);
  const [refs, setRefs] = useState<Refs>({ categories: [], collections: [], brands: [] });
  const [pq, setPq] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [orderPage, setOrderPage] = useState(1);
  const [period, setPeriod] = useState<Period>('all');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [pf, setPf] = useState('Tous');
  const [of, setOf] = useState<OrderStatus | 'ALL'>('ALL');
  const [rf, setRf] = useState<ReviewStatus | 'ALL'>('PENDING');
  const [drawer, setDrawer] = useState<DrawerKind>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [images, setImages] = useState<AProduct['images']>([]);
  const [videos, setVideos] = useState<AProduct['videos']>([]);
  const [colls, setColls] = useState<ApiCollection[]>([]);
  const [opts, setOpts] = useState<VOption[]>([]);
  const [vars, setVars] = useState<VRow[]>([]);
  const [varsDirty, setVarsDirty] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [orderNo, setOrderNo] = useState<string | null>(null);
  const [ship, setShip] = useState({ carrier: CARRIERS[0], tracking: '' });
  const [busy, setBusy] = useState(false);
  const [TODAY] = useState(todayIso);
  const [toast, setToast] = useState({ msg: '', on: false });
  const tt = useRef<number>(undefined);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(null); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(tt.current); };
  }, []);

  const flash = useCallback((msg: string) => {
    clearTimeout(tt.current);
    setToast({ msg, on: true });
    tt.current = window.setTimeout(() => setToast((t) => ({ ...t, on: false })), 2800);
  }, []);
  const fail = useCallback((e: unknown) => flash(e instanceof ApiError ? e.message : 'Serveur injoignable'), [flash]);

  /* ---------- chargement ---------- */
  const loadProducts = useCallback(() => apiAll<ApiProduct>('/admin/products').then((d) => setProducts(d.map(toProduct))), []);
  const loadOrders = useCallback(() => apiAll<ApiOrder>('/admin/orders').then((d) => setOrders(d.map(toOrder))), []);
  const loadStats = useCallback(() => Promise.all([
    api<{ data: Overview }>('/admin/stats/overview').then((r) => setOverview(r.data)),
    api<{ data: { day: string; revenueCents: number }[] }>('/admin/stats/sales-by-day?days=14').then((r) => setSales(r.data.map((d) => ({ day: d.day, revenue: d.revenueCents / 100 })))),
    apiAll<ApiUserRow>('/admin/users?role=CUSTOMER').then((d) => setClients(d.map(toClient))),
  ]), []);
  const loadPromos = useCallback(() => Promise.all([
    api<{ data: ApiCoupon[] }>('/admin/coupons').then((r) => setCoupons(r.data.map(toCoupon))),
    api<{ data: ApiPromo[] }>('/admin/promotions').then((r) => setPromos(r.data.map(toPromo))),
  ]), []);

  useEffect(() => {
    Promise.all([
      loadProducts(), loadOrders(), loadStats(), loadPromos(),
      apiAll<ApiReview>('/admin/reviews').then((d) => setReviews(d.map(toReview))),
      // Les catégories (masquées comprises) viennent de loadCats ; /categories ne liste que les visibles.
      // Collections archivées comprises : un produit garde sa collection quand on le modifie.
      Promise.all([api<{ data: ApiCollection[] }>('/admin/collections'), api<{ data: Ref[] }>('/brands')])
        .then(([co, b]) => { setColls(co.data); setRefs((r) => ({ ...r, collections: co.data, brands: b.data })); }),
    ]).catch(fail).finally(() => setLoaded(true));
  }, [loadProducts, loadOrders, loadStats, loadPromos, fail]);

  const CATS = refs.categories.map((c) => c.name);
  const COLLS = refs.collections.map((c) => c.name);
  const idOf = (list: Ref[], name: string) => list.find((x) => x.name === name)?.id;

  /** Exécute une action serveur avec indicateur d'occupation et message d'erreur. */
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    if (busy) return false;
    setBusy(true);
    try { await fn(); if (ok) flash(ok); return true; } catch (e) { fail(e); return false; } finally { setBusy(false); }
  };

  const replaceOrder = (o: ApiOrder) => {
    setOrders((os) => os.map((x) => (x.id === o.id ? toOrder(o) : x)));
    // Annulations et remboursements remettent du stock et modifient le chiffre d'affaires.
    loadProducts().catch(() => undefined);
    loadStats().catch(() => undefined);
  };
  /* ---------- photos & catégories ---------- */
  const applyProduct = (p: ApiProduct) => {
    setProducts((ps) => ps.map((x) => (x.id === p.id ? toProduct(p) : x)));
    setImages(p.images);
    setVideos(p.videos ?? []);
  };
  const imageAction = (path: string, method: string, ok: string) =>
    run(async () => applyProduct((await api<{ data: ApiProduct }>(path, { method })).data), ok);
  const uploadProductImages = (id: string, files: File[]) => run(async () => {
    for (const f of files) {
      const fd = new FormData();
      fd.append('file', f);
      applyProduct((await api<{ data: ApiProduct }>(`/admin/products/${id}/images`, { method: 'POST', body: fd })).data);
    }
  }, files.length > 1 ? `${files.length} photos ajoutées` : 'Photo ajoutée');
  const uploadProductVideos = (id: string, files: File[]) => run(async () => {
    for (const f of files) {
      if (f.size > 40 * 1024 * 1024) throw new ApiError(413, 'FILE_TOO_LARGE', `« ${f.name} » dépasse 40 Mo : compressez-la avant de l’envoyer`);
      const fd = new FormData();
      fd.append('file', f);
      applyProduct((await api<{ data: ApiProduct }>(`/admin/products/${id}/videos`, { method: 'POST', body: fd })).data);
    }
  }, files.length > 1 ? `${files.length} vidéos ajoutées` : 'Vidéo ajoutée');
  const duplicateProduct = (p: AProduct) => run(async () => {
    const r = await api<{ data: ApiProduct }>(`/admin/products/${p.id}/duplicate`, { method: 'POST' });
    const copy = toProduct(r.data);
    setProducts((ps) => [...ps, copy]);
    openProduct(copy); // la copie s'ouvre directement pour être renommée et ajustée
  }, `« ${p.name} » dupliqué en brouillon`);
  const deleteProduct = (p: AProduct) => {
    if (!window.confirm(`Supprimer définitivement « ${p.name} » ?\n\nSes photos et vidéos seront effacées du serveur. Les commandes déjà passées restent dans l’historique.\nPour le retirer seulement de la boutique, utilisez plutôt « Archiver ».`)) return;
    run(async () => {
      await api(`/admin/products/${p.id}`, { method: 'DELETE' });
      setProducts((ps) => ps.filter((x) => x.id !== p.id));
      if (editId === p.id) setDrawer(null);
    }, 'Produit supprimé');
  };

  const archivedColl = (name: string) => colls.some((c) => c.name === name && !c.isActive);
  const toggleColl = (c: ApiCollection) => {
    if (c.isActive && !window.confirm(`Archiver la collection « ${c.name} » ?\n\nSes ${c._count.products} produit(s) disparaîtront de la boutique (fiches, recherche, commande). Ils restent dans l’admin avec leur statut, et « Restaurer » les remet en ligne.`)) return;
    run(async () => {
      const r = await api<{ data: ApiCollection }>(`/admin/collections/${c.id}/status`, { method: 'PATCH', body: { isActive: !c.isActive } });
      setColls((xs) => xs.map((x) => (x.id === r.data.id ? r.data : x)));
    }, c.isActive ? `Collection « ${c.name} » archivée` : `Collection « ${c.name} » restaurée`);
  };
  const [cats, setCats] = useState<ApiCategory[]>([]);
  const [catDraft, setCatDraft] = useState<Record<string, { name: string; description: string }>>({});
  const [newCat, setNewCat] = useState('');
  const syncCats = (list: ApiCategory[]) => {
    setCats(list);
    setRefs((r) => ({ ...r, categories: list.map((c) => ({ id: c.id, name: c.name })) }));
  };
  const loadCats = useCallback(() => api<{ data: ApiCategory[] }>('/admin/categories').then((r) => {
    setCats(r.data);
    setRefs((x) => ({ ...x, categories: r.data.map((c) => ({ id: c.id, name: c.name })) }));
  }), []);
  useEffect(() => { loadCats().catch(fail); }, [loadCats, fail]);
  const catAction = (fn: () => Promise<{ data: ApiCategory } | null>, ok: string) => run(async () => {
    const r = await fn();
    if (r) syncCats(cats.map((c) => (c.id === r.data.id ? r.data : c)));
    else await loadCats();
  }, ok);
  const uploadCatImage = (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return catAction(() => api<{ data: ApiCategory }>(`/admin/categories/${id}/image`, { method: 'POST', body: fd }), 'Image de la catégorie mise à jour');
  };

  const orderAction = (o: AOrder, path: string, body: unknown, ok: string, method = 'POST') =>
    run(async () => replaceOrder((await api<{ data: ApiOrder }>(path, { method, body })).data), `${o.number} · ${ok}`);

  const openForm = (kind: DrawerKind, id: string | null, f: Record<string, string>, imgs: AProduct['images'] = [], o: VOption[] = [], v: VRow[] = [], vids: AProduct['videos'] = []) => {
    setDrawer(kind); setEditId(id); setForm(f); setImages(imgs); setVideos(vids); setErrors({}); setOpts(o); setVars(v); setVarsDirty(false);
  };
  const openProduct = (p?: AProduct) => {
    if (!p) return openForm('product', null, { name: '', sku: '', reference: '', description: '', price: '', sale: '', stock: '0', status: 'Brouillon', brand: refs.brands[0]?.name ?? '', collection: COLLS[0] ?? '', category: CATS[0] ?? '', kind: '', features: '', specs: '', extra: '{}', color: 'Blanc', warranty: '6', unlimited: 'Non' });
    const { images: imgs, videos: vids, sold, id, options, variants, purchasable, ...rest } = p;
    void sold; void purchasable;
    openForm('product', id, rest, imgs, options, variants, vids);
  };
  const openCoupon = (c?: Coupon) => openForm('coupon', c?.id ?? null, c
    ? { code: c.code, type: c.type, value: c.value, min: c.min, max: c.max, start: c.start, end: c.end, active: c.active ? 'Actif' : 'Inactif' }
    : { code: '', type: 'Pourcentage', value: '', min: '0', max: '', start: '', end: '', active: 'Actif' });
  const openPromo = (p?: Promo) => openForm('promo', p?.id ?? null, p
    ? { name: p.name, type: p.type, value: p.value, target: p.target, start: p.start, end: p.end, active: p.active ? 'Active' : 'Inactive' }
    : { name: '', type: 'Pourcentage', value: '', target: CATS.includes('Massage') ? 'Catégorie · Massage' : 'Tout le catalogue', start: '', end: '', active: 'Active' });
  const setF = (k: string, v: string) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };

  const productBody = (f: Record<string, string>) => ({
    name: f.name.trim(), sku: f.sku.trim().toUpperCase(), reference: f.reference.trim() || undefined, description: f.description,
    priceCents: cents(f.price), salePriceCents: f.sale ? cents(f.sale) : null, status: keyOf(PSTATUS, f.status),
    brandId: idOf(refs.brands, f.brand), categoryId: idOf(refs.categories, f.category), collectionId: idOf(refs.collections, f.collection) ?? null,
    shortDescription: f.kind.trim() || null, color: f.color.trim() || 'Blanc', warrantyMonths: Number(f.warranty || 0), extraSpecs: specsBody(f), unlimitedStock: f.unlimited === 'Oui',
    // Colonnes héritées du modèle « montre » de la base : valeurs neutres, non affichées en boutique.
    movementType: 'QUARTZ', caseMaterial: '—', strapMaterial: '—', diameterMm: 10, waterResistanceM: 0, glass: '—',
  });
  const promoTarget = (t: string) => {
    const [kind, name] = t.split(' · ');
    if (kind === 'Catégorie') return [{ categoryId: idOf(refs.categories, name) }];
    if (kind === 'Collection') return [{ collectionId: idOf(refs.collections, name) }];
    return [];
  };
  const discount = (type: string, value: string) => (type === 'Pourcentage' ? Math.round(Number(value)) : cents(value));

  const save = async () => {
    const f = form;
    const req = {
      product: ['name', 'sku', 'price', 'stock'],
      coupon: ['code', 'value'], promo: ['name', 'value', 'start', 'end'],
    }[drawer as 'product'];
    const errs: Record<string, string> = {};
    req.forEach((k) => { if (!String(f[k] || '').trim()) errs[k] = 'Requis'; });
    if (drawer === 'product' && f.sale && Number(f.sale) >= Number(f.price)) errs.sale = 'Doit être < prix';
    if (drawer === 'product' && !vars.length && f.stock && (!Number.isInteger(Number(f.stock)) || Number(f.stock) < 0)) errs.stock = 'Entier ≥ 0';
    if (drawer === 'product' && vars.length) delete errs.stock;
    const varErr = drawer === 'product' ? checkVariants(opts, vars, f.price, f.sale) : null;
    if (varErr) errs.variants = varErr;
    if (drawer !== 'product' && f.type === 'Pourcentage' && f.value && (Number(f.value) < 1 || Number(f.value) > 100)) errs.value = '1 à 100';
    if (drawer === 'coupon' && f.start && f.end && f.start >= f.end) errs.end = 'Après le début';
    if (drawer === 'promo' && f.start && f.end && f.start > f.end) errs.end = 'Après le début';
    if (Object.keys(errs).length) { if (errs.variants) flash(errs.variants); return setErrors(errs); }

    const done = await run(async () => {
      if (drawer === 'product') {
        const body = productBody(f);
        const variantsBody = {
          options: opts.map((o) => ({ name: o.name.trim(), values: o.values.map((v) => ({ label: v.label, colorHex: o.color ? v.hex : null })) })),
          variants: vars.map((r) => ({
            id: r.id, values: r.values, sku: r.sku, priceCents: r.price ? cents(r.price) : null, salePriceCents: r.sale ? cents(r.sale) : null,
            stock: Number(r.stock), isActive: r.active, imageUrl: r.image || null,
          })),
        };
        const saveVariants = (id: string) => api<{ data: ApiProduct }>(`/admin/products/${id}/variants`, { method: 'PUT', body: variantsBody });
        if (editId) {
          let p = (await api<{ data: ApiProduct }>(`/admin/products/${editId}`, { method: 'PATCH', body })).data;
          if (varsDirty) p = (await saveVariants(editId)).data;
          const delta = Number(f.stock) - p.stock;
          if (!p.variants.length && !p.unlimitedStock && delta) p = (await api<{ data: ApiProduct }>(`/admin/products/${editId}/stock`, { method: 'POST', body: { delta, reason: 'ADJUSTMENT', note: 'Correction depuis la fiche produit' } })).data;
          setProducts((ps) => ps.map((x) => (x.id === editId ? toProduct(p) : x)));
        } else {
          let p = (await api<{ data: ApiProduct }>('/admin/products', { method: 'POST', body: { ...body, stock: vars.length || f.unlimited === 'Oui' ? 0 : Number(f.stock) } })).data;
          // Le produit existe déjà si l'enregistrement des déclinaisons échoue : on passe en modification.
          setProducts((ps) => [...ps, toProduct(p)]);
          setEditId(p.id);
          if (vars.length) {
            p = (await saveVariants(p.id)).data;
            setProducts((ps) => ps.map((x) => (x.id === p.id ? toProduct(p) : x)));
          }
        }
        flash(editId ? 'Produit mis à jour' : 'Produit ajouté au catalogue');
      } else if (drawer === 'coupon') {
        const body = {
          code: f.code, type: keyOf(DTYPES, f.type), value: discount(f.type, f.value), minOrderCents: cents(f.min || '0'),
          maxUses: optInt(f.max), startsAt: dayStart(f.start), expiresAt: dayEnd(f.end), isActive: f.active === 'Actif',
        };
        const c = (await api<{ data: ApiCoupon }>(editId ? `/admin/coupons/${editId}` : '/admin/coupons', { method: editId ? 'PATCH' : 'POST', body })).data;
        setCoupons((cs) => (editId ? cs.map((x) => (x.id === editId ? toCoupon(c) : x)) : [toCoupon(c), ...cs]));
        flash('Coupon ' + c.code + ' enregistré');
      } else {
        const body = {
          name: f.name.trim(), type: keyOf(DTYPES, f.type), value: discount(f.type, f.value), startsAt: dayStart(f.start), endsAt: dayEnd(f.end),
          isActive: f.active === 'Active', targets: promoTarget(f.target),
        };
        const p = (await api<{ data: ApiPromo }>(editId ? `/admin/promotions/${editId}` : '/admin/promotions', { method: editId ? 'PATCH' : 'POST', body })).data;
        setPromos((ps) => (editId ? ps.map((x) => (x.id === editId ? toPromo(p) : x)) : [toPromo(p), ...ps]));
        flash('Promotion enregistrée');
      }
    });
    if (done) setDrawer(null);
  };

  /* ---------- dérivés ---------- */
  const pendingOrders = overview?.ordersToProcess ?? orders.filter((o) => o.status === 'PENDING' || o.status === 'CONFIRMED').length;
  const pendingReviews = reviews.filter((r) => r.status === 'PENDING').length;
  const SALES = sales.map((s) => s.revenue);
  const maxS = Math.max(1, ...SALES);
  const lowStock = products.filter((p) => p.unlimited !== 'Oui' && Number(p.stock) <= 3 && p.status !== 'Archivé');
  const q = pq.trim().toLowerCase();
  const productRows = products.filter((p) => (pf === 'Tous' || (pf === 'Stock faible' ? p.unlimited !== 'Oui' && Number(p.stock) <= 3 : p.status === pf)) && (!q || (p.name + ' ' + p.sku + ' ' + p.collection).toLowerCase().includes(q)));
  const [pStart, pEnd] = periodRange(period, periodFrom, periodTo);
  const inPeriod = orders.filter((o) => { const t = new Date(o.placedAt); return (!pStart || t >= pStart) && (!pEnd || t < pEnd); });
  const orderRows = inPeriod.filter((o) => of === 'ALL' || o.status === of);
  const periodSales = inPeriod.filter((o) => o.status !== 'CANCELLED' && o.status !== 'REFUNDED');
  const reviewRows = reviews.filter((r) => rf === 'ALL' || r.status === rf);
  const topProducts = products.filter((p) => p.status !== 'Archivé').sort((a, b) => b.sold - a.sold).slice(0, 4);

  const NAV: [View, string, number?][] = [['dash', 'Tableau de bord'], ['orders', 'Commandes', pendingOrders], ['products', 'Produits'], ['categories', 'Catégories'], ['promos', 'Promotions'], ['reviews', 'Avis', pendingReviews], ['clients', 'Clients']];
  const PAGES: Record<View, [string, string]> = {
    dash: ['Vue d’ensemble · ' + MONTH.format(new Date(TODAY)), 'Tableau de bord'], orders: [orders.length + ' commandes', 'Commandes'],
    products: [products.length + ' produits au catalogue', 'Produits'], promos: ['Coupons & remises automatiques', 'Promotions'],
    reviews: [pendingReviews + ' avis à modérer', 'Avis clients'], clients: [clients.length + ' clients', 'Clients'],
    categories: [refs.categories.length + ' catégories · images de la boutique', 'Catégories'],
  };
  const ACTION: Partial<Record<View, [string, () => void]>> = { products: ['Ajouter un produit', () => openProduct()], promos: ['Créer un coupon', () => openCoupon()] };
  const draftOf = (c: ApiCategory) => catDraft[c.id] ?? { name: c.name, description: c.description ?? '' };

  /* ---------- rendus partiels ---------- */
  const orderStatusPill = (o: AOrder) => { const st = osOf(o.status); return <Pill dot={DOT[st[2]]}>{st[1]}</Pill>; };
  const openOrder = (n: string) => {
    const o = orders.find((x) => x.number === n);
    setShip({ carrier: o?.carrier ?? CARRIERS[0], tracking: o?.tracking ?? '' });
    setOrderNo(n); setDrawer('order');
  };

  const renderField = (fd: FieldDef) => {
    const err = errors[fd.k] || '';
    const v = fd.k === 'stock' && vars.length ? String(vars.filter((r) => r.active).reduce((n, r) => n + (Number(r.stock) || 0), 0)) : form[fd.k] ?? '';
    const base: CSSProperties = { border: `1px solid ${err ? DOT.red : '#D9D9D4'}`, background: '#fff', fontSize: 14.5, color: 'var(--ink)', outline: 'none' };
    return (
      <label key={fd.k} style={{ gridColumn: fd.full || m ? 'span 2' : 'span 1', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: '#55554F' }}>
        <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>{fd.label}</span><span style={{ color: DOT.red }}>{err}</span></span>
        {fd.options ? (
          <select value={v} onChange={(e) => setF(fd.k, e.target.value)} style={{ ...base, height: 46, padding: '0 12px', cursor: 'pointer' }}>
            {fd.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : fd.area ? (
          <textarea rows={4} value={v} placeholder={fd.ph} onChange={(e) => setF(fd.k, e.target.value)} className="adm-input" style={{ ...base, padding: '12px 14px', lineHeight: 1.55, resize: 'vertical' }} />
        ) : (
          <input type={fd.type ?? 'text'} value={v} disabled={fd.disabled} placeholder={fd.ph} onChange={(e) => setF(fd.k, e.target.value)} className="adm-input" style={{ ...base, height: 46, padding: '0 14px', ...(fd.disabled && { background: '#F1F1EE', color: '#6B6B66' }) }} />
        )}
      </label>
    );
  };

  let groups: { title: string; fields: FieldDef[] }[] = [];
  if (drawer === 'product') groups = [
    { title: 'Informations', fields: [{ k: 'name', label: 'Nom *', ph: 'Neck Beauty Device', full: true }, { k: 'sku', label: 'SKU *', ph: 'MG-NECK-01' }, { k: 'reference', label: 'Référence', ph: 'Réf. fournisseur' }, { k: 'kind', label: 'Accroche (sous le nom)', ph: 'Lifting du cou · 7 modes', full: true }, { k: 'description', label: 'Description', area: true, full: true, ph: 'Bénéfices, utilisation, pour qui…' }] },
    { title: 'Prix & stock', fields: [{ k: 'price', label: 'Prix (DH) *', type: 'number', ph: '249' }, { k: 'sale', label: 'Prix promo (DH)', type: 'number', ph: 'Optionnel' }, { k: 'stock', label: form.unlimited === 'Oui' ? 'Stock (illimité)' : vars.length ? 'Stock (déclinaisons)' : 'Stock *', type: 'number', disabled: vars.length > 0 || form.unlimited === 'Oui' }, { k: 'status', label: 'Statut', options: PSTATUS.map((x) => x[1]) }, { k: 'unlimited', label: 'Stock illimité (toujours commandable, rien n’est décompté)', options: ['Non', 'Oui'], full: true }] },
    { title: 'Classement', fields: [{ k: 'category', label: 'Catégorie', options: CATS }, { k: 'collection', label: 'Collection', options: COLLS }, { k: 'brand', label: 'Marque', options: refs.brands.map((b) => b.name), full: true }] },
    { title: 'Fiche produit', fields: [{ k: 'features', label: 'Points forts (un par ligne)', area: true, full: true, ph: 'Réduit les rides du cou\nRaffermit la peau\n7 modes de soin' }, { k: 'specs', label: 'Fiche technique (« Clé : valeur » par ligne)', area: true, full: true, ph: 'Autonomie : 2 h\nCharge : USB-C\nContenu : appareil, câble, notice' }, { k: 'color', label: 'Couleur principale' }, { k: 'warranty', label: 'Garantie (mois)', type: 'number' }] },
  ];
  else if (drawer === 'coupon') groups = [
    { title: 'Code', fields: [{ k: 'code', label: 'Code *', ph: 'BIENVENUE10', full: true }, { k: 'type', label: 'Type de remise', options: ['Pourcentage', 'Montant fixe'] }, { k: 'value', label: form.type === 'Pourcentage' ? 'Valeur (%) *' : 'Valeur (DH) *', type: 'number' }] },
    { title: 'Conditions', fields: [{ k: 'min', label: 'Commande minimum (DH)', type: 'number' }, { k: 'max', label: 'Utilisations max', type: 'number', ph: 'Illimité' }, { k: 'start', label: 'Début', type: 'date' }, { k: 'end', label: 'Expiration', type: 'date' }, { k: 'active', label: 'Statut', options: ['Actif', 'Inactif'], full: true }] },
  ];
  else if (drawer === 'promo') groups = [
    { title: 'Remise', fields: [{ k: 'name', label: 'Nom *', ph: 'Semaine Massage', full: true }, { k: 'type', label: 'Type', options: ['Pourcentage', 'Montant fixe'] }, { k: 'value', label: form.type === 'Pourcentage' ? 'Valeur (%) *' : 'Valeur (DH) *', type: 'number' }, { k: 'target', label: 'Cible', options: [...CATS.map((c) => 'Catégorie · ' + c), ...COLLS.map((c) => 'Collection · ' + c), 'Tout le catalogue'], full: true }] },
    { title: 'Période', fields: [{ k: 'start', label: 'Début *', type: 'date' }, { k: 'end', label: 'Fin *', type: 'date' }, { k: 'active', label: 'Statut', options: ['Active', 'Inactive'], full: true }] },
  ];

  const openImport = () => { setImportFile(null); setImportPreview(null); setImportResult(null); setDrawer('import'); };
  const importForm = () => { const fd = new FormData(); fd.append('file', importFile!); return fd; };
  const analyseImport = (file: File) => {
    setImportFile(file); setImportPreview(null); setImportResult(null);
    const fd = new FormData(); fd.append('file', file);
    run(async () => setImportPreview((await api<{ data: ImportPreview }>('/admin/products/import/preview', { method: 'POST', body: fd })).data));
  };
  const runImport = () => run(async () => {
    const r = (await api<{ data: ImportResult }>('/admin/products/import', { method: 'POST', body: importForm() })).data;
    setImportResult(r);
    await Promise.all([loadProducts(), loadCats()]);
  }, 'Import terminé');

  const order = drawer === 'order' ? orders.find((o) => o.number === orderNo) : undefined;
  const drawerHead: [string, string] = drawer === 'product' ? [editId ? 'Modifier · ' + form.sku : 'Nouveau produit', editId ? form.name : 'Ajouter un produit']
    : drawer === 'coupon' ? ['Code promo', editId ? form.code : 'Créer un coupon']
    : drawer === 'promo' ? ['Promotion automatique', editId ? form.name : 'Créer une promotion']
    : drawer === 'import' ? ['Catalogue fournisseur', 'Importer des produits']
    : order ? [order.date, order.number] : ['', ''];
  const pv = Number(form.price) || 0, sv = Number(form.sale) || 0, hasPromo = sv > 0 && sv < pv;

  const tableWrap = (minW: number, children: ReactNode) => <div style={{ ...card, overflowX: 'auto' }}><div style={{ minWidth: minW }}>{children}</div></div>;

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: m ? 'minmax(0,1fr)' : '248px minmax(0,1fr)', background: 'var(--ivory)', color: 'var(--ink)' }}>
      <style>{`
        .adm-nav:hover{background:rgba(255,255,255,.12)!important}
        .adm-row:hover{background:#FAFAF8}
        .adm-small:hover{border-color:var(--ink)!important}
        .adm-outline:hover{background:var(--ink);color:#fff}
        .adm-input:focus{border-color:var(--ink)!important}
        .adm-bar:hover{background:#6B6B66!important}
      `}</style>

      {/* ---------- barre latérale ---------- */}
      <aside style={{ background: 'var(--ink)', color: '#fff', display: 'flex', flexDirection: m ? 'row' : 'column', gap: m ? 16 : 36, padding: m ? '10px 16px' : '28px 18px', position: 'sticky', top: 0, height: m ? 'auto' : '100vh', zIndex: 30, overflowX: 'auto' }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none', color: '#fff' }}>
          <img src="/logo-mark.svg" alt="MaxiGadget" style={{ width: 40, height: 40 }} />
          {!m && (
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontStretch: '125%', fontWeight: 600, fontSize: 14, letterSpacing: '.04em' }}>MAXIGADGET</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8fa2bb' }}>Administration</span>
            </span>
          )}
        </Link>
        <nav style={{ display: 'flex', flexDirection: m ? 'row' : 'column', gap: 2, flex: 'none' }}>
          {NAV.map(([v, label, badge]) => (
            <button key={v} className={view === v ? undefined : 'adm-nav'} onClick={() => setView(v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, height: 44, padding: '0 14px', border: 0, borderRadius: 999, cursor: 'pointer', background: view === v ? '#fff' : 'transparent', color: view === v ? 'var(--ink)' : '#e3ebf3', fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', transition: 'background .3s' }}>
              <span>{label}</span>
              {!!badge && <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, background: view === v ? 'var(--ink)' : '#fff', color: view === v ? '#fff' : 'var(--ink)', fontSize: 10.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{badge}</span>}
            </button>
          ))}
        </nav>
        {m && <button onClick={onLogout} style={{ flex: 'none', background: 'none', border: 0, color: '#e3ebf3', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>Déconnexion</button>}
        {!m && (
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,.12)' }}>
            <Link to="/" style={{ color: '#e3ebf3', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>Voir la boutique<span>→</span></Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>GM</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}><span style={{ fontSize: 13 }}>{user.firstName} {user.lastName}</span><span style={{ fontSize: 11.5, color: '#8fa2bb', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</span></span>
            </div>
            <button onClick={onLogout} style={{ background: 'none', border: 0, padding: 0, color: '#8fa2bb', fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}>Se déconnecter</button>
          </div>
        )}
      </aside>

      {/* ---------- contenu ---------- */}
      <main style={{ minWidth: 0, padding: m ? '24px 16px 64px' : '40px clamp(28px,4vw,56px) 72px', display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={monoLabel}>{PAGES[view][0]}</span>
            <h1 className="display" style={{ lineHeight: 1, fontSize: m ? 26 : 34 }}>{PAGES[view][1]}</h1>
          </div>
          {ACTION[view] && <button className="btn btn-primary" onClick={ACTION[view]![1]} style={{ height: 48 }}>{ACTION[view]![0]}</button>}
        </div>

        {view === 'dash' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: m ? 'repeat(2,minmax(0,1fr))' : 'repeat(4,minmax(0,1fr))', gap: 12 }}>
              {[
                ['Chiffre d’affaires', fmt((overview?.revenueCents ?? 0) / 100), 'Encaissé, net des remboursements · 30 jours'],
                ['Commandes', String(overview?.ordersCount ?? 0), pendingOrders + ' à traiter'],
                ['Clients', String(overview?.customersCount ?? 0), (overview?.newCustomersLast7Days ?? 0) + ' nouveau' + ((overview?.newCustomersLast7Days ?? 0) > 1 ? 'x' : '') + ' cette semaine'],
                ['Panier moyen', fmt((overview?.averageBasketCents ?? 0) / 100), 'Commandes payées'],
              ].map(([l, v, s]) => (
                <div key={l} style={{ ...card, padding: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span style={{ ...monoLabel, fontSize: 10, letterSpacing: '.14em' }}>{l}</span>
                  <span style={{ fontStretch: '120%', fontWeight: 500, fontSize: 30, lineHeight: 1 }}>{v}</span>
                  <span style={{ fontSize: 12.5, color: '#6B6B66' }}>{s}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: m ? 'minmax(0,1fr)' : 'minmax(0,1.7fr) minmax(0,1fr)', gap: 12, alignItems: 'start' }}>
              <div style={{ ...card, padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>Chiffre d’affaires — 14 derniers jours</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#6B6B66' }}>{fmt(SALES.reduce((a, b) => a + b, 0))}</span>
                </div>
                <div style={{ height: 200, display: 'grid', gridTemplateColumns: 'repeat(14,minmax(0,1fr))', gap: 6, alignItems: 'end', borderBottom: '1px solid #E4E4E0' }}>
                  {SALES.map((v, i) => <div key={i} className="adm-bar" title={SHORT.format(new Date(sales[i].day)) + ' · ' + fmt(v)} style={{ height: Math.max(2, (v / maxS) * 100) + '%', background: i === SALES.length - 1 ? 'var(--ink)' : '#d3deea', transition: 'background .3s' }} />)}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 10, color: '#6B6B66' }}><span>{sales[0] ? SHORT.format(new Date(sales[0].day)) : ''}</span><span>Aujourd’hui</span></div>
              </div>
              <div style={{ ...card, padding: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Stock faible</span>
                {lowStock.map((p) => {
                  const st = Number(p.stock);
                  return (
                    <button key={p.id} onClick={() => openProduct(p)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 0', border: 0, borderTop: '1px solid #E4E4E0', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 13.5, fontWeight: 600, textTransform: 'uppercase' }}>{p.name}</span><span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: '#6B6B66' }}>{p.sku}</span></span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}><Dot c={st === 0 ? DOT.red : DOT.amber} size={7} />{st === 0 ? 'Épuisé' : `${st} restant${st > 1 ? 's' : ''}`}</span>
                    </button>
                  );
                })}
                {!lowStock.length && <span style={{ fontSize: 13.5, color: '#6B6B66' }}>Aucun produit sous le seuil.</span>}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: m ? 'minmax(0,1fr)' : 'minmax(0,1.7fr) minmax(0,1fr)', gap: 12, alignItems: 'start' }}>
              <div style={{ ...card, padding: 22, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>Commandes récentes</span>
                  <button onClick={() => setView('orders')} style={{ background: 'none', border: 0, borderBottom: '1px solid var(--ink)', padding: '2px 0', cursor: 'pointer', fontSize: 11, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase' }}>Tout voir</button>
                </div>
                {!orders.length && <span style={{ fontSize: 13.5, color: '#6B6B66' }}>{loaded ? 'Aucune commande.' : 'Chargement…'}</span>}
                {orders.slice(0, 5).map((o) => (
                  <button key={o.number} onClick={() => openOrder(o.number)} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 16, alignItems: 'center', padding: '13px 0', border: 0, borderTop: '1px solid #E4E4E0', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}><span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{o.number}</span><span style={{ fontSize: 13, color: '#6B6B66', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.customer}</span></span>
                    {orderStatusPill(o)}
                    <span style={{ fontSize: 14, whiteSpace: 'nowrap' }}>{fmt(o.total)}</span>
                  </button>
                ))}
              </div>
              <div style={{ ...card, padding: 22, display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>Meilleures ventes</span>
                {topProducts.map((p, i) => (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '12px 0', borderTop: '1px solid #E4E4E0' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#6B6B66' }}>{String(i + 1).padStart(2, '0')}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, textTransform: 'uppercase' }}>{p.name}</span>
                    <span style={{ fontSize: 13, color: '#6B6B66' }}>{p.sold} vendues</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {view === 'products' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <input className="adm-input" value={pq} onChange={(e) => { setPq(e.target.value); setProductPage(1); }} placeholder="Rechercher par nom, référence, SKU…" style={{ flex: 1, minWidth: 220, maxWidth: 420, height: 44, padding: '0 18px', border: '1px solid #D9D9D4', borderRadius: 999, background: '#fff', fontSize: 14, outline: 'none' }} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['Tous', 'Actif', 'Brouillon', 'Archivé', 'Stock faible'].map((l) => <Chip key={l} h={44} active={pf === l} onClick={() => { setPf(l); setProductPage(1); }}>{l}</Chip>)}
                <OutlineBtn onClick={openImport}>Importer un fichier</OutlineBtn>
              </div>
            </div>
            {tableWrap(1040, (() => {
              const cols = '56px minmax(220px,2fr) minmax(130px,1fr) 120px 100px 120px 170px';
              return (
                <>
                  <div style={thRow(cols)}><span /><span>Produit</span><span>Catégorie</span><span>Prix</span><span>Stock</span><span>Statut</span><span /></div>
                  {productRows.slice((productPage - 1) * ADMIN_PER_PAGE, productPage * ADMIN_PER_PAGE).map((p) => {
                    const st = Number(p.stock);
                    return (
                      <div key={p.id} className="adm-row" style={{ display: 'grid', gridTemplateColumns: cols, gap: 16, alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid #EDEDEA', transition: 'background .25s' }}>
                        {p.images[0]
                          ? <span style={{ ...thumb, width: 56, height: 56, backgroundImage: `url(${p.images[0].url})`, backgroundSize: 'cover', backgroundPosition: 'center' }} role="img" aria-label={p.name} />
                          : <span style={{ ...thumb, width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: '55%', aspectRatio: '1', borderRadius: '50%', border: '1px solid rgba(18,41,77,.18)' }} /></span>}
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}><span style={{ fontSize: 14, fontWeight: 600, textTransform: 'uppercase' }}>{p.name}</span><span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: '#6B6B66' }}>{p.sku} · {p.collection}</span>
                          {p.variants.length > 0 && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#6B6B66' }}>
                              {p.options.filter((o) => o.color).flatMap((o) => o.values).slice(0, 6).map((v) => <Dot key={v.label} c={v.hex} size={10} />)}
                              <span style={{ marginLeft: 2 }}>{p.variants.length} déclinaison{p.variants.length > 1 ? 's' : ''}</span>
                            </span>
                          )}</span>
                        <span style={{ fontSize: 13.5 }}>{p.category}</span>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 14 }}><span>{fmt(Number(p.price) || 0)}</span>{p.sale && <span style={{ fontSize: 12, color: '#6B6B66' }}>promo {fmt(Number(p.sale))}</span>}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5 }}><Dot size={7} c={p.unlimited === 'Oui' ? DOT.green : st === 0 ? DOT.red : st <= 3 ? DOT.amber : DOT.green} />{p.unlimited === 'Oui' ? <span title="Stock illimité">∞</span> : p.stock}</span>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                          <Pill dot={p.status === 'Actif' ? DOT.green : p.status === 'Brouillon' ? DOT.amber : DOT.grey}>{p.status}</Pill>
                          {!p.purchasable && <span style={{ fontSize: 11.5, color: '#6B6B66' }} title="Non disponible à la vente">Vitrine</span>}
                          {archivedColl(p.collection) && <span style={{ fontSize: 11.5, color: '#6B6B66' }} title="Collection archivée : le produit n’apparaît pas dans la boutique">Collection archivée</span>}
                        </span>
                        <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <SmallBtn onClick={() => openProduct(p)}>Modifier</SmallBtn>
                          <SmallBtn onClick={() => run(async () => {
                            const r = await api<{ data: ApiProduct }>(`/admin/products/${p.id}/status`, { method: 'PATCH', body: { status: p.status === 'Archivé' ? 'DRAFT' : 'ARCHIVED' } });
                            setProducts((ps) => ps.map((x) => (x.id === p.id ? toProduct(r.data) : x)));
                          }, p.status === 'Archivé' ? 'Produit restauré en brouillon' : 'Produit archivé')}>{p.status === 'Archivé' ? 'Restaurer' : 'Archiver'}</SmallBtn>
                          <SmallBtn onClick={() => duplicateProduct(p)}>Dupliquer</SmallBtn>
                          <SmallBtn onClick={() => deleteProduct(p)}>Supprimer</SmallBtn>
                        </span>
                      </div>
                    );
                  })}
                  {!productRows.length && <div style={{ padding: '40px 20px', fontSize: 14, color: '#6B6B66' }}>{loaded ? 'Aucun produit ne correspond.' : 'Chargement…'}</div>}
                </>
              );
            })())}
            <AdminPager page={productPage} total={productRows.length} onChange={setProductPage} />
          </>
        )}

        {view === 'orders' && (
          <>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
              {([['ALL', 'Toutes'], ...OS.map((o) => [o[0], o[1]])] as [OrderStatus | 'ALL', string][]).map(([k, label]) => (
                <Chip key={k} active={of === k} onClick={() => { setOf(k); setOrderPage(1); }}>{label}<span style={{ fontFamily: 'var(--mono)', fontSize: 11, opacity: 0.7 }}>{k === 'ALL' ? inPeriod.length : inPeriod.filter((o) => o.status === k).length}</span></Chip>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <select className="adm-input" value={period} aria-label="Période" onChange={(e) => { setPeriod(e.target.value as Period); setOrderPage(1); }}
                style={{ height: 40, padding: '0 14px', border: '1px solid #D9D9D4', borderRadius: 999, background: '#fff', fontSize: 13.5 }}>
                {PERIODS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              {period === 'custom' && (
                <>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>Du
                    <input type="date" className="adm-input" value={periodFrom} max={periodTo || undefined} onChange={(e) => { setPeriodFrom(e.target.value); setOrderPage(1); }}
                      style={{ height: 40, padding: '0 12px', border: '1px solid #D9D9D4', borderRadius: 999, background: '#fff', fontSize: 13 }} />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>au
                    <input type="date" className="adm-input" value={periodTo} min={periodFrom || undefined} onChange={(e) => { setPeriodTo(e.target.value); setOrderPage(1); }}
                      style={{ height: 40, padding: '0 12px', border: '1px solid #D9D9D4', borderRadius: 999, background: '#fff', fontSize: 13 }} />
                  </label>
                </>
              )}
              <span style={{ fontSize: 13, color: '#55554F' }}>
                {inPeriod.length} commande{inPeriod.length > 1 ? 's' : ''} · {fmt(periodSales.reduce((a, o) => a + o.total, 0))} de ventes (hors annulées et remboursées)
              </span>
            </div>
            {tableWrap(1100, (() => {
              const cols = '120px minmax(200px,1.4fr) 140px 70px 110px 160px 150px';
              return (
                <>
                  <div style={thRow(cols)}><span>N°</span><span>Client</span><span>Date</span><span>Articles</span><span>Total</span><span>Paiement</span><span>Statut</span></div>
                  {orderRows.slice((orderPage - 1) * ADMIN_PER_PAGE, orderPage * ADMIN_PER_PAGE).map((o) => (
                    <button key={o.number} className="adm-row" onClick={() => openOrder(o.number)} style={{ width: '100%', display: 'grid', gridTemplateColumns: cols, gap: 16, alignItems: 'center', padding: '15px 20px', border: 0, borderBottom: '1px solid #EDEDEA', background: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background .25s' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}>{o.number}</span>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}><span style={{ fontSize: 14 }}>{o.customer}</span><span style={{ fontSize: 12, color: '#6B6B66', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.email}</span></span>
                      <span style={{ fontSize: 13, color: '#55554F' }}>{o.date}</span>
                      <span style={{ fontSize: 13.5 }}>{o.lines.reduce((a, l) => a + l.qty, 0)}</span>
                      <span style={{ fontSize: 14 }}>{fmt(o.total)}</span>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}><Dot c={DOT[PAYDOT[o.pay]]} />{o.pay}</span><span style={{ fontSize: 11.5, color: '#6B6B66' }}>{o.method}</span></span>
                      {orderStatusPill(o)}
                    </button>
                  ))}
                </>
              );
            })())}
            <AdminPager page={orderPage} total={orderRows.length} onChange={setOrderPage} />
          </>
        )}

        {view === 'promos' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 16 }}>Codes promo</span>
              <OutlineBtn onClick={() => openCoupon()}>+ Coupon</OutlineBtn>
            </div>
            {tableWrap(1060, (() => {
              const cols = '150px 110px 120px 140px minmax(220px,1fr) 70px 100px';
              return (
                <>
                  <div style={thRow(cols)}><span>Code</span><span>Remise</span><span>Minimum</span><span>Utilisations</span><span>Validité</span><span>Actif</span><span /></div>
                  {coupons.map((c) => {
                    const max = Number(c.max) || 0;
                    return (
                      <div key={c.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 16, alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #EDEDEA' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 500, letterSpacing: '.06em' }}>{c.code}</span>
                        <span style={{ fontSize: 14 }}>{c.type === 'Pourcentage' ? `−${c.value} %` : '−' + fmt(Number(c.value))}</span>
                        <span style={{ fontSize: 13.5, color: '#55554F' }}>{Number(c.min) ? 'dès ' + fmt(Number(c.min)) : 'Aucun'}</span>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <span style={{ fontSize: 13 }}>{c.used} / {max || '∞'}</span>
                          <span style={{ height: 3, background: '#EDEDEA' }}><span style={{ display: 'block', height: 3, width: max ? Math.min(100, (c.used / max) * 100) + '%' : 0, background: 'var(--ink)' }} /></span>
                        </span>
                        <span style={{ fontSize: 13, color: '#55554F' }}>{(c.start || '—') + ' → ' + (c.end || '—')}</span>
                        <button aria-label="Activer / désactiver" onClick={() => run(async () => {
                          const r = await api<{ data: ApiCoupon }>(`/admin/coupons/${c.id}`, { method: 'PATCH', body: { isActive: !c.active } });
                          setCoupons((cs) => cs.map((x) => (x.id === c.id ? toCoupon(r.data) : x)));
                        }, c.code + (c.active ? ' désactivé' : ' activé'))} style={{ width: 44, height: 26, borderRadius: 999, border: 0, padding: 3, cursor: 'pointer', background: c.active ? 'var(--ink)' : '#D9D9D4', display: 'flex', justifyContent: c.active ? 'flex-end' : 'flex-start', transition: 'background .3s' }}>
                          <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
                        </button>
                        <span style={{ justifySelf: 'end' }}><SmallBtn onClick={() => openCoupon(c)}>Modifier</SmallBtn></span>
                      </div>
                    );
                  })}
                </>
              );
            })())}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 16 }}>Promotions automatiques</span>
              <OutlineBtn onClick={() => openPromo()}>+ Promotion</OutlineBtn>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: m ? 'minmax(0,1fr)' : 'repeat(2,minmax(0,1fr))', gap: 12 }}>
              {promos.map((p) => {
                const live = p.active && p.start <= TODAY && p.end >= TODAY, soon = p.active && p.start > TODAY;
                return (
                  <div key={p.id} style={{ ...card, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><span style={{ fontStretch: '115%', fontWeight: 600, textTransform: 'uppercase', fontSize: 15 }}>{p.name}</span><span style={{ fontSize: 13, color: '#6B6B66' }}>{p.target}</span></span>
                      <span style={{ fontStretch: '120%', fontSize: 26, fontWeight: 500, lineHeight: 1 }}>{p.type === 'Pourcentage' ? `−${p.value} %` : '−' + fmt(Number(p.value))}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingTop: 14, borderTop: '1px solid #E4E4E0' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}><Dot c={live ? DOT.green : soon ? DOT.amber : DOT.grey} />{live ? 'En cours' : soon ? 'Programmée' : 'Inactive'} · {p.start} → {p.end}</span>
                      <SmallBtn onClick={() => openPromo(p)}>Modifier</SmallBtn>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {view === 'reviews' && (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {([['PENDING', 'À modérer'], ['APPROVED', 'Publiés'], ['REJECTED', 'Refusés'], ['ALL', 'Tous']] as [ReviewStatus | 'ALL', string][]).map(([k, label]) => <Chip key={k} active={rf === k} onClick={() => setRf(k)}>{label}</Chip>)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {reviewRows.map((r) => {
                const RS: Record<ReviewStatus, [string, DotKey]> = { PENDING: ['À modérer', 'amber'], APPROVED: ['Publié', 'green'], REJECTED: ['Refusé', 'red'] };
                const setR = (st: ReviewStatus) => run(async () => {
                  const res = await api<{ data: ApiReview }>(`/admin/reviews/${r.id}/status`, { method: 'PATCH', body: { status: st } });
                  setReviews((rs) => rs.map((x) => (x.id === r.id ? toReview(res.data) : x)));
                }, st === 'APPROVED' ? 'Avis publié' : 'Avis refusé');
                return (
                  <div key={r.id} style={{ ...card, padding: 22, display: 'grid', gridTemplateColumns: m ? 'minmax(0,1fr)' : 'minmax(0,1fr) auto', gap: 20, alignItems: 'start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ letterSpacing: '.12em', fontSize: 13 }}>{'★'.repeat(r.rating) + '☆'.repeat(5 - r.rating)}</span>
                        <span style={{ fontSize: 13.5, fontWeight: 600, textTransform: 'uppercase' }}>{r.product}</span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.1em', color: '#6B6B66' }}>{r.author} · {r.date} · achat vérifié</span>
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{r.title}</span>
                      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65, color: '#3A3A36' }}>{r.body}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <Pill dot={DOT[RS[r.status][1]]}>{RS[r.status][0]}</Pill>
                      {r.status === 'PENDING' && <><SmallBtn onClick={() => setR('REJECTED')}>Refuser</SmallBtn><SmallBtn dark onClick={() => setR('APPROVED')}>Publier</SmallBtn></>}
                    </div>
                  </div>
                );
              })}
              {!reviewRows.length && <div style={{ ...card, padding: 32, fontSize: 14, color: '#6B6B66' }}>Aucun avis dans cette liste.</div>}
            </div>
          </>
        )}

        {view === 'categories' && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input className="adm-input" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nouvelle catégorie (ex. Soin des pieds)"
                onKeyDown={(e) => { if (e.key === 'Enter' && newCat.trim().length >= 2) catAction(async () => { await api('/admin/categories', { method: 'POST', body: { name: newCat.trim() } }); setNewCat(''); return null; }, 'Catégorie créée'); }}
                style={{ flex: 1, minWidth: 220, maxWidth: 420, height: 44, padding: '0 18px', border: '1px solid #D9D9D4', borderRadius: 999, background: '#fff', fontSize: 14, outline: 'none' }} />
              <OutlineBtn onClick={() => { if (newCat.trim().length >= 2) catAction(async () => { await api('/admin/categories', { method: 'POST', body: { name: newCat.trim() } }); setNewCat(''); return null; }, 'Catégorie créée'); }}>+ Catégorie</OutlineBtn>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: m ? 'minmax(0,1fr)' : 'repeat(auto-fill,minmax(300px,1fr))', gap: 12 }}>
              {cats.map((c) => {
                const d = draftOf(c);
                const dirty = d.name !== c.name || d.description !== (c.description ?? '');
                const setD = (patch: Partial<typeof d>) => setCatDraft((x) => ({ ...x, [c.id]: { ...d, ...patch } }));
                return (
                  <div key={c.id} style={{ ...card, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ ...thumb, position: 'relative', aspectRatio: '4/3', opacity: c.isActive ? 1 : 0.45, backgroundImage: c.imageUrl ? `url(${c.imageUrl})` : thumb.backgroundImage, backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, padding: 10 }}>
                      {!c.imageUrl && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#6B6B66' }}>Aucune image</span>}
                      <label className="adm-small" style={{ position: 'relative', height: 34, padding: '0 14px', borderRadius: 999, border: '1px solid #D9D9D4', background: '#fff', display: 'inline-flex', alignItems: 'center', fontSize: 12.5, cursor: busy ? 'wait' : 'pointer' }}>
                        {c.imageUrl ? 'Changer l’image' : 'Ajouter une image'}
                        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} style={{ display: 'none' }}
                          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadCatImage(c.id, f); }} />
                      </label>
                      {c.imageUrl && <SmallBtn onClick={() => { if (window.confirm('Retirer l’image de cette catégorie ?')) catAction(() => api<{ data: ApiCategory }>(`/admin/categories/${c.id}/image`, { method: 'DELETE' }), 'Image retirée'); }}>Retirer</SmallBtn>}
                    </div>
                    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <input className="adm-input" value={d.name} aria-label="Nom" onChange={(e) => setD({ name: e.target.value })} style={{ height: 40, padding: '0 12px', border: '1px solid #D9D9D4', fontSize: 14.5, fontWeight: 600, outline: 'none' }} />
                      <textarea className="adm-input" rows={2} value={d.description} aria-label="Description" placeholder="Phrase affichée sous le titre de la catégorie" onChange={(e) => setD({ description: e.target.value })} style={{ padding: '10px 12px', border: '1px solid #D9D9D4', fontSize: 13.5, lineHeight: 1.5, resize: 'vertical', outline: 'none' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12.5, color: '#6B6B66' }}>
                          {!c.isActive && <strong style={{ color: 'var(--ink)' }}>Masquée · </strong>}{c._count.products} produit{c._count.products > 1 ? 's' : ''} · /{c.slug}
                        </span>
                        <span style={{ display: 'flex', gap: 6 }}>
                          <SmallBtn onClick={() => {
                            if (c.isActive && !window.confirm(`Masquer « ${c.name} » ? Sa carte et ses ${c._count.products} produit(s) disparaîtront de la boutique (elles restent dans l’admin).`)) return;
                            catAction(() => api<{ data: ApiCategory }>(`/admin/categories/${c.id}`, { method: 'PATCH', body: { isActive: !c.isActive } }), c.isActive ? 'Catégorie masquée' : 'Catégorie de nouveau visible');
                          }}>{c.isActive ? 'Masquer' : 'Afficher'}</SmallBtn>
                          {!c._count.products && <SmallBtn onClick={() => { if (window.confirm(`Supprimer la catégorie « ${c.name} » ?`)) catAction(async () => { await api(`/admin/categories/${c.id}`, { method: 'DELETE' }); return null; }, 'Catégorie supprimée'); }}>Supprimer</SmallBtn>}
                          {dirty && <SmallBtn dark onClick={() => catAction(async () => {
                            const r = await api<{ data: ApiCategory }>(`/admin/categories/${c.id}`, { method: 'PATCH', body: { name: d.name.trim(), description: d.description.trim() || null } });
                            setCatDraft((x) => { const n = { ...x }; delete n[c.id]; return n; });
                            return r;
                          }, 'Catégorie enregistrée')}>Enregistrer</SmallBtn>}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <span style={{ fontSize: 12.5, color: '#6B6B66' }}>Les images s’affichent sur les cartes « Trouvez votre gadget » de la boutique. Format paysage conseillé, JPG, PNG ou WebP, 5 Mo maximum. Une catégorie masquée disparaît de la boutique avec tous ses produits ; « Afficher » la rétablit.</span>

            <span style={{ ...monoLabel, marginTop: 24 }}>Collections</span>
            <div style={{ display: 'grid', gridTemplateColumns: m ? 'minmax(0,1fr)' : 'repeat(auto-fill,minmax(260px,1fr))', gap: 10 }}>
              {colls.map((c) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', background: '#fff', border: '1px solid #E6E6E1', opacity: c.isActive ? 1 : 0.6 }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</span>
                    <span style={{ fontSize: 12, color: '#6B6B66' }}>
                      {!c.isActive && <strong style={{ color: '#111' }}>Archivée · </strong>}{c._count.products} produit{c._count.products > 1 ? 's' : ''}
                    </span>
                  </span>
                  <SmallBtn onClick={() => toggleColl(c)}>{c.isActive ? 'Archiver' : 'Restaurer'}</SmallBtn>
                </div>
              ))}
            </div>
            <span style={{ fontSize: 12.5, color: '#6B6B66' }}>Archiver une collection la retire de la boutique avec tous ses produits, sans changer leur statut ; « Restaurer » remet tout en ligne comme avant.</span>
          </>
        )}

        {view === 'clients' && tableWrap(760, (() => {
          const cols = 'minmax(0,1.4fr) minmax(0,1.4fr) 100px 130px 130px 100px';
          return (
            <>
              <div style={thRow(cols)}><span>Client</span><span>E-mail</span><span>Commandes</span><span>Total dépensé</span><span>Inscrit le</span><span>Rôle</span></div>
              {clients.map(({ id, name, email, orders: n, since, spent }) => (
                <div key={id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 16, alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #EDEDEA' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 32, height: 32, borderRadius: '50%', background: '#EEEEEB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>{name.split(' ').map((x) => x[0]).join('')}</span><span style={{ fontSize: 14 }}>{name}</span></span>
                  <span style={{ fontSize: 13.5, color: '#55554F' }}>{email}</span>
                  <span style={{ fontSize: 14 }}>{n}</span>
                  <span style={{ fontSize: 14 }}>{fmt(spent)}</span>
                  <span style={{ fontSize: 13, color: '#55554F' }}>{since}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase' }}>Client</span>
                </div>
              ))}
            </>
          );
        })())}
      </main>

      {/* ---------- panneau latéral (formulaires & détail commande) ---------- */}
      <div onClick={() => setDrawer(null)} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(18,41,77,.38)', opacity: drawer ? 1 : 0, pointerEvents: drawer ? 'auto' : 'none', transition: 'opacity .45s ease' }} />
      <aside aria-hidden={!drawer} style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 60, width: 'min(620px,100vw)', background: 'var(--ivory)', display: 'flex', flexDirection: 'column', transform: drawer ? 'translateX(0)' : 'translateX(105%)', transition: 'transform .55s var(--ease)', boxShadow: '-20px 0 60px rgba(0,0,0,.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '18px 24px', borderBottom: '1px solid #E4E4E0', background: '#fff' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ ...monoLabel, fontSize: 10 }}>{drawerHead[0]}</span>
            <span style={{ fontStretch: '125%', fontWeight: 600, textTransform: 'uppercase', fontSize: 17 }}>{drawerHead[1]}</span>
          </div>
          <button className="icon-btn" onClick={() => setDrawer(null)} aria-label="Fermer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 28 }}>
          {drawer === 'import' && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5, lineHeight: 1.6, color: '#3A3A36' }}>
                <span style={monoLabel}>1 · Préparer le fichier</span>
                <span>Un fichier <strong>CSV</strong> (Excel → Enregistrer sous → CSV), une ligne par produit. Colonnes obligatoires : <strong>nom</strong> et <strong>prix</strong> (en DH).
                  Facultatives : prix_barre, stock, sku, categorie, marque, accroche, points_forts (séparés par « | »), couleurs (séparées par « | »), garantie (mois), statut, description, images (adresses https séparées par « | »).</span>
                <span>Les produits sont créés <strong>en brouillon</strong> (sauf statut « Actif ») : vérifiez-les puis publiez-les. Importez uniquement des produits que vous avez le droit de vendre, avec des photos autorisées par votre fournisseur.</span>
                <span><SmallBtn onClick={downloadTemplate}>Télécharger le modèle</SmallBtn></span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={monoLabel}>2 · Choisir le fichier</span>
                <label className="adm-small" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 72, border: '1px dashed #9A9A94', background: '#fff', cursor: busy ? 'wait' : 'pointer', fontSize: 13.5, color: '#55554F', padding: 12, textAlign: 'center' }}>
                  {importFile ? <>📄 {importFile.name} · <u>changer</u></> : <>Cliquez pour choisir un fichier .csv</>}
                  <input type="file" accept=".csv,text/csv,text/plain" disabled={busy} style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) analyseImport(f); }} />
                </label>
              </div>
              {importPreview && !importResult && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span style={monoLabel}>3 · Vérifier</span>
                  <span style={{ fontSize: 14 }}><strong>{importPreview.summary.valid}</strong> produit{importPreview.summary.valid > 1 ? 's' : ''} prêt{importPreview.summary.valid > 1 ? 's' : ''} à importer
                    {importPreview.summary.invalid > 0 && <> · <span style={{ color: DOT.red }}>{importPreview.summary.invalid} ligne{importPreview.summary.invalid > 1 ? 's' : ''} en erreur (ignorée{importPreview.summary.invalid > 1 ? 's' : ''})</span></>}</span>
                  {importPreview.unknownColumns.length > 0 && <span style={{ fontSize: 12.5, color: '#6B6B66' }}>Colonnes non utilisées : {importPreview.unknownColumns.join(', ')}</span>}
                  <div style={{ ...card, maxHeight: 360, overflowY: 'auto' }}>
                    {importPreview.reports.map((r) => (
                      <div key={r.line} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr) auto', gap: 10, padding: '9px 12px', borderBottom: '1px solid #EDEDEA', fontSize: 13, alignItems: 'start' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#6B6B66' }}>L{r.line}</span>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                          <span style={{ fontWeight: 600 }}>{r.name}</span>
                          {r.row && <span style={{ color: '#6B6B66', fontSize: 12 }}>{r.row.category} · {r.row.brand} · stock {r.row.stock}{r.row.colors.length ? ' · ' + r.row.colors.join(', ') : ''} · {r.row.images.length} photo{r.row.images.length > 1 ? 's' : ''}</span>}
                          {r.errors.length > 0 && <span style={{ color: DOT.red, fontSize: 12 }}>{r.errors.join(' · ')}</span>}
                          {r.warnings.length > 0 && <span style={{ color: 'oklch(0.55 0.12 75)', fontSize: 12 }}>{r.warnings.join(' · ')}</span>}
                        </span>
                        <span style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{r.row ? fmt((r.row.salePriceCents ?? r.row.priceCents) / 100) : '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {importResult && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span style={monoLabel}>Résultat</span>
                  <span style={{ fontSize: 14, lineHeight: 1.6 }}>
                    <strong>{importResult.summary.created}</strong> produit(s) créé(s) en brouillon · {importResult.summary.images} photo(s)
                    {importResult.summary.skipped > 0 && <> · {importResult.summary.skipped} déjà présente(s)</>}
                    {importResult.summary.errors > 0 && <> · <span style={{ color: DOT.red }}>{importResult.summary.errors} en erreur</span></>}
                  </span>
                  {(importResult.summary.newCategories.length > 0 || importResult.summary.newBrands.length > 0) && (
                    <span style={{ fontSize: 12.5, color: '#6B6B66' }}>Créées automatiquement : {[...importResult.summary.newCategories.map((c) => 'catégorie ' + c), ...importResult.summary.newBrands.map((b) => 'marque ' + b)].join(', ')}</span>
                  )}
                  <div style={{ ...card, maxHeight: 320, overflowY: 'auto' }}>
                    {importResult.results.filter((r) => r.status !== 'created' || r.message).map((r) => (
                      <div key={r.line} style={{ padding: '8px 12px', borderBottom: '1px solid #EDEDEA', fontSize: 12.5 }}>
                        <span style={{ fontFamily: 'var(--mono)', color: '#6B6B66' }}>L{r.line}</span> {r.name} — <span style={{ color: r.status === 'error' ? DOT.red : '#6B6B66' }}>{r.status === 'skipped' ? 'ignorée : ' : r.status === 'error' ? 'erreur : ' : ''}{r.message}</span>
                      </div>
                    ))}
                  </div>
                  <span style={{ fontSize: 12.5, color: '#6B6B66' }}>Les nouveaux produits sont dans la liste avec le statut « Brouillon » : relisez-les puis publiez-les.</span>
                </div>
              )}
            </>
          )}
          {drawer === 'product' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={monoLabel}>Photos</span>
              {editId ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8 }}>
                  {images.map((img) => (
                    <div key={img.id} title={img.isPrimary ? 'Photo principale' : 'Cliquer pour en faire la photo principale'}
                      onClick={() => !img.isPrimary && imageAction(`/admin/products/${editId}/images/${img.id}/primary`, 'PATCH', 'Photo principale modifiée')}
                      style={{ ...thumb, position: 'relative', aspectRatio: '1', cursor: img.isPrimary ? 'default' : 'pointer', border: `1px solid ${img.isPrimary ? 'var(--ink)' : 'transparent'}`, backgroundImage: `url(${img.url})`, backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', alignItems: 'flex-end', padding: 6 }}>
                      {img.isPrimary && <span style={{ padding: '3px 7px', borderRadius: 999, background: 'var(--ink)', color: '#fff', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase' }}>Principale</span>}
                      <button aria-label="Supprimer la photo" onClick={(e) => { e.stopPropagation(); if (window.confirm('Supprimer cette photo ?')) imageAction(`/admin/products/${editId}/images/${img.id}`, 'DELETE', 'Photo supprimée'); }}
                        style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: '50%', border: 0, background: '#fff', cursor: 'pointer', fontSize: 12 }}>×</button>
                    </div>
                  ))}
                  <label className="adm-small" style={{ aspectRatio: '1', border: '1px dashed #9A9A94', background: '#fff', cursor: busy ? 'wait' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 12, color: '#55554F' }}>
                    <span style={{ fontSize: 20 }}>+</span>{busy ? 'Envoi…' : 'Ajouter'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} style={{ display: 'none' }}
                      onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; uploadProductImages(editId, files); }} />
                  </label>
                </div>
              ) : <span style={{ fontSize: 13, color: '#6B6B66' }}>Enregistrez d’abord le produit, puis ajoutez ses photos.</span>}
              <span style={{ fontSize: 12, color: '#6B6B66' }}>JPG, PNG ou WebP, 5 Mo maximum, fond neutre. Cliquez sur une photo pour en faire la photo principale.</span>
            </div>
          )}
          {drawer === 'product' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={monoLabel}>Vidéos</span>
              {editId ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8 }}>
                  {videos.map((v) => (
                    <div key={v.id} style={{ ...thumb, position: 'relative', aspectRatio: '1', background: '#111', overflow: 'hidden' }}>
                      <video src={`${v.url}#t=0.1`} muted playsInline preload="metadata" controls style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      <button aria-label="Supprimer la vidéo" onClick={() => { if (window.confirm('Supprimer cette vidéo ?')) imageAction(`/admin/products/${editId}/videos/${v.id}`, 'DELETE', 'Vidéo supprimée'); }}
                        style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: '50%', border: 0, background: '#fff', cursor: 'pointer', fontSize: 12 }}>×</button>
                    </div>
                  ))}
                  {videos.length < 4 && (
                    <label className="adm-small" style={{ aspectRatio: '1', border: '1px dashed #9A9A94', background: '#fff', cursor: busy ? 'wait' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 12, color: '#55554F' }}>
                      <span style={{ fontSize: 20 }}>+</span>{busy ? 'Envoi…' : 'Ajouter'}
                      <input type="file" accept="video/mp4,video/quicktime,video/webm" multiple disabled={busy} style={{ display: 'none' }}
                        onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; uploadProductVideos(editId, files); }} />
                    </label>
                  )}
                </div>
              ) : <span style={{ fontSize: 13, color: '#6B6B66' }}>Enregistrez d’abord le produit, puis ajoutez ses vidéos.</span>}
              <span style={{ fontSize: 12, color: '#6B6B66' }}>MP4 conseillé (lisible sur tous les téléphones), MOV ou WebM, 4 vidéos par produit, affichées après les photos. Pour un chargement rapide : 15 à 30 secondes, 720p, moins de 10 Mo (40 Mo au maximum).</span>
            </div>
          )}

          {groups.map((g) => (
            <div key={g.title} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={monoLabel}>{g.title}</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>{g.fields.map(renderField)}</div>
            </div>
          ))}

          {drawer === 'product' && (
            <VariantsEditor opts={opts} vars={vars} baseSku={form.sku ?? ''} basePrice={form.price ?? ''} photos={images.map((i) => i.url)}
              onChange={(o, v) => { setOpts(o); setVars(v); setVarsDirty(true); setErrors((e) => ({ ...e, variants: '' })); }} />
          )}

          {drawer === 'product' && (
            <div style={{ ...card, padding: 16, display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13.5 }}>
              <span style={{ color: '#55554F' }}>Aperçu prix boutique</span>
              <span style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <span style={{ fontWeight: 600 }}>{fmt(hasPromo ? sv : pv)}</span>
                {hasPromo && <>
                  <span style={{ color: '#6B6B66', textDecoration: 'line-through' }}>{fmt(pv)}</span>
                  <span style={{ padding: '3px 8px', borderRadius: 999, background: 'var(--ink)', color: '#fff', fontFamily: 'var(--mono)', fontSize: 10 }}>−{Math.round((1 - sv / pv) * 100)} %</span>
                </>}
              </span>
            </div>
          )}

          {order && (() => {
            const infoCard: CSSProperties = { ...card, padding: 16, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5, lineHeight: 1.5 };
            const setStatus = (k: OrderStatus, label: string) => {
              if (order.status === k) return;
              if (k === 'CANCELLED' && !window.confirm(`Annuler ${order.number} ? Le stock sera restitué${order.pay === 'Payé' ? ' et le paiement remboursé' : ''}.`)) return;
              orderAction(order, `/admin/orders/${order.id}/status`, { status: k }, label, 'PATCH');
            };
            const refund = () => {
              if (!order.paymentId || !window.confirm(`Rembourser ${fmt(order.refundable)} à ${order.customer} ?`)) return;
              orderAction(order, `/admin/payments/${order.paymentId}/refund`, { reason: 'Remboursement depuis l’administration' }, 'Remboursement enregistré');
            };
            const canShip = ['CONFIRMED', 'PROCESSING', 'SHIPPED'].includes(order.status);
            const shipChanged = ship.carrier !== order.carrier || ship.tracking.trim() !== order.tracking;
            return (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <span style={monoLabel}>Statut de la commande</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {OS.filter(([k]) => k !== 'REFUNDED' || order.status === 'REFUNDED').map(([k, label, c]) => <Chip key={k} h={38} active={order.status === k} onClick={() => setStatus(k, label)}><Dot c={order.status === k ? '#fff' : DOT[c]} />{label}</Chip>)}
                  </div>
                  <span style={{ fontSize: 12, color: '#6B6B66' }}>Ordre : en attente → confirmée → en préparation → expédiée → livrée. Annulation possible jusqu’à la confirmation ; le remboursement se fait depuis le bloc Paiement.</span>
                </div>
                <div style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column' }}>
                  {order.lines.map((l) => (
                    <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '52px minmax(0,1fr) auto', gap: 14, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #EDEDEA' }}>
                      <span style={{ ...thumb, aspectRatio: '1' }} />
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontSize: 13.5, fontWeight: 600, textTransform: 'uppercase' }}>{l.name}</span><span style={{ fontSize: 12, color: '#6B6B66' }}>{l.variant ? l.variant + ' · ' : ''}{l.qty} × {fmt(l.unit)} · prix figé à l’achat</span></span>
                      <span style={{ fontSize: 14 }}>{fmt(l.unit * l.qty)}</span>
                    </div>
                  ))}
                  {[['Sous-total', fmt(order.subtotal)], ...(order.shipping ? [['Livraison', fmt(order.shipping)]] : []), ['Réduction', order.discount ? '−' + fmt(order.discount) + (order.coupon ? ' · ' + order.coupon : '') : '—'], ['Total TTC', fmt(order.total)]].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, fontSize: k === 'Total TTC' ? 16 : 13.5, fontWeight: k === 'Total TTC' ? 600 : 400 }}><span>{k}</span><span>{v}</span></div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: m ? 'minmax(0,1fr)' : 'repeat(2,minmax(0,1fr))', gap: 12 }}>
                  <div style={infoCard}>
                    <span style={{ ...monoLabel, fontSize: 10, marginBottom: 4 }}>Client &amp; livraison</span>
                    <span style={{ fontWeight: 600 }}>{order.customer}</span>{order.email !== order.phone && <span>{order.email}</span>}<span>{order.phone}</span><span style={{ color: '#55554F' }}>{order.address}</span>
                  </div>
                  <div style={infoCard}>
                    <span style={{ ...monoLabel, fontSize: 10, marginBottom: 4 }}>Paiement</span>
                    <span style={{ fontWeight: 600 }}>{order.method}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Dot c={DOT[PAYDOT[order.pay]]} />{order.pay}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#6B6B66' }}>{order.paymentRef}</span>
                    {order.refundable > 0 && <span style={{ marginTop: 6 }}><SmallBtn onClick={refund}>Rembourser {fmt(order.refundable)}</SmallBtn></span>}
                    {(order.pay === 'À encaisser' || order.pay === 'Virement attendu') && !['CANCELLED', 'REFUNDED'].includes(order.status) && <span style={{ marginTop: 6 }}><SmallBtn dark={order.pay === 'Virement attendu'} onClick={() => orderAction(order, `/admin/orders/${order.id}/payment-received`, undefined, order.pay === 'Virement attendu' ? 'Virement reçu' : 'Paiement encaissé')}>{order.pay === 'Virement attendu' ? 'Virement reçu' : 'Marquer encaissé'}</SmallBtn></span>}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <span style={monoLabel}>Expédition</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: '#55554F' }}>Transporteur
                      <select disabled={!canShip} value={ship.carrier} onChange={(e) => setShip((x) => ({ ...x, carrier: e.target.value }))} style={{ height: 46, padding: '0 12px', border: '1px solid #D9D9D4', background: '#fff', fontSize: 14.5, color: 'var(--ink)' }}>
                        {CARRIERS.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: '#55554F' }}>N° de suivi
                      <input disabled={!canShip} className="adm-input" value={ship.tracking} placeholder="CA123456789MA" onChange={(e) => setShip((x) => ({ ...x, tracking: e.target.value }))} style={{ height: 46, padding: '0 14px', border: '1px solid #D9D9D4', background: '#fff', fontSize: 14.5, color: 'var(--ink)', outline: 'none', fontFamily: 'var(--mono)' }} />
                    </label>
                  </div>
                  {canShip && (shipChanged || order.status !== 'SHIPPED') && (
                    <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: '#6B6B66' }}>{order.status === 'SHIPPED' ? 'Corrige le suivi du colis.' : 'La commande passera à « Expédiée ».'}</span>
                      <SmallBtn dark onClick={() => {
                        if (!ship.tracking.trim()) return flash('Renseignez le numéro de suivi');
                        orderAction(order, `/admin/orders/${order.id}/shipments`, { carrier: ship.carrier, trackingNumber: ship.tracking.trim() }, order.status === 'SHIPPED' ? 'Suivi mis à jour' : 'Expédiée');
                      }}>{order.status === 'SHIPPED' ? 'Mettre à jour le suivi' : 'Enregistrer l’expédition'}</SmallBtn>
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <span style={monoLabel}>Historique</span>
                  <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid #D9D9D4', marginLeft: 5 }}>
                    {order.history.map((h, i) => (
                      <div key={i} style={{ position: 'relative', padding: '0 0 16px 20px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ position: 'absolute', left: -5, top: 4, width: 9, height: 9, borderRadius: '50%', background: 'var(--ink)', boxShadow: '0 0 0 3px var(--ivory)' }} />
                        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{h.label}</span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: '#6B6B66' }}>{h.at} · {h.by}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            );
          })()}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #E4E4E0', background: '#fff', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={() => setDrawer(null)} style={{ height: 48 }}>{drawer === 'order' || importResult ? 'Fermer' : 'Annuler'}</button>
          {drawer === 'import' && importPreview && !importResult && importPreview.summary.valid > 0 && (
            <button className="btn btn-primary" disabled={busy} onClick={runImport} style={{ height: 48, opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Import en cours…' : `Importer ${importPreview.summary.valid} produit${importPreview.summary.valid > 1 ? 's' : ''}`}
            </button>
          )}
          {drawer && drawer !== 'order' && drawer !== 'import' && <button className="btn btn-primary" onClick={save} style={{ height: 48 }}>{drawer === 'product' && !editId ? 'Ajouter au catalogue' : 'Enregistrer'}</button>}
        </div>
      </aside>

      <div role="status" style={{ position: 'fixed', left: '50%', bottom: 28, zIndex: 70, transform: toast.on ? 'translate(-50%,0)' : 'translate(-50%,16px)', opacity: toast.on ? 1 : 0, transition: 'transform .45s var(--ease),opacity .45s', background: 'var(--ink)', color: '#fff', padding: '14px 22px', borderRadius: 999, fontSize: 13.5, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
        {toast.msg}
      </div>
    </div>
  );
}
