import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useCatalog } from '../catalog';
import { Crumbs, ProductGrid } from '../components/Catalog';
import { QtyStepper } from '../components/Shell';
import { BagIcon } from '../components/icons';
import { fmt, ratingF, stars, type Product as P, type Variant } from '../data';
import { useLayout } from '../layout';
import { track } from '../pixel';
import { PATHS, productPath, shopPath } from '../routes';
import { SHOP_PITCH, setMeta } from '../seo';
import { lineKey, useStore } from '../store';

const VIEWS = ['المنتج', 'تفاصيل', 'أثناء الاستعمال', 'محتوى العلبة'];
const reassure = (warranty: number) => [
  { i: '🚚', t: 'توصيل مجاني', d: 'من 24 إلى 72 ساعة لجميع مدن المغرب' },
  { i: '💵', t: 'الدفع عند الاستلام', d: 'نقداً عند تسلّم الطرد' },
  { i: '🛡️', t: 'الضمان', d: warranty ? `${warranty} أشهر` : 'استبدال عند وجود عيب' },
  { i: '↩️', t: 'الإرجاع', d: 'خلال 7 أيام' },
];
type Review = { id: string; author: string; rating: number; title: string | null; comment: string; createdAt: string };
const MONTH = new Intl.DateTimeFormat('ar-MA', { month: 'long', year: 'numeric' });
const pct = (price: number, old: number) => '\u2066−' + Math.round((1 - price / old) * 100) + '%\u2069'; // isolé en LTR : « −42% » et non « 42%- »

/** Valeurs choisies par défaut : la première déclinaison disponible. */
function defaultSelection(p: P): Record<string, string> {
  const v = p.variants.find((x) => x.inStock) ?? p.variants[0];
  return v ? Object.fromEntries((p.options ?? []).map((o, i) => [o.name, v.values[i]?.label ?? o.values[0].label])) : {};
}
const matches = (p: P, v: Variant, sel: Record<string, string>) => (p.options ?? []).every((o, i) => v.values[i]?.label === sel[o.name]);

