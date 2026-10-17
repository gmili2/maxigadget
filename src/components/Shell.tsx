import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCatalog } from '../catalog';
import { fmt } from '../data';
import { useLayout } from '../layout';
import { PATHS, productPath, shopPath } from '../routes';
import { useStore } from '../store';
import { ArrowIcon, BagIcon, CloseIcon, MenuIcon, SearchIcon, UserIcon } from './icons';

const NAV: { label: string; to: string; match: (path: string) => boolean }[] = [
  { label: 'الرئيسية', to: '/', match: (p) => p === '/' },
  { label: 'المنتجات', to: shopPath('all'), match: (p) => p.startsWith('/produits') && !p.endsWith('/nouveautes') && !p.endsWith('/packs') },
  { label: 'العروض', to: shopPath('pack'), match: (p) => p === '/produits/packs' },
  { label: 'جديدنا', to: shopPath('new'), match: (p) => p === '/produits/nouveautes' },
  { label: 'الأقسام', to: PATHS.collections, match: (p) => p === PATHS.collections },
  { label: 'اتصل بنا', to: PATHS.contact, match: (p) => p === PATHS.contact },
];

/** Logo MaxiGadget : flèche montante + étoile, et le nom (sauf `mark`). `size` = hauteur du symbole. */
export function Logo({ size, light, mark, tagline }: { size: number; light?: boolean; mark?: boolean; tagline?: boolean }) {
  const ink = light ? '#ffffff' : 'var(--ink)';
  return (
    <span dir="ltr" style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.16, lineHeight: 1 }}>
      <img src="/logo-mark.svg" alt={mark ? 'MaxiGadget' : ''} width={size} height={size} style={{ width: size, height: size, flex: 'none' }} />
      {!mark && (
        <span style={{ display: 'flex', flexDirection: 'column', gap: size * 0.08 }}>
          <span style={{ fontWeight: 800, fontSize: size * 0.42, letterSpacing: '-.01em', color: ink }}>
            MAXI<span style={{ background: light ? 'linear-gradient(120deg,#7fd8ff,#3cc6c9)' : 'var(--grad)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>GADGET</span>
          </span>
          {tagline && <span dir="rtl" style={{ fontWeight: 600, fontSize: Math.max(9, size * 0.2), color: light ? '#9fdfe4' : 'var(--accent)' }}>حلول عملية لحياتك اليومية</span>}
        </span>
      )}
    </span>
  );
}

