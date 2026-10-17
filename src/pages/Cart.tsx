import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { Link, useNavigate } from 'react-router-dom';
import { QtyStepper } from '../components/Shell';
import { useCatalog } from '../catalog';
import { fmt } from '../data';
import { useLayout } from '../layout';
import { track } from '../pixel';
import { PATHS, productPath, shopPath } from '../routes';
import { useStore } from '../store';

export default function Cart() {
  const L = useLayout();
  const navigate = useNavigate();
  const s = useStore();
  const { status } = useCatalog();
  // Panier enregistré mais catalogue pas encore chargé : on attend plutôt que d'afficher « vide ».
  if (status === 'loading' && s.cart.length) return <CartLoading />;
  return (
    <section data-reveal style={{ padding: `${L.pageTop} ${L.px} 0`, display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
        <h1 className="display" style={{ lineHeight: 1, fontSize: L.h2 }}>السلة</h1>
        <span className="mono" style={{ letterSpacing: '.14em' }}>{s.count} منتج</span>
      </div>
      {s.count === 0 ? (
        <div style={{ padding: '72px 0', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 20 }}>
          <p style={{ margin: 0, fontSize: 17, color: 'var(--muted)' }}>سلتك فارغة.</p>
          <Link className="btn btn-primary" to={shopPath('all')}>اكتشف المنتجات</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: L.cartCols, gap: L.pGap, alignItems: 'start' }}>
          <div>
            {s.items.map((l) => {
              const p = l.product;
              return (
                <div key={l.key} style={{ display: 'grid', gridTemplateColumns: L.lineCols, gap: 20, padding: '24px 0', borderTop: '1px solid var(--line)', alignItems: 'center' }}>
                  <Link to={productPath(p.id)} className="ph" aria-label={p.name} style={{ aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {l.image
                      ? <img src={l.image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <img src="/logo-mark.svg" alt="" style={{ width: '46%', opacity: 0.25 }} />}
                  </Link>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <span className="mono" style={{ fontSize: 10, letterSpacing: '.14em' }}>المرجع {l.sku}</span>
                        <span style={{ fontStretch: '115%', fontWeight: 600, textTransform: 'uppercase', fontSize: 15 }}>{p.name}</span>
                        {l.label && <span style={{ fontSize: 13.5 }}>{l.label}</span>}
                        <span style={{ fontSize: 13, color: 'var(--graphite)' }}>{fmt(l.unit)} للوحدة</span>
                      </div>
                      <span style={{ fontSize: 15, whiteSpace: 'nowrap' }}>{fmt(l.unit * l.qty)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <QtyStepper qty={l.qty} h={44} onDec={() => s.setQty(l.key, -1)} onInc={() => s.setQty(l.key, 1)} />
                      <button onClick={() => s.remove(l.key)} style={{ background: 'none', border: 0, borderBottom: '1px solid var(--faint)', padding: '2px 0', cursor: 'pointer', fontSize: 12.5, color: 'var(--muted)' }}>حذف</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <aside style={{ position: L.sticky, top: 110, background: '#fff', border: '1px solid var(--line)', padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span className="mono">ملخّص الطلب</span>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14.5 }}><span>المجموع الفرعي</span><span>{fmt(s.subtotal)}</span></div>
            {s.qtyDiscount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14.5 }}><span>{s.qtyLabel}</span><span>−{fmt(s.qtyDiscount)}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 16, borderTop: '1px solid var(--line)' }}>
              <span style={{ fontWeight: 600 }}>المجموع</span>
              <span style={{ fontStretch: '110%', fontSize: 24, fontWeight: 500 }}>{fmt(s.subtotal - s.qtyDiscount)}</span>
            </div>
            {s.nextTier && <span style={{ fontSize: 13, padding: '10px 12px', background: '#F2F2EF', borderRadius: 10, lineHeight: 1.5 }}>أضف {s.nextTier.productName ? `${s.nextTier.missing} × ${s.nextTier.productName}` : `${s.nextTier.missing} ${s.nextTier.missing > 1 ? 'منتجات' : 'منتجًا'}`} ووفّر <strong>{fmt(s.nextTier.amount)}</strong> على طلبك.</span>}
            <button className="btn btn-cta btn-tall" style={{ marginTop: 8 }} onClick={() => navigate(PATHS.checkout)}>إتمام الطلب</button>
            <span style={{ fontSize: 12.5, color: 'var(--graphite)', lineHeight: 1.5 }}>توصيل مجاني لجميع مدن المغرب · الدفع عند الاستلام</span>
          </aside>
        </div>
      )}
    </section>
  );
}

function CartLoading() {
  const L = useLayout();
  return (
    <section aria-busy="true" style={{ padding: `${L.pageTop} ${L.px} 0` }}>
      <p style={{ margin: 0, fontSize: 15, color: 'var(--muted)' }}>جارٍ تحميل السلة…</p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Commande                                                             */
/* ------------------------------------------------------------------ */

type Field = { name: keyof Address; label: string; ph: string; type?: string; autoComplete?: string; list?: string };
type Address = { name: string; phone: string; line1: string; city: string };
type Quote = {
  subtotalCents: number; discountCents: number; totalCents: number; couponCode: string | null;
  discountLabel?: string | null; couponSkipped?: string | null; nextTier?: { missing: number; amountCents: number; productName: string | null } | null;
};
type Confirmation = { number: string; totalCents: number };

// Formulaire court : nom, téléphone, adresse, ville. Paiement à la livraison uniquement.
const SHIP_FIELDS: Field[] = [
  { name: 'name', label: 'الاسم الكامل', ph: 'ياسمين بناني', autoComplete: 'name' },
  { name: 'phone', label: 'رقم الهاتف', ph: '06 12 34 56 78', type: 'tel', autoComplete: 'tel' },
  { name: 'line1', label: 'العنوان', ph: 'الحي، الشارع، رقم المنزل', autoComplete: 'street-address' },
  { name: 'city', label: 'المدينة', ph: 'الدار البيضاء', autoComplete: 'address-level2', list: 'gm-cities' },
];
const CITIES = ['الدار البيضاء', 'الرباط', 'مراكش', 'فاس', 'طنجة', 'أكادير', 'مكناس', 'وجدة', 'القنيطرة', 'تطوان', 'سلا', 'المحمدية', 'الجديدة', 'آسفي', 'تمارة', 'الناظور', 'بني ملال', 'العيون'];
const PAYMENT = 'CASH_ON_DELIVERY';
const EMPTY: Address = { name: '', phone: '', line1: '', city: '' };
const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function Checkout() {
  const L = useLayout();
  const s = useStore();
  const [addr, setAddr] = useState<Address>(EMPTY);
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState('');
  const [couponError, setCouponError] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Confirmation | null>(null);
  const [idemKey, setIdemKey] = useState(newKey);
  const { status } = useCatalog();

  useEffect(() => { window.scrollTo({ top: 0 }); }, [done]);
  // Pixel Meta : début de commande, une fois le panier chargé.
  const started = s.items.length > 0;
  useEffect(() => {
    if (started) track('InitiateCheckout', { content_ids: s.items.map((l) => l.product.id), num_items: s.count, value: s.subtotal, currency: 'MAD' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  const items = s.items.map((l) => ({ slug: l.product.id, variantId: l.variant?.id, quantity: l.qty }));
  const itemsKey = JSON.stringify(items);

  // Totaux calculés par le serveur (promotions, coupon) dès que les choix changent. La livraison est incluse dans le prix.
  useEffect(() => {
    if (!items.length || done) return;
    let live = true;
    api<{ data: Quote }>('/orders/quote', { method: 'POST', body: { items: JSON.parse(itemsKey), paymentMethod: PAYMENT, country: 'MA', couponCode: coupon || undefined } })
      .then((r) => { if (live) { setQuote(r.data); setError(''); } })
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError && e.code.startsWith('COUPON_')) { setCouponError(e.message); setCoupon(''); return; }
        setQuote(null);
        setError(e instanceof ApiError ? e.message : 'تعذّر الاتصال بالخادم، حاول بعد لحظات.');
      });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, coupon, done]);

  if (!done && status === 'loading' && s.cart.length) return <CartLoading />;
  if (!done && s.count === 0) {
    return (
      <section style={{ padding: `${L.pageTop} ${L.px} 0`, display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'flex-start' }}>
        <h1 className="display" style={{ lineHeight: 1, fontSize: L.h2 }}>الطلب</h1>
        <p style={{ margin: 0, fontSize: 17, color: 'var(--muted)' }}>سلتك فارغة.</p>
        <Link className="btn btn-primary" to={shopPath('all')}>اكتشف المنتجات</Link>
      </section>
    );
  }

  const discount = quote ? quote.discountCents / 100 : 0;
  const total = quote ? quote.totalCents / 100 : s.subtotal;

  const placeOrder = async () => {
    const [firstName, ...rest] = addr.name.trim().split(/\s+/);
    const lastName = rest.join(' ');
    setBusy(true); setError('');
    try {
      const r = await api<{ data: Confirmation }>('/orders', {
        method: 'POST', headers: { 'Idempotency-Key': idemKey },
        body: {
          items, paymentMethod: PAYMENT, couponCode: coupon || undefined,
          // Un seul champ « nom » : le premier mot sert de prénom, le reste de nom de famille.
          customer: { firstName, lastName: lastName || undefined, phone: addr.phone },
          address: { line1: addr.line1, city: addr.city, country: 'MA' },
        },
      });
      track('Purchase', { content_ids: s.items.map((l) => l.product.id), content_type: 'product', num_items: s.count, value: r.data.totalCents / 100, currency: 'MAD', order_id: r.data.number }, `order-${r.data.number}`);
      setDone(r.data); s.clear(); setIdemKey(newKey());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر الاتصال بالخادم، لم يتم تسجيل طلبك. حاول مرة أخرى.');
    } finally { setBusy(false); }
  };

  return (
    <section style={{ padding: `${L.pageTop} ${L.px} 0`, display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20 }}>
        <h1 className="display" style={{ lineHeight: 1, fontSize: L.h2 }}>الطلب</h1>
      </div>

      {done ? (
        <div data-reveal style={{ padding: '56px 0', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 20 }}>
          <img src="/logo-mark.svg" alt="" style={{ width: 88, height: 88 }} />
          <h2 className="display" style={{ fontSize: L.h3 }}>شكراً لك، تم تسجيل طلبك.</h2>
          <p style={{ margin: 0, maxWidth: 520, fontSize: 15.5, lineHeight: 1.65, color: 'var(--muted)' }}>
            رقم الطلب <strong style={{ color: 'var(--ink)' }}>{done.number}</strong> · {fmt(done.totalCents / 100)}.{' '}
            سيتصل بك فريقنا لتأكيده، وتدفع نقداً عند تسلّم الطرد.
          </p>
          <Link className="btn btn-primary" to={shopPath('all')}>متابعة التسوق</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: L.cartCols, gap: L.pGap, alignItems: 'start' }}>
          <form onSubmit={(e) => { e.preventDefault(); if (!busy && quote) placeOrder(); }} style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <span className="mono">معلومات التوصيل · المغرب</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {SHIP_FIELDS.map((f) => (
                <label key={f.name} className="field">
                  {f.label}
                  <input name={f.name} type={f.type ?? 'text'} required placeholder={f.ph} autoComplete={f.autoComplete} list={f.list}
                    value={addr[f.name]} onChange={(e) => setAddr((a) => ({ ...a, [f.name]: e.target.value }))}
                    {...(f.name === 'name' && { minLength: 2, maxLength: 80 })}
                    {...(f.name === 'line1' && { minLength: 3, maxLength: 160 })}
                    {...(f.name === 'phone' && { dir: 'ltr', inputMode: 'tel' as const, pattern: '\\+?[0-9 .\\-]{8,20}', title: 'مثال: 06 12 34 56 78' })} />
                </label>
              ))}
              <datalist id="gm-cities">{CITIES.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="mono">رمز التخفيض</span>
              <div style={{ display: 'flex', gap: 10 }}>
                <input value={couponInput} onChange={(e) => { setCouponInput(e.target.value); setCouponError(''); }} placeholder="BIENVENUE10" aria-label="رمز التخفيض"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setCouponError(''); setCoupon(couponInput.trim().toUpperCase()); } }}
                  style={{ flex: 1, minWidth: 0, height: 50, padding: '0 16px', border: '1px solid var(--line-strong)', background: '#fff', fontSize: 14.5, fontFamily: 'var(--mono)', textTransform: 'uppercase', direction: 'ltr', textAlign: 'start' }} />
                <button type="button" className="btn btn-outline" style={{ height: 50, padding: '0 22px' }}
                  onClick={() => { setCouponError(''); setCoupon(couponInput.trim().toUpperCase()); }}>تطبيق</button>
              </div>
              {couponError && <span role="alert" style={{ fontSize: 13, color: 'oklch(0.55 0.15 25)' }}>{couponError}</span>}
              {quote?.couponSkipped && <span style={{ fontSize: 13, color: 'var(--graphite)' }}>الرمز {quote.couponSkipped} غير قابل للجمع مع العرض: تم تطبيق «{quote.discountLabel}» لأنه أكثر فائدة لك.</span>}
              {quote?.couponCode && <span style={{ fontSize: 13, color: 'var(--graphite)' }}>تم تطبيق الرمز {quote.couponCode} · <button type="button" onClick={() => { setCoupon(''); setCouponInput(''); }} style={{ background: 'none', border: 0, padding: 0, textDecoration: 'underline', cursor: 'pointer', color: 'inherit', fontSize: 13 }}>إزالة</button></span>}
            </div>
            <span style={{ fontSize: 13, color: 'var(--graphite)', lineHeight: 1.5 }}>التوصيل مجاني لجميع مدن المغرب. الدفع نقداً عند الاستلام: سنتصل بك لتأكيد الطلب.</span>
            {error && (
              <div role="alert" style={{ padding: '14px 16px', border: '1px solid oklch(0.55 0.15 25)', color: 'oklch(0.45 0.15 25)', fontSize: 14, lineHeight: 1.5 }}>
                {error} <Link to={PATHS.cart} style={{ textDecoration: 'underline', color: 'inherit' }}>عرض السلة</Link>
              </div>
            )}
            <button type="submit" disabled={busy || !quote} className="btn btn-cta btn-tall" style={{ opacity: busy || !quote ? 0.5 : 1 }}>
              {busy ? 'جارٍ التسجيل…' : `تأكيد الطلب · ${fmt(total)}`}
            </button>
          </form>
          <aside style={{ position: L.sticky, top: 110, background: '#fff', border: '1px solid var(--line)', borderRadius: 18, padding: 26, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span className="mono">طلبك</span>
            {s.items.map((l) => (
              <div key={l.key} style={{ display: 'grid', gridTemplateColumns: '56px minmax(0,1fr) auto', gap: 14, alignItems: 'center' }}>
                <span className="ph" style={{ aspectRatio: '1', backgroundImage: l.image ? `url("${l.image}")` : 'repeating-linear-gradient(135deg,rgba(18,41,77,.05) 0 1px,transparent 1px 7px)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, textTransform: 'uppercase' }}>{l.product.name}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--graphite)' }}>{l.label ? l.label + ' · ' : ''}الكمية {l.qty}</span>
                </span>
                <span style={{ fontSize: 14 }}>{fmt(l.unit * l.qty)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}><span>المجموع الفرعي</span><span>{fmt(quote ? quote.subtotalCents / 100 : s.subtotal)}</span></div>
            {discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span>{quote?.discountLabel ?? `الرمز ${quote?.couponCode}`}</span><span>−{fmt(discount)}</span></div>}
            {quote?.nextTier && <span style={{ fontSize: 13, padding: '10px 12px', background: '#F2F2EF', borderRadius: 10, lineHeight: 1.5 }}>أضف {quote.nextTier.productName ? `${quote.nextTier.missing} × ${quote.nextTier.productName}` : `${quote.nextTier.missing} ${quote.nextTier.missing > 1 ? 'منتجات' : 'منتجًا'}`} ووفّر <strong>{fmt(quote.nextTier.amountCents / 100)}</strong> على طلبك.</span>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <span style={{ fontWeight: 600 }}>المجموع</span>
              <span style={{ fontStretch: '110%', fontSize: 22, fontWeight: 500 }}>{fmt(total)}</span>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
