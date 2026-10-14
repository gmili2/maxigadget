export type CategoryId = 'all' | 'visage' | 'massage' | 'corps' | 'epilation' | 'cosmetique' | 'pack' | 'new';

export interface Swatch {
  label: string;
  colorHex: string | null;
}

export interface Variant {
  id: string;
  sku: string;
  values: Swatch[];
  price: number;
  old: number | null;
  inStock: boolean;
  lowStock: boolean;
  imageUrl: string | null; // photo propre à cette déclinaison (couleur)
}

/** Produit tel qu'affiché en boutique (chargé depuis l'API, voir catalog.tsx). */
export interface Product {
  id: string; // slug, utilisé dans les URL
  sku: string;
  name: string;
  brand?: string; // marque (absente pour les produits MaxiGadget)
  col: string;
  kind: string;
  cats: Exclude<CategoryId, 'all'>[];
  price: number; // prix payé (le plus bas des déclinaisons s'il y en a)
  old: number | null; // prix barré
  hasRange: boolean; // prix différents selon la déclinaison (« dès … »)
  rating: number;
  reviews: number;
  inStock: boolean;
  purchasable: boolean; // false : présenté en vitrine, non disponible à la vente
  stock: string;
  features: string[]; // points forts (liste à puces de la fiche)
  specs: [string, string][]; // fiche technique libre (autonomie, contenu du coffret…)
  warranty: number; // mois
  desc: string;
  publishedAt: string | null;
  options: { name: string; values: Swatch[] }[];
  variants: Variant[];
  swatches: Swatch[];
  image?: string; // photo principale
  photos: string[]; // toutes les photos, la principale en premier
}

export const CATS: Record<CategoryId, [string, string]> = {
  all: ['Tous les produits', 'Toute la sélection MaxiGadget, testée avant chaque expédition.'],
  visage: ['Soin du visage', 'Lifting, LED, nettoyage : des soins d\u2019institut, à la maison.'],
  massage: ['Massage', 'Pistolets, masseurs cervicaux et coussins pour détendre chaque muscle.'],
  corps: ['Corps & minceur', 'Ceintures EMS, rouleaux et appareils pour sculpter et tonifier.'],
  epilation: ['Épilation & cheveux', 'Épilateurs IPL, brosses lissantes et soins capillaires.'],
  cosmetique: ['Cosmétiques', 'Sérums, crèmes et huiles pour compléter votre routine.'],
  pack: ['Packs', 'Deux produits ou plus réunis, à prix réduit.'],
  new: ['Nouveautés', 'Les derniers gadgets entrés dans la boutique.'],
};

export const COLLECTIONS: { id: CategoryId; label: string; sub: string; img: string }[] = [
  { id: 'visage', label: 'Soin du visage', sub: 'Lifting, LED & éclat', img: 'soin visage' },
  { id: 'massage', label: 'Massage', sub: 'Détente & récupération', img: 'massage' },
  { id: 'corps', label: 'Corps & minceur', sub: 'Sculpter & tonifier', img: 'corps' },
  { id: 'epilation', label: 'Épilation & cheveux', sub: 'Peau nette, cheveux lisses', img: 'épilation' },
  { id: 'cosmetique', label: 'Cosmétiques', sub: 'Sérums & crèmes', img: 'cosmétiques' },
  { id: 'pack', label: 'Packs', sub: 'Plus de produits, moins cher', img: 'pack' },
];

export const FAQ: [string, string][] = [
  ['Comment se passe le paiement ?', 'Vous payez à la livraison, en espèces, au moment où vous recevez le colis. Aucun paiement en ligne n\u2019est demandé.'],
  ['Quels sont les délais de livraison ?', 'Nous vous appelons pour confirmer la commande, puis le colis part sous 24 h. Comptez 24 à 72 h selon votre ville, partout au Maroc.'],
  ['La livraison est-elle payante ?', 'Non, la livraison est gratuite sur tous nos produits, partout au Maroc.'],
  ['Puis-je vérifier le produit avant de payer ?', 'Oui, vous pouvez ouvrir le colis devant le livreur pour vérifier que le produit correspond à votre commande.'],
  ['Et si le produit ne fonctionne pas ?', 'Chaque appareil est garanti. En cas de panne ou de défaut, contactez-nous : nous l\u2019échangeons ou le remboursons.'],
  ['Puis-je retourner un produit ?', 'Vous disposez de 7 jours après la réception pour retourner un produit non utilisé, dans son emballage d\u2019origine.'],
  ['Les appareils conviennent-ils à tous ?', 'La plupart oui. Évitez cependant les appareils EMS, chauffants ou à lumière pulsée pendant la grossesse ou avec un stimulateur cardiaque ; en cas de doute, demandez l\u2019avis de votre médecin.'],
];