export function TopBar() {
  const L = useLayout();
  return (
    <div style={{ background: 'var(--grad)', color: '#fff', padding: '10px 20px', display: 'flex', justifyContent: 'center', gap: 28, fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>
      <span>🚚 توصيل مجاني لجميع مدن المغرب</span>
      {L.desktop && (<><span>💵 الدفع عند الاستلام</span><span>✅ جودة مضمونة</span><span>📞 خدمة زبناء في الاستماع</span></>)}
    </div>
  );
}

function CartButton() {
  const { count, openDrawer } = useStore();
  return (
    <button className="icon-btn" onClick={openDrawer} aria-label={`السلة، ${count} منتج`}>
      <BagIcon />
      {count > 0 && <span className="badge-count">{count}</span>}
    </button>
  );
}

export function Header() {
  const L = useLayout();
  const { pathname } = useLocation();
  const { openSearch, openMenu } = useStore();
  const wrap: React.CSSProperties = {
    position: 'sticky', top: 0, zIndex: 40,
    background: 'rgba(245,248,251,.88)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
    borderBottom: '1px solid var(--line)',
  };
  if (L.mobile) {
    return (
      <header style={wrap}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', height: 64, padding: '0 10px' }}>
          <div style={{ display: 'flex' }}>
            <button className="icon-btn" onClick={openMenu} aria-label="القائمة"><MenuIcon /></button>
          </div>
          <Link to="/" aria-label="ماكسي غادجت — الرئيسية" style={{ display: 'flex' }}><Logo size={36} /></Link>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="icon-btn" onClick={openSearch} aria-label="بحث"><SearchIcon /></button>
            <CartButton />
          </div>
        </div>
      </header>
    );
  }
  return (
    <header style={wrap}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 32, height: 84, padding: `0 ${L.px}` }}>
        <nav style={{ display: 'flex', gap: 28, whiteSpace: 'nowrap' }} aria-label="التنقل الرئيسي">
          {NAV.map((n) => (
            <Link
              key={n.label}
              to={n.to}
              style={{
                borderBottom: `1px solid ${n.match(pathname) ? 'var(--ink)' : 'transparent'}`,
                padding: '6px 0', fontSize: 11.5, fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase',
                color: 'var(--ink)', transition: 'border-color .4s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderBottomColor = 'var(--ink)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderBottomColor = n.match(pathname) ? 'var(--ink)' : 'transparent')}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <Link to="/" aria-label="ماكسي غادجت — الرئيسية" style={{ display: 'flex' }}><Logo size={48} tagline /></Link>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
          <button className="icon-btn" onClick={openSearch} aria-label="بحث"><SearchIcon /></button>
          <Link className="icon-btn" to={PATHS.account} aria-label="حسابي"><UserIcon /></Link>
          <CartButton />
        </div>
      </div>
    </header>
  );
}

const FOOTER = [
  { t: 'المتجر', links: [['جميع المنتجات', shopPath('all')], ['العروض المجمّعة', shopPath('pack')], ['جديدنا', shopPath('new')], ['السلة', PATHS.cart]] },
  { t: 'ماكسي غادجت', links: [['من نحن', PATHS.about], ['اتصل بنا', PATHS.contact], ['الأسئلة الشائعة', PATHS.faq], ['حسابي', PATHS.account]] },
  { t: 'قانوني', links: [['الشروط العامة للبيع', PATHS.cgv], ['سياسة الخصوصية', PATHS.privacy], ['الهوية البصرية', PATHS.charte]] },
];

export function Footer() {
  const L = useLayout();
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  return (
    <footer style={{ background: 'var(--ink-2)', color: '#fff', padding: `${L.sec} ${L.px} 28px`, display: 'flex', flexDirection: 'column', gap: 56 }}>
      <div style={{ display: 'grid', gridTemplateColumns: L.footCols, gap: 40 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, gridColumn: L.footSpan }}>
          <Logo size={52} light tagline />
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: '#b7c6d9', maxWidth: 320 }}>
            {subscribed ? 'شكراً، تم تسجيلك: ستصلك العروض قريباً.' : 'توصّل بجديدنا وعروضنا الحصرية قبل الجميع.'}
          </p>
          {!subscribed && (
            <form
              onSubmit={(e) => { e.preventDefault(); if (/^\S+@\S+\.\S+$/.test(email)) setSubscribed(true); }}
              style={{ display: 'flex', maxWidth: 380, borderBottom: '1px solid rgba(255,255,255,.35)' }}
            >
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="بريدك الإلكتروني" aria-label="بريدك الإلكتروني"
                style={{ flex: 1, minWidth: 0, height: 48, background: 'transparent', border: 0, color: '#fff', fontSize: 15, outline: 'none' }}
              />
              <button type="submit" style={{ background: 'none', border: 0, color: '#fff', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, letterSpacing: '.16em', textTransform: 'uppercase' }}>اشترك</button>
            </form>
          )}
        </div>
        {FOOTER.map((g) => (
          <div key={g.t} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span className="mono" style={{ fontSize: 10.5, color: '#8fa2bb' }}>{g.t}</span>
            {g.links.map(([label, to]) => (
              <Link key={label} to={to} style={{ color: '#e3ebf3', fontSize: 14.5, padding: '2px 0' }}>{label}</Link>
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,.12)', fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: '#8fa2bb' }}>
        <span>© 2026 ماكسي غادجت — جميع الحقوق محفوظة</span>
        <span style={{ display: 'flex', gap: 20 }}><span>الدفع عند الاستلام · توصيل مجاني</span><Link to={PATHS.admin} style={{ color: '#8fa2bb' }}>الإدارة</Link></span>
      </div>
    </footer>
  );
}

function QtyStepper({ qty, onDec, onInc, h = 36 }: { qty: number; onDec: () => void; onInc: () => void; h?: number }) {
  const b: React.CSSProperties = { width: h - 2, height: h - 2, border: 0, background: 'none', cursor: 'pointer', fontSize: 16 };
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: h, border: '1px solid var(--line-strong)', borderRadius: 999, background: '#fff' }}>
      <button style={b} onClick={onDec} aria-label="إنقاص الكمية">−</button>
      <span style={{ minWidth: 16, textAlign: 'center', fontSize: 13.5 }}>{qty}</span>
      <button style={b} onClick={onInc} aria-label="زيادة الكمية">+</button>
    </div>
  );
}
export { QtyStepper };

export function Overlays() {
  const L = useLayout();
  const navigate = useNavigate();
  const s = useStore();
  const anyOverlay = s.drawer || s.search;

  // Recherche
  const [q, setQ] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (s.search) setTimeout(() => searchRef.current?.focus(), 250); }, [s.search]);
  const { products } = useCatalog();
  const query = q.trim().toLowerCase();
  const results = useMemo(
    () => (query
      ? products.filter((p) => `${p.name} ${p.col} ${p.kind} ${p.sku} ${p.swatches.map((x) => x.label).join(' ')}`.toLowerCase().includes(query))
      : products.slice(0, 4)),
    [query, products],
  );

  const go = (to: string) => { s.closeAll(); navigate(to); };

  return (
    <>
      <div
        onClick={s.closeAll}
        style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(18,41,77,.38)', opacity: anyOverlay ? 1 : 0, pointerEvents: anyOverlay ? 'auto' : 'none', transition: 'opacity .5s ease' }}
      />

      {/* Panier latéral */}
      <aside
        aria-label="السلة" aria-hidden={!s.drawer}
        style={{ position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 70, width: 'min(440px,100vw)', background: 'var(--ivory)', display: 'flex', flexDirection: 'column', transform: s.drawer ? 'translateX(0)' : 'translateX(-105%)', transition: 'transform .6s var(--ease)', boxShadow: '20px 0 60px rgba(0,0,0,.08)', visibility: s.drawer ? 'visible' : 'hidden', transitionProperty: 'transform, visibility' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--line)' }}>
          <span style={{ fontStretch: '125%', fontWeight: 600, textTransform: 'uppercase', fontSize: 15 }}>السلة · {s.count}</span>
          <button className="icon-btn" onClick={s.closeAll} aria-label="إغلاق"><CloseIcon /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
          {s.count === 0 && <p style={{ margin: '32px 0', fontSize: 15, color: 'var(--muted)' }}>سلتك فارغة.</p>}
          {s.items.map((l) => {
            const p = l.product;
            return (
              <div key={l.key} style={{ display: 'grid', gridTemplateColumns: '76px minmax(0,1fr)', gap: 16, padding: '20px 0', borderBottom: '1px solid var(--line)' }}>
                <button className="ph" onClick={() => go(productPath(p.id))} aria-label={p.name} style={{ aspectRatio: '1', border: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  {l.image
                    ? <img src={l.image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <img src="/logo-mark.svg" alt="" style={{ width: '46%', opacity: 0.25 }} />}
                </button>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, textTransform: 'uppercase' }}>{p.name}</span>
                      {l.label && <span style={{ fontSize: 12.5, color: 'var(--graphite)' }}>{l.label}</span>}
                    </span>
                    <span style={{ fontSize: 14, whiteSpace: 'nowrap' }}>{fmt(l.unit * l.qty)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <QtyStepper qty={l.qty} onDec={() => s.setQty(l.key, -1)} onInc={() => s.setQty(l.key, 1)} />
                    <button onClick={() => s.remove(l.key)} style={{ background: 'none', border: 0, borderBottom: '1px solid var(--faint)', padding: '1px 0', cursor: 'pointer', fontSize: 12, color: 'var(--muted)' }}>حذف</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: '20px 24px 24px', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 12, background: '#fff' }}>
          {s.qtyDiscount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span>{s.qtyLabel}</span><span>−{fmt(s.qtyDiscount)}</span></div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 14 }}>المجموع · التوصيل مجاني</span>
            <span style={{ fontStretch: '110%', fontSize: 20, fontWeight: 500 }}>{fmt(s.subtotal - s.qtyDiscount)}</span>
          </div>
          {s.nextTier && <span style={{ fontSize: 13, padding: '10px 12px', background: '#F2F2EF', borderRadius: 10, lineHeight: 1.5 }}>أضف {s.nextTier.missing} {s.nextTier.missing > 1 ? 'منتجات' : 'منتجًا'} ووفّر <strong>{fmt(s.nextTier.amount)}</strong> على طلبك.</span>}
          <button className="btn btn-cta" disabled={s.count === 0} onClick={() => go(PATHS.checkout)} style={{ opacity: s.count === 0 ? 0.4 : 1 }}>اطلب الآن</button>
          <button className="btn btn-outline" style={{ height: 50 }} onClick={() => go(PATHS.cart)}>عرض السلة</button>
        </div>
      </aside>

      {/* Menu mobile */}
      <div
        aria-hidden={!s.menu}
        style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'var(--ink-2)', color: '#fff', display: 'flex', flexDirection: 'column', padding: '12px 20px 32px', opacity: s.menu ? 1 : 0, pointerEvents: s.menu ? 'auto' : 'none', transition: 'opacity .45s ease', visibility: s.menu ? 'visible' : 'hidden' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 52 }}>
          <Logo size={34} light />
          <button className="icon-btn" onClick={s.closeAll} aria-label="إغلاق" style={{ background: 'transparent' }}><CloseIcon color="#fff" size={20} /></button>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', marginTop: 36 }}>
          {NAV.map((n) => (
            <button key={n.label} onClick={() => go(n.to)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 0', background: 'none', border: 0, borderBottom: '1px solid rgba(255,255,255,.12)', color: '#fff', cursor: 'pointer', fontStretch: '125%', fontWeight: 500, textTransform: 'uppercase', fontSize: 24, textAlign: 'start' }}>
              {n.label}<ArrowIcon color="#fff" />
            </button>
          ))}
        </nav>
        <div style={{ marginTop: 'auto', display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost-light" style={{ flex: 1, height: 52, padding: 0 }} onClick={() => go(PATHS.account)}>حسابي</button>
          <button className="btn btn-light" style={{ flex: 1, height: 52, padding: 0 }} onClick={() => go(PATHS.cart)}>السلة ({s.count})</button>
        </div>
      </div>

      {/* Recherche */}
      <div
        role="search" aria-hidden={!s.search}
        style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 75, background: 'var(--ivory)', borderBottom: '1px solid var(--line)', padding: `20px ${L.px} 28px`, transform: s.search ? 'translateY(0)' : 'translateY(-105%)', transition: 'transform .55s var(--ease)', visibility: s.search ? 'visible' : 'hidden', transitionProperty: 'transform, visibility' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, borderBottom: '1px solid var(--ink)', paddingBottom: 10 }}>
          <SearchIcon size={22} />
          <input
            ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) go(productPath(results[0].id)); }}
            placeholder="ابحث عن منتج: تدليك، وجه، إزالة الشعر…" aria-label="بحث"
            style={{ flex: 1, minWidth: 0, height: 48, border: 0, background: 'transparent', fontSize: L.searchFs, fontStretch: '110%', outline: 'none', color: 'var(--ink)' }}
          />
          <button className="icon-btn" onClick={s.closeAll} aria-label="إغلاق"><CloseIcon /></button>
        </div>
        <span className="mono" style={{ display: 'block', marginTop: 18, fontSize: 10.5, letterSpacing: '.14em' }}>
          {query ? `${results.length} نتيجة` : 'الأكثر بحثاً'}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
          {results.map((p) => (
            <button
              key={p.id} onClick={() => go(productPath(p.id))}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '14px 0', background: 'none', border: 0, borderBottom: '1px solid var(--line)', cursor: 'pointer', textAlign: 'start', transition: 'padding .3s' }}
              onMouseEnter={(e) => (e.currentTarget.style.paddingInlineStart = '8px')}
              onMouseLeave={(e) => (e.currentTarget.style.paddingInlineStart = '0')}
            >
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 15, fontWeight: 600, textTransform: 'uppercase' }}>{p.name}</span>
                <span style={{ fontSize: 12.5, color: 'var(--graphite)' }}>{p.kind}</span>
              </span>
              <span style={{ fontSize: 14 }}>{p.hasRange ? 'ابتداءً من ' : ''}{fmt(p.price)}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
