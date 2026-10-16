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
  videos: string[]; // vidéos, affichées après les photos sur la fiche
}

export const CATS: Record<CategoryId, [string, string]> = {
  all: ['جميع المنتجات', 'كل منتجات ماكسي غادجت، مجرَّبة قبل كل إرسال.'],
  visage: ['العناية بالوجه', 'شدّ البشرة، العلاج بالضوء، التنظيف العميق: عناية المعهد في بيتك.'],
  massage: ['التدليك', 'مسدسات التدليك وأجهزة الرقبة والوسائد لإرخاء كل العضلات.'],
  corps: ['الجسم والتنحيف', 'أحزمة EMS وأجهزة لنحت الجسم وشدّه.'],
  epilation: ['إزالة الشعر والعناية بالشعر', 'أجهزة IPL، فُرَش التمليس ومنتجات العناية بالشعر.'],
  cosmetique: ['مستحضرات التجميل', 'سيروم، كريمات وزيوت لإكمال روتينك.'],
  pack: ['العروض المجمّعة', 'منتجان أو أكثر في عرض واحد بسعر مخفَّض.'],
  new: ['جديدنا', 'آخر المنتجات التي وصلت إلى المتجر.'],
};

export const COLLECTIONS: { id: CategoryId; label: string; sub: string; img: string }[] = [
  { id: 'visage', label: 'العناية بالوجه', sub: 'شدّ، ضوء LED وإشراقة', img: 'العناية بالوجه' },
  { id: 'massage', label: 'التدليك', sub: 'استرخاء واسترجاع', img: 'التدليك' },
  { id: 'corps', label: 'الجسم والتنحيف', sub: 'نحت وشدّ', img: 'الجسم' },
  { id: 'epilation', label: 'إزالة الشعر والعناية بالشعر', sub: 'بشرة ناعمة وشعر أملس', img: 'إزالة الشعر' },
  { id: 'cosmetique', label: 'مستحضرات التجميل', sub: 'سيروم وكريمات', img: 'مستحضرات التجميل' },
  { id: 'pack', label: 'العروض المجمّعة', sub: 'منتجات أكثر بثمن أقل', img: 'عرض مجمّع' },
];

export const FAQ: [string, string][] = [
  ['كيف يتم الدفع؟', 'تدفع عند الاستلام، نقداً، عندما يصلك الطرد. لا نطلب أي دفع عبر الإنترنت.'],
  ['ما هي مدة التوصيل؟', 'نتصل بك لتأكيد الطلب، ثم يُرسَل الطرد خلال 24 ساعة. التوصيل يستغرق من 24 إلى 72 ساعة حسب مدينتك، في جميع أنحاء المغرب.'],
  ['هل التوصيل بمقابل؟', 'لا، التوصيل مجاني لجميع منتجاتنا وفي جميع مدن المغرب.'],
  ['هل يمكنني فحص المنتج قبل الدفع؟', 'نعم، يمكنك فتح الطرد أمام عامل التوصيل للتأكد من أن المنتج مطابق لطلبك.'],
  ['ماذا لو لم يعمل المنتج؟', 'كل أجهزتنا مضمونة. في حالة عطب أو عيب، اتصل بنا وسنقوم باستبداله أو استرجاع ثمنه.'],
  ['هل يمكنني إرجاع منتج؟', 'لديك 7 أيام من تاريخ الاستلام لإرجاع منتج غير مستعمل في غلافه الأصلي.'],
  ['هل الأجهزة مناسبة للجميع؟', 'أغلبها نعم. لكن يُنصح بتجنّب أجهزة EMS والأجهزة الحرارية وأجهزة الضوء النبضي أثناء الحمل أو لحاملي منظِّم ضربات القلب. عند الشك، استشر طبيبك.'],
];

export const LEGAL: Record<'cgv' | 'privacy', { title: string; updated: string; sections: [string, string][] }> = {
  cgv: {
    title: 'الشروط العامة للبيع',
    updated: 'آخر تحديث: أكتوبر 2026',
    sections: [
      ['الموضوع', 'تنظّم هذه الشروط عمليات بيع منتجات التجميل والتدليك والعناية التي تتم عبر موقع ماكسي غادجت للزبناء الأفراد.'],
      ['الأسعار', 'الأسعار معروضة بالدرهم المغربي، شاملة لجميع الضرائب. التوصيل مجاني في جميع أنحاء المغرب.'],
      ['الطلب', 'يُسجَّل الطلب فور تأكيده على الموقع، ثم نتصل بك هاتفياً لتأكيده قبل الإرسال.'],
      ['الدفع', 'يتم الدفع عند الاستلام، نقداً، عند تسلّم الطرد.'],
      ['التوصيل', 'تُرسَل الطلبات المؤكَّدة خلال 24 ساعة عمل وتصل في أجل يتراوح بين 24 و72 ساعة حسب المدينة.'],
      ['الإرجاع', 'لديك 7 أيام من تاريخ الاستلام لإرجاع منتج غير مستعمل في غلافه الأصلي.'],
      ['الضمان', 'الأجهزة الكهربائية مضمونة ضد عيوب التصنيع طيلة المدة المذكورة في صفحة المنتج، إضافةً إلى الضمانات القانونية.'],
      ['احتياطات', 'احترم دليل الاستعمال المرفق. لا يُنصح باستعمال أجهزة EMS والأجهزة الحرارية وأجهزة الضوء النبضي أثناء الحمل أو لحاملي منظِّم ضربات القلب.'],
    ],
  },
  privacy: {
    title: 'سياسة الخصوصية',
    updated: 'آخر تحديث: أكتوبر 2026',
    sections: [
      ['البيانات المجمَّعة', 'الاسم، رقم الهاتف، عنوان التوصيل وسجل الطلبات. لا نجمع أي بيانات بنكية على الموقع.'],
      ['الغرض', 'معالجة الطلبات وتأكيدها، التوصيل، خدمة الزبناء، وبموافقتك، إرسال العروض.'],
      ['مدة الحفظ', 'تُحفظ البيانات طيلة مدة العلاقة التجارية، ثم تُؤرشَف وفق الالتزامات القانونية.'],
      ['حقوقك', 'لك حق الاطلاع والتصحيح والحذف والاعتراض، يمكنك ممارسته في أي وقت عبر خدمة الزبناء.'],
      ['ملفات تعريف الارتباط', 'تضمن ملفات تقنية حسن سير الموقع؛ أما ملفات قياس الزيارات والإعلانات فلا تُستعمل إلا بموافقتك.'],
      ['اتصل بنا', 'لأي سؤال يخص بياناتك: contact@maxigadget.ma.'],
    ],
  },
};

export const PILLARS = [
  { n: '01', t: 'منتجات مجرَّبة', d: 'نتحقق من كل جهاز قبل إرساله: الشحن، الأوضاع والملحقات.' },
  { n: '02', t: 'الدفع عند الاستلام', d: 'لا تدفع إلا عند الاستلام، بعد أن ترى طردك.' },
  { n: '03', t: 'خدمة زبناء في الاستماع', d: 'نصائح الاستعمال، تتبّع الطلب، واستبدال عند أي مشكل.' },
];

/** Prix en dirhams marocains : « 1 290 درهم » (chiffres latins, comme au Maroc). */
export const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' درهم';
export const stars = (r: number) => '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r));
export const ratingF = (r: number) => r.toFixed(1);
export const isNew = (p: Product) => p.cats.includes('new');
export const badgeOf = (p: Product) =>
  p.old ? '\u2066−' + Math.round((1 - p.price / p.old) * 100) + '%\u2069' : isNew(p) ? 'جديد' : '';
