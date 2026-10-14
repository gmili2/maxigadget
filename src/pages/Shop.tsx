import { useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CollectionsGrid, Crumbs, ProductGrid } from '../components/Catalog';
import { Pagination } from '../components/Pagination';
import { useCatalog } from '../catalog';
import { CATS, type CategoryId } from '../data';
import { useLayout } from '../layout';
import { catFromSlug, shopPath } from '../routes';

type Sort = 'pop' | 'new' | 'asc' | 'desc';
const PER_PAGE = 24;

export default function Shop() {
  const L = useLayout();
  const navigate = useNavigate();
  const cat = catFromSlug(useParams().cat);
  const [sort, setSort] = useState<Sort>('pop');
  const { products, status, hidden } = useCatalog();
  // Page dans l'adresse (?page=2) : lien partageable, bouton « retour » du navigateur.
  const [params, setParams] = useSearchParams();
  const listTop = useRef<HTMLElement>(null);

  const items = useMemo(() => {
    if (!cat) return [];
    // L'API renvoie déjà les produits par popularité (ventes).
    const l = cat === 'all' ? products.slice() : products.filter((p) => p.cats.includes(cat));
    if (sort === 'asc') l.sort((a, b) => a.price - b.price);
    if (sort === 'desc') l.sort((a, b) => b.price - a.price);
    if (sort === 'new') l.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
    return l;
  }, [cat, sort, products]);

  if (!cat || hidden(cat)) return <Navigate to={shopPath('all')} replace />;
  const [title, sub] = CATS[cat];
  const pages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number(params.get('page')) || 1));
  const shown = items.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const goTo = (n: number) => {
    setParams(n > 1 ? { page: String(n) } : {});
    listTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <section data-reveal style={{ padding: `${L.pageTop} ${L.px} 28px`, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Crumbs items={[['الرئيسية', '/'], ['المنتجات', cat === 'all' ? undefined : shopPath('all')], ...(cat === 'all' ? [] : [[title] as [string]])]} />
        <h1 className="display" style={{ lineHeight: 1, fontSize: L.h2 }}>{title}</h1>
        <p style={{ margin: 0, maxWidth: 520, color: 'var(--muted)', fontSize: 15, lineHeight: 1.6 }}>{sub}</p>
      </section>
      <section ref={listTop} style={{ padding: `0 ${L.px}`, display: 'flex', flexDirection: 'column', gap: 32, scrollMarginTop: 100 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '14px 0', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
          <div className="hscroll" style={{ display: 'flex', gap: 6, maxWidth: '100%', paddingBottom: 2 }}>
            {(Object.keys(CATS) as CategoryId[]).filter((id) => !hidden(id)).map((id) => (
              <button key={id} className={`chip${cat === id ? ' active' : ''}`} onClick={() => navigate(shopPath(id))}>
                {id === 'all' ? 'الكل' : CATS[id][0]}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13, color: 'var(--graphite)' }}>
            <span>{items.length > PER_PAGE ? `${(page - 1) * PER_PAGE + 1}–${Math.min(page * PER_PAGE, items.length)} من ` : ''}{items.length} منتج</span>
            <select
              value={sort} onChange={(e) => { setSort(e.target.value as Sort); setParams({}); }} aria-label="ترتيب حسب"
              style={{ height: 40, padding: '0 14px', border: '1px solid var(--line-strong)', borderRadius: 999, background: '#fff', color: 'var(--ink)', fontSize: 13, cursor: 'pointer' }}
            >
              <option value="pop">الأكثر شعبية</option>
              <option value="new">الأحدث</option>
              <option value="asc">السعر: من الأقل إلى الأعلى</option>
              <option value="desc">السعر: من الأعلى إلى الأقل</option>
            </select>
          </div>
        </div>
        {items.length || status !== 'ready' ? <ProductGrid items={shown} /> : <p>لا توجد منتجات في هذا القسم حالياً. <Link to={shopPath('all')}>عرض جميع المنتجات</Link></p>}
        <Pagination page={page} pages={pages} onChange={goTo} label="صفحات المنتجات" />
      </section>
    </>
  );
}

export function Collections() {
  const L = useLayout();
  return (
    <>
      <section data-reveal style={{ padding: `${L.pageTop} ${L.px} 8px`, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <span className="mono">تجميل، تدليك وعناية</span>
        <h1 className="display" style={{ lineHeight: 1, fontSize: L.h2 }}>الأقسام</h1>
      </section>
      <section data-reveal style={{ padding: `40px ${L.px} 0` }}>
        <CollectionsGrid />
      </section>
    </>
  );
}
