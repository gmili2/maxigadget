import { Link, useNavigate } from 'react-router-dom';
import { COLLECTIONS, badgeOf, fmt, stars, type Product } from '../data';
import { useCatalog } from '../catalog';
import { useLayout } from '../layout';
import { productPath, shopPath } from '../routes';
import { useTilt } from '../tilt';
import { useStore } from '../store';
import { ArrowIcon, BagIcon, HeartIcon } from './icons';

/** Visuel provisoire d'un produit sans photo : le symbole du logo, estompé. */
export function Dial({ size = '50%', dark }: { size?: string; dark?: boolean }) {
  return <img src="/logo-mark.svg" alt="" style={{ width: size, opacity: dark ? 0.35 : 0.22, filter: 'grayscale(.3)' }} />;
}

export function ProductCard({ p }: { p: Product }) {
  const navigate = useNavigate();
  const { add, favs, toggleFav } = useStore();
  const fav = favs.includes(p.id);
  const badge = p.inStock ? badgeOf(p) : 'نفد';
  const needsChoice = p.variants.length > 1;
  const tilt = useTilt<HTMLDivElement>();
  return (
    <article className="card" onClick={() => navigate(productPath(p.id))} style={{ display: 'flex', flexDirection: 'column', gap: 14, cursor: 'pointer', minWidth: 0 }}>
      <div ref={tilt} className="ph tilt" style={{ aspectRatio: '4/5', backgroundImage: 'none', overflow: 'hidden', borderRadius: 18, background: '#fff' }}>
        <div className="ph zoom-hover" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: p.image ? '#ffffff' : 'transparent' }}>
          {p.image
            ? <img src={p.image} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block', transition: 'transform .6s var(--ease)' }} onMouseEnter={(e) => { (e.currentTarget.style.transform = 'scale(1.06)'); }} onMouseLeave={(e) => { (e.currentTarget.style.transform = 'scale(1)'); }} />
            : <Dial />
          }
        </div>
        <span className="tilt-glare" />
        {p.brand && (
          <span style={{ position: 'absolute', top: 12, insetInlineStart: 12, padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(8px)', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink)', fontWeight: 600 }}>{p.brand}</span>
        )}
        {badge && !p.brand && (
          <span style={{ position: 'absolute', top: 12, insetInlineStart: 12, padding: '6px 10px', borderRadius: 999, background: p.old && p.inStock ? 'var(--promo)' : p.inStock ? 'var(--accent)' : '#fff', color: p.inStock ? '#fff' : 'var(--ink)', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>{badge}</span>
        )}
        {badge && p.brand && (
          <span style={{ position: 'absolute', top: 12, insetInlineEnd: 56, padding: '6px 10px', borderRadius: 999, background: p.old ? 'var(--promo)' : 'rgba(255,255,255,.9)', color: p.old ? '#fff' : 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>{badge}</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); toggleFav(p.id); }}
          aria-label={fav ? `إزالة ${p.name} من المفضلة` : `إضافة ${p.name} إلى المفضلة`} aria-pressed={fav}
          style={{ position: 'absolute', top: 8, insetInlineEnd: 8, width: 40, height: 40, borderRadius: '50%', border: 0, background: 'rgba(255,255,255,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <HeartIcon fill={fav ? '#e0435a' : 'none'} color={fav ? '#e0435a' : undefined} />
        </button>
        {p.inStock && p.purchasable && <button
          // Avec plusieurs déclinaisons, le choix (couleur, modèle…) se fait sur la fiche.
          onClick={(e) => { e.stopPropagation(); if (needsChoice) navigate(productPath(p.id)); else add(p.id, 1, p.variants[0]?.id); }}
          aria-label={needsChoice ? `اختيار خيارات ${p.name}` : `إضافة ${p.name} إلى السلة`}
          style={{ position: 'absolute', insetInlineEnd: 10, bottom: 10, width: 44, height: 44, borderRadius: '50%', border: 0, background: 'var(--gold)', boxShadow: '0 6px 16px rgba(245,184,46,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'transform .35s' }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.07)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'none')}
        >
          <BagIcon color="#0b1d3a" size={18} />
        </button>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="mono" style={{ fontSize: 10, letterSpacing: '.12em' }}>{p.kind}</span>
        <h3 style={{ margin: 0, fontWeight: 700, fontSize: 15, letterSpacing: '.01em', lineHeight: 1.35 }}>{p.name}</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10, fontSize: 15 }}>
          <span style={{ fontWeight: 800, fontSize: 17, color: p.old ? 'var(--promo)' : 'var(--ink)' }}>{p.hasRange ? 'ابتداءً من ' : ''}{fmt(p.price)}</span>
          {p.old && <span style={{ fontSize: 13, color: 'var(--graphite)', textDecoration: 'line-through' }}>{fmt(p.old)}</span>}
        </div>
        {p.swatches.length > 1 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} aria-label={`الألوان: ${p.swatches.map((s) => s.label).join('، ')}`}>
            {p.swatches.slice(0, 5).map((s) => (
              <span key={s.label} title={s.label} style={{ width: 12, height: 12, borderRadius: '50%', background: s.colorHex ?? '#fff', boxShadow: 'inset 0 0 0 1px rgba(18,41,77,.18)' }} />
            ))}
            {p.swatches.length > 5 && <span style={{ fontSize: 11.5, color: 'var(--graphite)' }}>+{p.swatches.length - 5}</span>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--graphite)' }}>
          {p.reviews > 0 ? <><span style={{ color: 'var(--gold-2)', letterSpacing: '.1em' }} aria-label={`التقييم ${p.rating} من 5`}>{stars(p.rating)}</span><span>({p.reviews})</span></> : <span>🚚 توصيل مجاني</span>}
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ items }: { items: Product[] }) {
  const L = useLayout();
  const { status, reload } = useCatalog();
  if (status === 'loading' && !items.length) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: L.g4, columnGap: L.gap, rowGap: L.rowGap }} aria-busy="true" aria-label="جارٍ تحميل المنتجات">
        {[0, 1, 2, 3].map((i) => <div key={i} className="ph" style={{ aspectRatio: '4/5', opacity: 0.6 }} />)}
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div style={{ padding: '40px 0', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
        <p style={{ margin: 0, fontSize: 15.5, color: 'var(--muted)' }}>الكتالوج غير متاح حالياً.</p>
        <button className="btn btn-outline" onClick={reload} style={{ height: 48, padding: '0 24px' }}>إعادة المحاولة</button>
      </div>
    );
  }
  return (
    <div data-reveal style={{ display: 'grid', gridTemplateColumns: L.g4, columnGap: L.gap, rowGap: L.rowGap }}>
      {items.map((p) => <ProductCard key={p.id} p={p} />)}
    </div>
  );
}

export function CollectionsGrid() {
  const L = useLayout();
  const { imageFor, hidden } = useCatalog();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: L.g3, gap: L.gap }}>
      {COLLECTIONS.filter((c) => !hidden(c.id)).map((c) => {
        const img = c.id === 'all' ? undefined : imageFor(c.id);
        return (
        <Link key={c.id} to={shopPath(c.id)} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="ph" style={{ width: '100%', aspectRatio: L.collRatio, backgroundImage: 'none', overflow: 'hidden', borderRadius: 18 }}>
            {img ? (
              <img className="zoom-hover" src={img} alt={c.label} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <>
                <div className="ph zoom-hover" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Dial size="28%" />
                </div>
                <span className="ph-caption" style={{ insetInlineStart: 14, bottom: 12, fontSize: 11 }}>صورة · {c.img}</span>
              </>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontWeight: 800, fontSize: L.cardT, textTransform: 'uppercase', letterSpacing: '.01em', color: 'var(--ink)' }}>{c.label}</span>
              {L.desktop && <span style={{ fontSize: 13.5, color: 'var(--graphite)' }}>{c.sub}</span>}
            </div>
            <span style={{ flex: 'none', width: 40, height: 40, borderRadius: '50%', border: '1px solid var(--line-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowIcon size={14} />
            </span>
          </div>
        </Link>
        );
      })}
    </div>
  );
}

export function Eyebrow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <span className="mono" style={style}>{children}</span>;
}

export function Crumbs({ items }: { items: [string, string?][] }) {
  return (
    <nav aria-label="مسار التصفح" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--graphite)' }}>
      {items.map(([label, to], i) => (
        <span key={label} style={{ display: 'flex', gap: 10 }}>
          {i > 0 && <span>/</span>}
          {to ? <Link to={to} style={{ color: 'var(--graphite)' }}>{label}</Link> : <span style={{ color: 'var(--ink)' }}>{label}</span>}
        </span>
      ))}
    </nav>
  );
}
