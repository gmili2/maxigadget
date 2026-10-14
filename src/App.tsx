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
import { initPixel, track } from './pixel';
import { PATHS } from './routes';
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
    if (!pathname.startsWith('/produit/') && !pathname.startsWith(PATHS.admin)) {
      const t = pathname === '/' ? '' : TITLES[pathname] ?? (pathname.startsWith('/produits') ? 'المنتجات' : '');
      document.title = t ? `${t} — ماكسي غادجت` : 'ماكسي غادجت — تجميل، تدليك وعناية';
    }
  }, [pathname, closeAll]);
  // Pixel Meta : une vue de page à chaque changement d'adresse (pas dans l'administration).
  useEffect(() => {
    if (!site?.pixelId || pathname.startsWith(PATHS.admin)) return;
    initPixel(site.pixelId);
    track('PageView');
  }, [pathname, site?.pixelId]);

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
