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
  [PATHS.collections]: 'Catégories',
  [PATHS.cart]: 'Panier',
  [PATHS.checkout]: 'Commande',
  [PATHS.about]: 'À propos',
  [PATHS.contact]: 'Contact',
  [PATHS.faq]: 'Questions fréquentes',
  [PATHS.cgv]: 'Conditions générales de vente',
  [PATHS.privacy]: 'Confidentialité',
  [PATHS.account]: 'Mon compte',
  [PATHS.charte]: 'Charte graphique',
};

export default function App() {
  const L = useLayout();
  const { pathname } = useLocation();
  const { closeAll } = useStore();
  const { site, unlocked } = useCatalog();

  useReveal(pathname);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    closeAll();
    if (!pathname.startsWith('/produit/') && !pathname.startsWith(PATHS.admin)) {
      const t = pathname === '/' ? '' : TITLES[pathname] ?? (pathname.startsWith('/produits') ? 'Produits' : '');
      document.title = t ? `${t} — MaxiGadget` : 'MaxiGadget — Beauté, massage & bien-être';
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
