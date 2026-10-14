import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CollectionsGrid, ProductGrid } from '../components/Catalog';
import { ArrowIcon } from '../components/icons';
import { Logo } from '../components/Shell';
import { useCatalog } from '../catalog';
import { PILLARS, fmt, type Product } from '../data';
import { useLayout, type Layout } from '../layout';
import { PATHS, productPath, shopPath } from '../routes';
import { useTilt } from '../tilt';

/** Bandeau de réassurance, repris des visuels publicitaires. */
const TRUST = [
  { i: '🛡️', t: 'Qualité garantie', d: 'Produits testés avant l’envoi' },
  { i: '🚚', t: 'Livraison gratuite', d: 'Partout au Maroc, 24 à 72 h' },
  { i: '💵', t: 'Paiement à la livraison', d: 'Vous payez à la réception' },
  { i: '🎧', t: 'Service client', d: 'À votre écoute 7 j / 7' },
];

const STEPS = [
  { n: '1', t: 'Choisissez', d: 'Parcourez nos appareils de beauté, de massage et nos packs.' },
  { n: '2', t: 'Commandez en 1 minute', d: 'Nom, téléphone et ville : c’est tout. Nous vous appelons pour confirmer.' },
  { n: '3', t: 'Payez à la réception', d: 'Le livreur vous remet le colis, vous payez en espèces.' },
];

/** Tampon de prix façon affiche : ancien prix barré + nouveau prix. */
function PriceStamp({ p, big }: { p: Product; big?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, background: 'var(--promo)', color: '#fff', padding: big ? '12px 22px 14px' : '8px 14px 10px', borderRadius: 14, transform: 'rotate(-3deg)', boxShadow: '0 12px 30px rgba(214,40,60,.35)' }}>
      {p.old && <span style={{ fontSize: big ? 16 : 12, fontWeight: 700, textDecoration: 'line-through', opacity: 0.85 }}>{fmt(p.old)}</span>}
      <span style={{ fontSize: big ? 40 : 24, fontWeight: 800, lineHeight: 1 }}>{p.hasRange ? 'dès ' : ''}{fmt(p.price)}</span>
    </span>
  );
}