export default function Product() {
  const L = useLayout();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const catalog = useCatalog();
  const p = catalog.find(id);
  const { add, cart, remove } = useStore();
  // Photo affichée : index choisi à la main, ou -1 = suivre la photo de la couleur sélectionnée.
  const [img, setImg] = useState(-1);
  const [zoom, setZoom] = useState(false);
  const [zxy, setZxy] = useState({ x: 50, y: 50 });
  const [qty, setQty] = useState(1);
  // Offre choisie (1, 2, 3 produits…) et variante des produits 2, 3… (le produit 1 suit la sélection principale).
  // ?offre=2 dans le lien (publicités) : l'offre de 2 produits est présélectionnée.
  const [params] = useSearchParams();
  const [packWanted, setPack] = useState(() => Number(params.get('offre')) || 1);
  const [extra, setExtra] = useState<string[]>([]);
  // Choix d'options, mémorisé par produit : changer de fiche repart des valeurs par défaut.
  const [choice, setChoice] = useState<{ id: string; sel: Record<string, string> }>({ id: '', sel: {} });
  const [reviews, setReviews] = useState<{ id: string; list: Review[] }>({ id: '', list: [] });

  useEffect(() => { setImg(-1); setZoom(false); setQty(1); setPack(Number(params.get('offre')) || 1); setExtra([]); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!p) return;
    const text = `${p.kind ? p.kind + '. ' : ''}${p.desc}`.replace(/\s+/g, ' ');
    setMeta({
      title: `${p.name} — ${fmt(p.price)} — ماكسي غادجت`,
      description: `${p.name} بـ ${fmt(p.price)}${p.hasRange ? ' فما فوق' : ''}. ${text} ${SHOP_PITCH}`.slice(0, 300),
      path: productPath(p.id),
    });
  }, [p]);
  useEffect(() => {
    if (p) track('ViewContent', { content_ids: [p.id], content_name: p.name, content_type: 'product', value: p.price, currency: 'MAD' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id]);
  useEffect(() => {
    let live = true;
    api<{ data: { reviews: Review[] } }>(`/products/${encodeURIComponent(id)}`)
      .then((r) => { if (live) setReviews({ id, list: r.data.reviews }); })
      .catch(() => { if (live) setReviews({ id, list: [] }); });
    return () => { live = false; };
  }, [id]);

  if (!p) {
    if (catalog.status === 'ready') return <Navigate to={shopPath('all')} replace />;
    return (
      <section style={{ padding: `${L.pageTop} ${L.px} 0`, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
        {catalog.status === 'error' ? (
          <>
            <p style={{ margin: 0, fontSize: 16, color: 'var(--muted)' }}>هذا المنتج غير متاح حالياً.</p>
            <button className="btn btn-outline" onClick={catalog.reload} style={{ height: 48, padding: '0 24px' }}>إعادة المحاولة</button>
          </>
        ) : <div className="ph" aria-busy="true" style={{ width: '100%', maxWidth: 620, aspectRatio: '1', opacity: 0.6 }} />}
      </section>
    );
  }

  const sel = choice.id === p.id ? choice.sel : defaultSelection(p);
  const choose = (name: string, label: string) => {
    let next = { ...sel, [name]: label };
    // Si la combinaison n'existe pas, on bascule sur la première déclinaison qui porte cette valeur.
    if (!p.variants.some((v) => matches(p, v, next))) {
      const i = (p.options ?? []).findIndex((o) => o.name === name);
      const alt = p.variants.find((v) => v.values[i]?.label === label && v.inStock) ?? p.variants.find((v) => v.values[i]?.label === label);
      if (alt) next = Object.fromEntries((p.options ?? []).map((o, k) => [o.name, alt.values[k].label]));
    }
    setChoice({ id: p.id, sel: next });
    setImg(-1); // la grande photo suit la nouvelle couleur
    setZoom(false);
  };
  const variant = p.variants.find((v) => matches(p, v, sel));
  /** Une valeur est disponible si, combinée aux autres choix actuels, elle donne une déclinaison en stock. */
  const available = (name: string, label: string) => p.variants.some((v) => v.inStock && matches(p, v, { ...sel, [name]: label }));
  const price = variant?.price ?? p.price;
  const old = variant ? variant.old : p.old;
  const canBuy = p.purchasable && (p.variants.length ? !!variant?.inStock : p.inStock);
  const stockText = !p.purchasable ? 'منتج للعرض فقط' : !p.variants.length ? p.stock : !variant ? 'هذا الاختيار غير متوفر' : !variant.inStock ? 'نفد هذا الاختيار' : variant.lowStock ? 'آخر القطع المتوفرة' : 'متوفر — يُرسَل خلال 24 ساعة';
  const photos = p.photos.length ? p.photos : p.image ? [p.image] : [];
  // Galerie : les photos puis les vidéos ; `img` désigne un élément de cette suite.
  const gallery = [...photos.map((src) => ({ src, video: false })), ...p.videos.map((src) => ({ src, video: true }))];
  const variantPhoto = variant?.imageUrl ? photos.indexOf(variant.imageUrl) : -1;
  const shown = img >= 0 ? Math.min(img, gallery.length - 1) : Math.max(0, variantPhoto);
  const mainVideo = gallery[shown]?.video ? gallery[shown].src : null;
  const mainPhoto = variant?.imageUrl && img < 0 && variantPhoto < 0 ? variant.imageUrl : photos[shown];
  const ref = variant?.sku ?? p.sku;
  const buy = () => { if (canBuy) addPack(); };
  /* ---------- offres par quantité (« 2 pour 229 DH ») ---------- */
  // Paliers de ce produit, sinon paliers généraux (même règle que le serveur, produit seul dans le panier).
  const tiers = p.qtyTiers.length ? p.qtyTiers : catalog.qtyTiers;
  const offers = p.purchasable && tiers.length ? [...new Set([1, ...tiers.map((t) => t.minQty)])].sort((a, b) => a - b).slice(0, 5) : [];
  const pack = offers.includes(packWanted) ? packWanted : 1;
  const inStockVariants = p.variants.filter((v) => v.inStock);
  const unitVariants = (n: number) => Array.from({ length: n }, (_, i) => (i === 0 ? variant : p.variants.find((v) => v.id === extra[i - 1]) ?? variant));
  const packPrice = (n: number) => {
    const sum = unitVariants(n).reduce((a, v) => a + (v?.price ?? p.price), 0);
    const t = tiers.filter((x) => x.minQty <= n).sort((a, b) => b.minQty - a.minQty)[0];
    return { sum, total: sum - (t ? Math.min(t.amount, sum) : 0) };
  };
  const units = offers.length ? pack : qty;
  const { sum: packSum, total: packTotal } = offers.length ? packPrice(pack) : { sum: price * qty, total: price * qty };
  /** Ajoute l'offre au panier : une ligne par coloris (« Full black × 2 »). */
  const addPack = () => {
    if (!offers.length) return add(p.id, qty, variant?.id);
    const counts = new Map<string | undefined, number>();
    for (const v of unitVariants(pack)) counts.set(v?.id, (counts.get(v?.id) ?? 0) + 1);
    for (const [vid, n] of counts) add(p.id, n, vid);
  };
  /** Achat direct (publicités) : le panier reçoit exactement l'offre choisie pour ce produit, puis le formulaire de commande. */
  const buyNow = () => {
    if (!canBuy) return;
    for (const l of cart.filter((x) => x.id === p.id)) remove(lineKey(l.id, l.variantId));
    addPack();
    navigate(PATHS.checkout);
  };

  const pos = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };
  const similar = catalog.products.filter((x) => x.id !== p.id && x.cats.some((c) => p.cats.includes(c) && c !== 'new')).slice(0, 4);
  const specs: [string, string][] = [
    ...p.specs, ...(p.warranty ? [['الضمان', `${p.warranty} أشهر`] as [string, string]] : []), ['التوصيل', 'مجاني لجميع مدن المغرب'], ['المرجع', ref],
  ];
  const shownReviews = reviews.id === p.id ? reviews.list : [];
  const label: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--graphite)' };

  return (
    <>
      <section style={{ padding: `24px ${L.px} 0` }}>
        <Crumbs items={[['الرئيسية', '/'], ['المنتجات', shopPath('all')], [p.name]]} />
        <div style={{ display: 'grid', gridTemplateColumns: L.split, gap: L.pGap, marginTop: 24, alignItems: 'start' }}>
          <div data-reveal style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mainVideo ? (
              <div className="ph" style={{ aspectRatio: '4/5', borderRadius: 22, backgroundImage: 'none', background: '#111', overflow: 'hidden' }}>
                <video key={mainVideo} src={mainVideo} controls autoPlay muted loop playsInline preload="metadata"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#111' }} />
              </div>
            ) : (
            <div
              role="button" tabIndex={0} aria-label={zoom ? 'تصغير' : 'تكبير الصورة'}
              onClick={(e) => { setZxy(pos(e)); setZoom((z) => !z); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setZoom((z) => !z); } }}
              onMouseMove={(e) => zoom && setZxy(pos(e))}
              onMouseLeave={() => zoom && setZoom(false)}
              className="ph" style={{ aspectRatio: '4/5', borderRadius: 22, backgroundImage: 'none', cursor: zoom ? 'zoom-out' : 'zoom-in', background: mainPhoto ? '#ffffff' : 'transparent' }}
            >
              <div className="ph" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: zoom ? 'scale(2.2)' : 'scale(1)', transformOrigin: `${zxy.x}% ${zxy.y}%`, transition: 'transform .6s var(--ease)' }}>
                {mainPhoto
                  ? <img src={mainPhoto} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }} />
                  : <img src="/logo-mark.svg" alt="" style={{ width: '36%', opacity: 0.22 }} />
                }
              </div>
              {!photos.length && <span className="ph-caption">صورة · {p.name}{variant ? ' ' + variant.values.map((v) => v.label).join(' · ') : ''} — {photos.length ? `${shown + 1} / ${gallery.length}` : VIEWS[Math.max(0, img)]}</span>}
              <span style={{ position: 'absolute', insetInlineEnd: 14, top: 14, padding: '7px 12px', borderRadius: 999, background: 'rgba(255,255,255,.9)', fontSize: 11.5 }}>
                {zoom ? 'تكبير × 2.2' : 'انقر للتكبير'}
              </span>
            </div>
            )}
            {gallery.length > 1 ? (
              // Toutes les vignettes, sur plusieurs lignes si besoin (6 par ligne).
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(gallery.length, 6)},minmax(0,1fr))`, gap: 10 }}>
                {gallery.map(({ src, video }, i) => (
                  <button key={src} className="ph" onClick={() => { setImg(i); setZoom(false); }} aria-label={video ? `فيديو ${i - photos.length + 1}` : `صورة ${i + 1}`} aria-pressed={i === shown}
                    style={{ aspectRatio: '1', padding: 0, cursor: 'pointer', backgroundImage: 'none', background: video ? '#111' : '#ffffff', border: `1px solid ${i === shown ? 'var(--ink)' : 'transparent'}`, overflow: 'hidden', position: 'relative' }}>
                    {video
                      ? <>
                          {/* #t=0.1 : première image de la vidéo comme vignette. */}
                          <video src={`${src}#t=0.1`} muted playsInline preload="metadata" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                          <span aria-hidden style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: '10px solid #111', marginLeft: 3 }} />
                          </span>
                        </>
                      : <img src={src} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </button>
                ))}
              </div>
            ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10 }}>
              {VIEWS.map((v, i) => (
                <button
                  key={v} className="ph" onClick={() => { setImg(i); setZoom(false); }} aria-label={`عرض ${v}`} aria-pressed={i === shown}
                  style={{ aspectRatio: '1', padding: 0, cursor: 'pointer', backgroundImage: p.image ? 'none' : 'repeating-linear-gradient(135deg,rgba(18,41,77,.045) 0 1px,transparent 1px 9px)', background: p.image && i === 0 ? '#ffffff' : undefined, border: `1px solid ${i === shown ? 'var(--ink)' : 'transparent'}`, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start', overflow: 'hidden', position: 'relative' }}
                >
                  {p.image && i === 0 && <img src={p.image} alt={v} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />}
                  <span style={{ position: 'relative', zIndex: 1, padding: 8, fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: p.image ? 'rgba(18,41,77,.7)' : 'var(--graphite)', textAlign: 'start' }}>{v}</span>
                </button>
              ))}
            </div>
            )}
          </div>

          <div data-reveal style={{ position: L.sticky, top: 110, display: 'flex', flexDirection: 'column', gap: 22, paddingTop: 6 }}>
            <span className="mono" style={{ fontSize: 10.5 }}>{p.kind} · المرجع {ref}</span>
            <h1 className="display" style={{ margin: '-8px 0 0', fontSize: L.h2 }}>{p.name}</h1>
            {p.reviews > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <span style={{ letterSpacing: '.12em', color: 'var(--gold-2)' }}>{stars(p.rating)}</span><span>{ratingF(p.rating)}</span>
                <span style={{ color: 'var(--graphite)' }}>· {p.reviews} تقييم</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 14, padding: '18px 0', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
              <span style={{ fontSize: 32, fontWeight: 800, color: old ? 'var(--promo)' : 'var(--ink)' }}>{fmt(price)}</span>
              {old && (
                <>
                  <span style={{ fontSize: 16, color: 'var(--graphite)', textDecoration: 'line-through' }}>{fmt(old)}</span>
                  <span style={{ padding: '5px 10px', borderRadius: 999, background: 'var(--promo)', color: '#fff', fontSize: 12, fontWeight: 800 }}>{pct(price, old)}</span>
                </>
              )}
              <span style={{ flexBasis: '100%', fontSize: 12.5, color: 'var(--graphite)' }}>شامل الضرائب · توصيل مجاني · الدفع عند الاستلام</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: canBuy ? '#1fae6b' : 'var(--faint)', boxShadow: '0 0 0 4px var(--line)' }} />{stockText}
            </div>
            <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.7, color: 'var(--body)', textWrap: 'pretty' }}>{p.desc}</p>
            {p.features.length > 0 && (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9 }}>
                {p.features.map((f) => (
                  <li key={f} style={{ display: 'flex', gap: 10, fontSize: 15, lineHeight: 1.5 }}>
                    <span style={{ flex: 'none', width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>✓</span>{f}
                  </li>
                ))}
              </ul>
            )}
            {(p.options ?? []).map((o) => {
              const isColor = o.values.some((v) => v.colorHex);
              return (
                <div key={o.name} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, ...label, color: 'var(--ink)' }}>
                    <span style={{ color: 'var(--graphite)' }}>{o.name}</span><span style={{ textAlign: 'end' }}>{sel[o.name]}</span>
                  </div>
                  <div role="radiogroup" aria-label={o.name} style={{ display: 'flex', flexWrap: 'wrap', gap: isColor ? 12 : 8 }}>
                    {o.values.map((v) => {
                      const on = sel[o.name] === v.label;
                      const ok = available(o.name, v.label);
                      const title = v.label + (ok ? '' : ' — نفد');
                      return isColor ? (
                        <button key={v.label} role="radio" aria-checked={on} aria-label={title} title={title} onClick={() => choose(o.name, v.label)}
                          style={{ position: 'relative', width: 40, height: 40, borderRadius: '50%', padding: 0, cursor: 'pointer', background: v.colorHex ?? '#fff', border: 0, boxShadow: on ? '0 0 0 2px var(--ivory), 0 0 0 3px var(--ink)' : 'inset 0 0 0 1px rgba(18,41,77,.18)', opacity: ok ? 1 : 0.45, transition: 'box-shadow .25s' }}>
                          {!ok && <span aria-hidden style={{ position: 'absolute', left: '50%', top: 4, bottom: 4, width: 1, background: 'var(--ink)', transform: 'rotate(45deg)' }} />}
                        </button>
                      ) : (
                        <button key={v.label} role="radio" aria-checked={on} title={title} className={`chip${on ? ' active' : ''}`} onClick={() => choose(o.name, v.label)}
                          style={{ height: 44, padding: '0 18px', fontSize: 13, ...(!ok && !on && { color: 'var(--faint)', textDecoration: 'line-through' }) }}>{v.label}</button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {offers.length > 0 && canBuy && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ ...label, color: 'var(--graphite)' }}>اختر العرض</span>
                <div role="radiogroup" aria-label="العرض" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {offers.map((n) => {
                    const { sum, total } = packPrice(n);
                    const on = pack === n;
                    return (
                      <button key={n} role="radio" aria-checked={on} onClick={() => setPack(n)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, cursor: 'pointer', textAlign: 'start', background: on ? '#fff' : 'transparent', border: `1.5px solid ${on ? 'var(--ink)' : 'var(--line-strong)'}`, transition: 'border-color .2s' }}>
                        <span aria-hidden style={{ width: 18, height: 18, borderRadius: '50%', flex: 'none', border: `1.5px solid ${on ? 'var(--ink)' : 'var(--line-strong)'}`, boxShadow: on ? 'inset 0 0 0 4px #fff' : 'none', background: on ? 'var(--ink)' : 'transparent' }} />
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                          <span style={{ fontSize: 15, fontWeight: 600 }}>{n === 1 ? 'قطعة واحدة' : n === 2 ? 'قطعتان' : `${n} قطع`}</span>
                          {total < sum && <span style={{ fontSize: 12.5, color: 'var(--graphite)' }}>وفّر {fmt(sum - total)}</span>}
                        </span>
                        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                          <span style={{ fontSize: 16, fontWeight: 600 }}>{fmt(total)}</span>
                          {total < sum && <span style={{ fontSize: 12.5, color: 'var(--graphite)', textDecoration: 'line-through' }}>{fmt(sum)}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {pack > 1 && p.variants.length > 1 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', background: '#fff', border: '1px solid var(--line)', borderRadius: 14 }}>
                    <span style={{ ...label, color: 'var(--graphite)' }}>اختر لون كل قطعة</span>
                    {unitVariants(pack).map((uv, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13.5, minWidth: 74 }}>القطعة {i + 1}</span>
                        {i === 0 ? (
                          <span style={{ fontSize: 13.5, color: 'var(--graphite)' }}>{uv?.values.map((x) => x.label).join(' · ')} <span style={{ fontSize: 12 }}>(المختار أعلاه)</span></span>
                        ) : (
                          <span role="radiogroup" aria-label={`لون القطعة ${i + 1}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {inStockVariants.map((v) => {
                              const on = uv?.id === v.id;
                              const hex = v.values.find((x) => x.colorHex)?.colorHex;
                              const name = v.values.map((x) => x.label).join(' · ');
                              const pick = () => setExtra((xs) => { const next = [...xs]; next[i - 1] = v.id; return next; });
                              return hex ? (
                                <button key={v.id} role="radio" aria-checked={on} aria-label={name} title={name} onClick={pick}
                                  style={{ width: 32, height: 32, borderRadius: '50%', padding: 0, cursor: 'pointer', background: hex, border: 0, boxShadow: on ? '0 0 0 2px var(--ivory), 0 0 0 3px var(--ink)' : 'inset 0 0 0 1px rgba(17,17,17,.18)' }} />
                              ) : (
                                <button key={v.id} role="radio" aria-checked={on} className={`chip${on ? ' active' : ''}`} onClick={pick} style={{ height: 36, padding: '0 14px', fontSize: 12.5 }}>{name}</button>
                              );
                            })}
                          </span>
                        )}
                        {i > 0 && <span style={{ fontSize: 12.5, color: 'var(--graphite)' }}>{uv?.values.map((x) => x.label).join(' · ')}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {!offers.length && <QtyStepper qty={qty} h={56} onDec={() => setQty((q) => Math.max(1, q - 1))} onInc={() => setQty((q) => q + 1)} />}
              <button className="btn btn-outline btn-tall" disabled={!canBuy} style={{ flex: 1, minWidth: 200, opacity: canBuy ? 1 : 0.4 }} onClick={buy}>{canBuy ? 'أضف إلى السلة' : p.purchasable ? 'نفد المخزون' : 'غير متاح للبيع'}</button>
            </div>
            {canBuy && (
              <button className="btn btn-cta btn-tall" onClick={buyNow}>
                🛒 اطلب الآن · {fmt(packTotal)}{packTotal < packSum ? <span style={{ marginInlineStart: 8, textDecoration: 'line-through', opacity: 0.6 }}>{fmt(packSum)}</span> : null}
              </button>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
              {reassure(p.warranty).map((r) => (
                <div key={r.t} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 14px', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, fontSize: 13 }}>
                  <span aria-hidden style={{ fontSize: 18 }}>{r.i}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><strong style={{ fontWeight: 700 }}>{r.t}</strong><span style={{ color: 'var(--graphite)', fontSize: 12 }}>{r.d}</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section data-reveal style={{ padding: `${L.sec} ${L.px} 0`, display: 'grid', gridTemplateColumns: L.split2, gap: L.pGap }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span className="mono">بطاقة المنتج</span>
          <h2 className="display" style={{ fontSize: L.h3 }}>المواصفات</h2>
        </div>
        <dl style={{ margin: 0 }}>
          {specs.map(([k, v]) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,0.8fr) minmax(0,2fr)', gap: 20, padding: '18px 0', borderTop: '1px solid var(--line)' }}>
              <dt style={{ ...label, paddingTop: 2 }}>{k}</dt>
              <dd style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section data-reveal style={{ padding: `${L.sec} ${L.px} 0`, display: 'grid', gridTemplateColumns: L.split2, gap: L.pGap }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
          <span className="mono">آراء الزبناء</span>
          <span style={{ fontSize: 64, fontWeight: 800, lineHeight: 1 }}>{p.reviews ? ratingF(p.rating) : '—'}</span>
          <span style={{ letterSpacing: '.14em', color: 'var(--gold-2)' }}>{stars(p.rating)}</span>
          <span style={{ fontSize: 13.5, color: 'var(--graphite)' }}>{p.reviews ? `بناءً على ${p.reviews} تقييم موثّق` : 'كن أول من يقيّم هذا المنتج'}</span>
          <button className="btn btn-outline" style={{ marginTop: 8, height: 48, padding: '0 24px', fontSize: 11.5 }}>اكتب تقييماً</button>
        </div>
        <div>
          {!shownReviews.length && <p style={{ margin: 0, padding: '24px 0', borderTop: '1px solid var(--line)', fontSize: 15, color: 'var(--muted)' }}>لا توجد تقييمات حالياً.</p>}
          {shownReviews.map((rv) => (
            <article key={rv.id} style={{ padding: '24px 0', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ letterSpacing: '.12em', fontSize: 13 }} aria-label={`التقييم ${rv.rating} من 5`}>{stars(rv.rating)}</span>
                <span style={{ ...label, letterSpacing: '.12em' }}>{rv.author} · {MONTH.format(new Date(rv.createdAt))} · شراء موثّق</span>
              </div>
              {rv.title && <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{rv.title}</h3>}
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: 'var(--body)' }}>{rv.comment}</p>
            </article>
          ))}
        </div>
      </section>

      {similar.length > 0 && (
        <section style={{ padding: `${L.sec} ${L.px} 0`, display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div data-reveal style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span className="mono">قد يعجبك أيضاً</span>
            <h2 className="display" style={{ fontSize: L.h3 }}>منتجات مشابهة</h2>
          </div>
          <ProductGrid items={similar} />
        </section>
      )}

      {L.mobile && (
        // Barre d'achat mobile : prix et variante, ajout au panier (icône) et achat direct vers le formulaire de commande.
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 45, background: 'rgba(245,248,251,.96)', backdropFilter: 'blur(12px)', borderTop: '1px solid var(--line)', padding: '10px 16px calc(10px + env(safe-area-inset-bottom))', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 'none', maxWidth: '34%' }}>
            <span style={{ fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt(packTotal)}</span>
            {packTotal < packSum
              ? <span style={{ fontSize: 12, color: 'var(--graphite)', textDecoration: 'line-through' }}>{fmt(packSum)}</span>
              : old != null && old > price && units === 1 && <span style={{ fontSize: 12, color: 'var(--graphite)', textDecoration: 'line-through' }}>{fmt(old)}</span>}
            <span style={{ fontSize: 12, color: 'var(--graphite)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {units > 1 ? (units === 2 ? 'قطعتان' : `${units} قطع`) : variant && (p.options ?? []).length > 0 ? variant.values.map((v) => v.label).join(' · ') : ''}
            </span>
          </div>
          {canBuy ? (
            <>
              <button className="btn btn-outline" onClick={buy} aria-label="أضف إلى السلة" style={{ marginInlineStart: 'auto', flex: 'none', width: 50, height: 50, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BagIcon size={20} />
              </button>
              <button className="btn btn-cta" onClick={buyNow} style={{ flex: 1, minWidth: 0, height: 50, padding: '0 12px', fontSize: 14, whiteSpace: 'nowrap' }}>اطلب الآن</button>
            </>
          ) : (
            <button className="btn btn-cta" disabled style={{ marginInlineStart: 'auto', flex: 1, height: 50, fontSize: 14, opacity: 0.4 }}>{p.purchasable ? 'نفد' : 'غير متاح'}</button>
          )}
        </div>
      )}
    </>
  );
}
