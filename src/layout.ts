import { useEffect, useState } from 'react';

/** Point de rupture de la maquette : sous 1100 px, la mise en page passe en mobile. */
const BREAKPOINT = 1100;

export function useLayout() {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  useEffect(() => {
    let raf = 0;
    const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setW(window.innerWidth)); };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, []);
  const m = w < BREAKPOINT;
  return {
    mobile: m,
    desktop: !m,
    px: m ? '20px' : 'clamp(32px,5vw,72px)',
    sec: m ? '72px' : '128px',
    pageTop: m ? '40px' : '72px',
    g4: m ? 'repeat(2,minmax(0,1fr))' : 'repeat(auto-fill,minmax(250px,1fr))',
    g3: m ? 'repeat(2,minmax(0,1fr))' : 'repeat(3,minmax(0,1fr))',
    g5: m ? 'repeat(2,minmax(0,1fr))' : 'repeat(6,minmax(0,1fr))',
    split: m ? 'minmax(0,1fr)' : 'minmax(0,1.1fr) minmax(0,1fr)',
    split2: m ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1.6fr)',
    cols3: m ? 'minmax(0,1fr)' : 'repeat(3,minmax(0,1fr))',
    cols4: m ? 'repeat(2,minmax(0,1fr))' : 'repeat(4,minmax(0,1fr))',
    cartCols: m ? 'minmax(0,1fr)' : 'minmax(0,1.7fr) minmax(300px,1fr)',
    lineCols: m ? '88px minmax(0,1fr)' : '120px minmax(0,1fr)',
    footCols: m ? 'repeat(2,minmax(0,1fr))' : 'minmax(0,1.6fr) repeat(3,minmax(0,1fr))',
    footSpan: m ? 'span 2' : 'auto',
    h1: m ? '34px' : 'clamp(44px,4.6vw,72px)',
    h2: m ? '30px' : 'clamp(34px,3.2vw,48px)',
    h3: m ? '26px' : '34px',
    quote: m ? '21px' : '30px',
    cardT: m ? '12.5px' : '15px',
    heroPad: m ? '48px' : '96px',
    heroGap: m ? '48px' : '64px',
    gap: m ? '12px' : '28px',
    rowGap: m ? '32px' : '56px',
    pGap: m ? '40px' : 'clamp(48px,6vw,96px)',
    collRatio: m ? '1/1' : '4/5',
    wideRatio: m ? '4/5' : '21/9',
    sticky: (m ? 'static' : 'sticky') as 'static' | 'sticky',
    boxPad: m ? '20px' : '36px',
    searchFs: m ? '18px' : '24px',
  };
}

export type Layout = ReturnType<typeof useLayout>;

/** Fait apparaître les éléments [data-reveal] au fur et à mesure du défilement. */
export function useReveal(key: string) {
  useEffect(() => {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }),
      // Seuil 0 : un bloc très haut (grille de nombreux produits) n'atteindrait jamais un pourcentage visible.
      { threshold: 0, rootMargin: '0px 0px -40px 0px' },
    );
    const scan = () => document.querySelectorAll('[data-reveal]:not(.in)').forEach((el) => io.observe(el));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, [key]);
}