function Hero({ L }: { L: Layout }) {
  const navigate = useNavigate();
  // Produit mis en avant : un pack commandable avec photo, sinon le premier produit avec photo.
  const { products } = useCatalog();
  const hero = products.find((p) => p.purchasable && p.image && p.cats.includes('pack')) ?? products.find((p) => p.purchasable && p.image) ?? products[0];
  const tilt = useTilt<HTMLButtonElement>(7);
  return (
    <section style={{ background: 'radial-gradient(120% 90% at 85% 10%, #1e7fb0 0%, #12294d 55%, #0b1d3a 100%)', color: '#fff', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: L.split, gap: L.heroGap, alignItems: 'center', padding: `${L.heroPad} ${L.px}` }}>
        <div data-reveal style={{ display: 'flex', flexDirection: 'column', gap: 26, maxWidth: 600 }}>
          <span style={{ alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 999, background: 'rgba(245,184,46,.16)', color: 'var(--gold)', fontSize: 11.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase' }}>
            ✦ Beauté · Massage · Bien-être
          </span>
          <h1 className="display" style={{ fontSize: L.h1, lineHeight: 1 }}>
            Prenez soin de vous, <span style={{ color: 'var(--gold)' }}>à la maison.</span>
          </h1>
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: '#d3deea', maxWidth: 460, textWrap: 'pretty' }}>
            Appareils de soin du visage, pistolets de massage, épilateurs et packs malins. Testés, livrés gratuitement, payés à la réception.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
            <Link className="btn btn-cta" to={shopPath('all')}>Découvrir les produits<ArrowIcon color="#0b1d3a" /></Link>
            <Link className="btn btn-ghost-light" to={shopPath('pack')}>Voir les packs</Link>
          </div>
        </div>
        <div data-reveal style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
          <button
            ref={tilt} className="ph tilt" onClick={() => navigate(hero ? productPath(hero.id) : shopPath('all'))} aria-label={hero ? `Voir ${hero.name}` : 'Voir les produits'}
            style={{ width: '100%', maxWidth: 520, aspectRatio: '4/5', borderRadius: 28, border: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', padding: 0, boxShadow: '0 30px 80px rgba(0,0,0,.35)', background: '#fff', backgroundImage: 'none' }}
          >
            {hero?.image
              ? <img src={hero.image} alt={hero.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <img src="/logo-mark.svg" alt="" style={{ width: '45%', opacity: 0.3 }} />}
            <span className="tilt-glare" />
          </button>
        </div>
      </div>
    </section>
  );
}

function TrustBar({ L }: { L: Layout }) {
  return (
    <section style={{ background: '#fff', borderBottom: '1px solid var(--line)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: L.cols4, padding: `0 ${L.px}` }}>
        {TRUST.map((t, i) => (
          <div key={t.t} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: L.mobile ? '16px 8px' : '26px 18px', borderLeft: i && !L.mobile ? '1px solid var(--line)' : 0 }}>
            <span style={{ flex: 'none', width: 44, height: 44, borderRadius: '50%', background: 'var(--stone)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }} aria-hidden>{t.i}</span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>{t.t}</span>
              {!L.mobile && <span style={{ fontSize: 12.5, color: 'var(--graphite)' }}>{t.d}</span>}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Mise en avant d'un pack (deux produits réunis à prix réduit). */
function PackSpotlight({ L }: { L: Layout }) {
  const { products } = useCatalog();
  const pack = products.find((p) => p.cats.includes('pack') && p.image);
  if (!pack) return null;
  return (
    <section data-reveal style={{ margin: `${L.sec} ${L.px} 0`, borderRadius: 28, overflow: 'hidden', background: 'var(--ink-2)', color: '#fff', display: 'grid', gridTemplateColumns: L.split, alignItems: 'stretch' }}>
      <div style={{ padding: L.mobile ? '36px 24px' : '64px 56px', display: 'flex', flexDirection: 'column', gap: 20, justifyContent: 'center' }}>
        <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: 12, letterSpacing: '.16em', textTransform: 'uppercase' }}>Offre pack</span>
        <h2 className="display" style={{ fontSize: L.h2 }}>{pack.name}</h2>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.65, color: '#d3deea', maxWidth: 460 }}>{pack.desc}</p>
        {pack.features.length > 0 && (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pack.features.slice(0, 4).map((f) => <li key={f} style={{ display: 'flex', gap: 10, fontSize: 15 }}><span style={{ color: 'var(--accent-2)' }}>✓</span>{f}</li>)}
          </ul>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', marginTop: 8 }}>
          <PriceStamp p={pack} />
          <Link className="btn btn-cta" to={productPath(pack.id)}>Commander le pack<ArrowIcon color="#0b1d3a" /></Link>
        </div>
      </div>
      <Link to={productPath(pack.id)} style={{ display: 'block', minHeight: 320, background: '#fff' }} aria-label={pack.name}>
        <img src={pack.image} alt={pack.name} style={{ width: '100%', height: '100%', maxHeight: 640, objectFit: 'cover', display: 'block' }} />
      </Link>
    </section>
  );
}

const TABS = [['all', 'Tout'], ['best', 'Meilleures ventes'], ['promo', 'Promos'], ['new', 'Nouveautés']] as const;

export default function Home() {
  const L = useLayout();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('all');
  const { products } = useCatalog();
  const items = useMemo(() => {
    // Aperçu de 8 produits : le catalogue complet (paginé) est sur « Voir tous les produits ».
    if (tab === 'new') return products.filter((p) => p.cats.includes('new')).slice(0, 8);
    if (tab === 'best') return products.slice(0, 4); // déjà triés par ventes
    if (tab === 'promo') return products.filter((p) => p.old).slice(0, 8);
    return products.slice(0, 8);
  }, [tab, products]);

  return (
    <>
      <Hero L={L} />
      <TrustBar L={L} />

      <section style={{ padding: `${L.sec} ${L.px} 0`, display: 'flex', flexDirection: 'column', gap: 32 }}>
        <div data-reveal style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span className="mono">La sélection</span>
            <h2 className="display" style={{ fontSize: L.h2 }}>Nos best-sellers</h2>
          </div>
          <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TABS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={`chip${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
        </div>
        <ProductGrid items={items} />
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
          <Link className="btn btn-outline" to={shopPath('all')} style={{ padding: '0 32px' }}>Voir tous les produits</Link>
        </div>
      </section>

      <PackSpotlight L={L} />

      <section data-reveal style={{ padding: `${L.sec} ${L.px} 0`, display: 'flex', flexDirection: 'column', gap: 36 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span className="mono">Catégories</span>
            <h2 className="display" style={{ fontSize: L.h2 }}>Trouvez votre gadget</h2>
          </div>
          <Link className="link-underline" to={PATHS.collections}>Toutes les catégories</Link>
        </div>
        <CollectionsGrid />
      </section>

      <section data-reveal style={{ padding: `${L.sec} ${L.px} 0`, display: 'flex', flexDirection: 'column', gap: 36 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', textAlign: 'center' }}>
          <span className="mono">Simple et sans risque</span>
          <h2 className="display" style={{ fontSize: L.h2 }}>Comment commander ?</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: L.cols3, gap: L.gap }}>
          {STEPS.map((s) => (
            <div key={s.n} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 20, padding: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--grad)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18 }}>{s.n}</span>
              <span style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: 15 }}>{s.t}</span>
              <span style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--muted)' }}>{s.d}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Link className="btn btn-cta" to={shopPath('all')}>🛒 Commandez maintenant</Link>
        </div>
      </section>

      <section data-reveal style={{ marginTop: L.sec, padding: `${L.sec} ${L.px}`, background: '#fff', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 36, textAlign: 'center' }}>
        <Logo size={72} tagline />
        <p style={{ margin: 0, maxWidth: 820, fontWeight: 500, fontSize: L.quote, lineHeight: 1.4, textWrap: 'balance' }}>
          Des gadgets utiles, choisis pour leur efficacité et leur fiabilité, au meilleur prix — avec un service qui répond quand vous appelez.
        </p>
        <div style={{ width: '100%', maxWidth: 1040, display: 'grid', gridTemplateColumns: L.cols3, borderTop: '1px solid var(--line)', textAlign: 'left' }}>
          {PILLARS.map((pl) => (
            <div key={pl.n} style={{ padding: '28px 24px 0 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span className="mono" style={{ fontSize: 10.5 }}>{pl.n}</span>
              <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 14 }}>{pl.t}</span>
              <span style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--muted)' }}>{pl.d}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
