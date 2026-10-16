import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { useCatalog } from './catalog';
import { AccessGate } from './components/AccessGate';
import { Footer, Header, Overlays, TopBar } from './components/Shell';
import { useLayout, useReveal } from './layout';
import Admin from './pages/Admin';
import Cart, { Checkout } from './pages/Cart';
import { About, Account, Charte, Contact, Faq, Legal, NotFound } from './pages/Content';
import Home from './pages/Home';
import Product from './pages/Product';
import Shop, { Collections } from './pages/Shop';
import { flushPixel, initPixel, track } from './pixel';
import { PATHS } from './routes';
import { HOME_TITLE, SHOP_PITCH, setMeta } from './seo';
import { useStore } from './store';

const TITLES: Record<string, string> = {
  [PATHS.collections]: 'الأقسام',
  [PATHS.cart]: 'السلة',
  [PATHS.checkout]: 'الطلب',
  [PATHS.about]: 'من نحن',
  [PATHS.contact]: 'اتصل بنا',
  [PATHS.faq]: 'الأسئلة الشائعة',
  [PATHS.cgv]: 'الشروط العامة للبيع',
  [PATHS.privacy]: 'سياسة الخصوصية',
  [PATHS.account]: 'حسابي',
  [PATHS.charte]: 'الهوية البصرية',
};
/** Pages de la boutique : mêmes titres que l'API (backend/src/catalog/seo.controller.ts). */
const SHOP_TITLES: Record<string, string> = {
  '/produits': 'جميع المنتجات',
  '/produits/soin-visage': 'العناية بالوجه',
  '/produits/massage': 'التدليك',
  '/produits/corps-minceur': 'الجسم والتنحيف',
  '/produits/epilation-cheveux': 'إزالة الشعر والعناية بالشعر',
  '/produits/cosmetiques': 'مستحضرات التجميل',
  '/produits/packs': 'العروض المجمّعة',
  '/produits/nouveautes': 'الجديد',
};
/** Pages personnelles : jamais dans les résultats de recherche. */
const PRIVATE = [PATHS.cart, PATHS.checkout, PATHS.account, PATHS.charte];

export default function App() {
  const L = useLayout();
  const { pathname } = useLocation();
  const { closeAll } = useStore();
  const { site, unlocked } = useCatalog();

  useReveal(pathname);
  // Boutique en arabe (de droite à gauche) ; l'administration reste en français.
  const isAdmin = pathname.startsWith(PATHS.admin);
  useEffect(() => {
    document.documentElement.lang = isAdmin ? 'fr' : 'ar';
    document.documentElement.dir = isAdmin ? 'ltr' : 'rtl';
  }, [isAdmin]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    closeAll();
    // Fiche produit : balises posées par la page elle-même (nom, prix, description).
    if (pathname.startsWith('/produit/')) return;
    if (pathname.startsWith(PATHS.admin)) { setMeta({ title: 'Administration — MaxiGadget', path: pathname, noindex: true }); return; }
    if (pathname === '/') { setMeta({ title: HOME_TITLE, path: '/' }); return; }
    const shop = SHOP_TITLES[pathname];
    const t = shop ?? TITLES[pathname] ?? 'المنتجات';
    setMeta({
      title: `${t} — ماكسي غادجت`,
      description: shop ? `${shop} في المغرب — ماكسي غادجت. ${SHOP_PITCH}` : undefined,
      path: pathname,
      noindex: PRIVATE.includes(pathname) || (!shop && !TITLES[pathname]),
    });
  }, [pathname, closeAll]);
  // Pixel Meta : une vue de page à chaque changement d'adresse (pas dans l'administration).
  useEffect(() => {
    if (!site || pathname.startsWith(PATHS.admin)) return;
    if (site.pixelId) {
      initPixel(site.pixelId);
      track('PageView');
    }
    flushPixel();
  }, [pathname, site]);

  if (pathname.startsWith(PATHS.admin)) return <Admin />;
  // Boutique en accès privé : rien n'est affiché avant la saisie du code.
  if (!site) return <div style={{ minHeight: '100vh', background: 'var(--ivory)' }} />;
  if (site.private && !site.unlocked) return <AccessGate onUnlock={unlocked} />;

  const isHome = pathname === '/';
  const isProduct = pathname.startsWith('/produit/');
  const mainPb = isProduct && L.mobile ? '200px' : isHome ? '0px' : L.sec;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ivory)', overflowX: 'clip', position: 'relative' }}>
      <TopBar />
      <Header />
      <main style={{ paddingBottom: mainPb }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/produits" element={<Shop />} />
          <Route path="/produits/:cat" element={<Shop />} />
          <Route path="/produit/:id" element={<Product />} />
          <Route path={PATHS.collections} element={<Collections />} />
          <Route path={PATHS.cart} element={<Cart />} />
          <Route path={PATHS.checkout} element={<Checkout />} />
          <Route path={PATHS.about} element={<About />} />
          <Route path={PATHS.contact} element={<Contact />} />
          <Route path={PATHS.faq} element={<Faq />} />
          <Route path={PATHS.cgv} element={<Legal kind="cgv" />} />
          <Route path={PATHS.privacy} element={<Legal kind="privacy" />} />
          <Route path={PATHS.account} element={<Account />} />
          <Route path={PATHS.charte} element={<Charte />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
      <Overlays />
    </div>
  );
}