export const LEGAL: Record<'cgv' | 'privacy', { title: string; updated: string; sections: [string, string][] }> = {
  cgv: {
    title: 'Conditions générales de vente',
    updated: 'Mise à jour : octobre 2026',
    sections: [
      ['Objet', 'Les présentes conditions régissent les ventes de produits de beauté, de massage et de bien-être réalisées sur le site MaxiGadget auprès de clients particuliers.'],
      ['Prix', 'Les prix sont indiqués en dirhams marocains (DH), toutes taxes comprises. La livraison est offerte partout au Maroc.'],
      ['Commande', 'La commande est enregistrée dès sa validation sur le site ; nous vous contactons par téléphone pour la confirmer avant l\u2019expédition.'],
      ['Paiement', 'Le paiement s\u2019effectue à la livraison, en espèces, à la réception du colis.'],
      ['Livraison', 'Les commandes confirmées sont expédiées sous 24 h ouvrées et livrées en 24 à 72 h selon la ville.'],
      ['Rétractation', 'Vous disposez de 7 jours à compter de la réception pour retourner un produit non utilisé, dans son emballage d\u2019origine.'],
      ['Garantie', 'Les appareils électriques sont garantis contre tout défaut de fabrication pendant la durée indiquée sur la fiche produit, en plus des garanties légales.'],
      ['Précautions', 'Respectez le mode d\u2019emploi fourni. Les appareils EMS, chauffants ou à lumière pulsée sont déconseillés pendant la grossesse et aux porteurs de stimulateur cardiaque.'],
    ],
  },
  privacy: {
    title: 'Politique de confidentialité',
    updated: 'Mise à jour : octobre 2026',
    sections: [
      ['Données collectées', 'Nom, téléphone, adresse de livraison et historique de commandes. Aucune donnée bancaire n\u2019est collectée sur le site.'],
      ['Finalités', 'Traitement et confirmation des commandes, livraison, service client et, avec votre accord, offres promotionnelles.'],
      ['Conservation', 'Les données sont conservées pendant la durée de la relation commerciale, puis archivées selon les obligations légales.'],
      ['Vos droits', 'Vous disposez d\u2019un droit d\u2019accès, de rectification, d\u2019effacement et d\u2019opposition, exerçable à tout moment auprès de notre service client.'],
      ['Cookies', 'Des cookies techniques assurent le fonctionnement du site ; les cookies de mesure d\u2019audience et publicitaires ne sont déposés qu\u2019avec votre consentement.'],
      ['Contact', 'Pour toute question relative à vos données : contact@maxigadget.ma.'],
    ],
  },
};

export const PILLARS = [
  { n: '01', t: 'Produits testés', d: 'Chaque appareil est vérifié avant l\u2019envoi : charge, modes, accessoires.' },
  { n: '02', t: 'Paiement à la livraison', d: 'Vous ne payez qu\u2019à la réception, après avoir vu votre colis.' },
  { n: '03', t: 'Service client à l\u2019écoute', d: 'Conseils d\u2019utilisation, suivi de commande, échange en cas de souci.' },
];

/** Prix en dirhams marocains : « 13 900 DH ». */
export const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' DH';
export const stars = (r: number) => '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r));
export const ratingF = (r: number) => r.toFixed(1).replace('.', ',');
export const isNew = (p: Product) => p.cats.includes('new');
export const badgeOf = (p: Product) =>
  p.old ? '−' + Math.round((1 - p.price / p.old) * 100) + ' %' : isNew(p) ? 'Nouveau' : '';
