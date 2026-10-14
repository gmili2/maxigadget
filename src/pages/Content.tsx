import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FAQ, LEGAL, PILLARS } from '../data';
import { useLayout } from '../layout';
import { PATHS, shopPath } from '../routes';

const row: React.CSSProperties = { display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: 16, padding: '14px 0', borderTop: '1px solid var(--line)' };
const rowKey: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--graphite)' };

export function About() {
  const L = useLayout();
  return (
    <>
      <section data-reveal style={{ padding: `${L.pageTop} ${L.px} 0`, display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1100 }}>
        <span className="mono">من نحن</span>
        <h1 className="display" style={{ letterSpacing: '-.015em', lineHeight: 1, fontSize: L.h1 }}>أجهزة مفيدة لحياة يومية أفضل.</h1>
        <p style={{ margin: 0, maxWidth: 600, fontSize: 18, lineHeight: 1.65, color: 'var(--body)' }}>
          تختار ماكسي غادجت أجهزة تجميل وتدليك وعناية تفي بوعودها. كل منتج يُجرَّب قبل الإرسال، ويُوصَل مجاناً إلى جميع مدن المغرب، ولا تدفع إلا عند الاستلام.
        </p>
      </section>
      <section data-reveal style={{ padding: `${L.sec} ${L.px} 0`, display: 'grid', gridTemplateColumns: L.split, gap: L.pGap, alignItems: 'end' }}>
        <div className="ph" style={{ aspectRatio: '4/5', borderRadius: 22, backgroundImage: 'none', background: '#fff' }}><img src="/pack-beaute-bien-etre.jpg" alt="عرض التجميل والعناية من ماكسي غادجت" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {PILLARS.map((pl) => (
            <div key={pl.n} style={{ padding: '26px 0', borderTop: '1px solid var(--line)', display: 'grid', gridTemplateColumns: '56px minmax(0,1fr)', gap: 12 }}>
              <span className="mono" style={{ letterSpacing: '.14em' }}>{pl.n}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontStretch: '115%', fontWeight: 600, textTransform: 'uppercase', fontSize: 15 }}>{pl.t}</span>
                <span style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--muted)' }}>{pl.d}</span>
              </span>
            </div>
          ))}
          <Link className="btn btn-primary" to={shopPath('all')} style={{ marginTop: 20, alignSelf: 'flex-start' }}>اكتشف المنتجات</Link>
        </div>
      </section>
    </>
  );
}

const CONTACT_INFO = [
  { k: 'خدمة الزبناء', v: '7 أيام على 7، من 9 صباحاً إلى 9 مساءً' },
  { k: 'البريد الإلكتروني', v: 'contact@maxigadget.ma' },
  { k: 'الرد', v: 'خلال 24 ساعة عمل' },
];

export function Contact() {
  const L = useLayout();
  const [sent, setSent] = useState(false);
  const span = (full?: boolean) => (full || L.mobile ? 'span 2' : 'span 1');
  return (
    <section data-reveal style={{ padding: `${L.pageTop} ${L.px} 0`, display: 'grid', gridTemplateColumns: L.split2, gap: L.pGap }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <span className="mono">اتصل بنا</span>
        <h1 className="display" style={{ lineHeight: 1, fontSize: L.h2 }}>عندك سؤال؟ نجيبك.</h1>
        <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.65, color: 'var(--muted)', maxWidth: 380 }}>
          نصائح الاستعمال، تتبّع الطلب، الاستبدال: مستشار يجيبك بسرعة.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {CONTACT_INFO.map((ci) => (
            <div key={ci.k} style={{ padding: '16px 0', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={rowKey}>{ci.k}</span>
              {ci.k === 'البريد الإلكتروني' ? <a href={`mailto:${ci.v}`} style={{ fontSize: 15 }}>{ci.v}</a> : <span style={{ fontSize: 15 }}>{ci.v}</span>}
            </div>
          ))}
        </div>
      </div>
      {sent ? (
        <div role="status" style={{ background: '#fff', border: '1px solid var(--line)', padding: 40, display: 'flex', flexDirection: 'column', gap: 12, alignSelf: 'start' }}>
          <span style={{ fontStretch: '125%', fontWeight: 500, textTransform: 'uppercase', fontSize: 20 }}>تم إرسال رسالتك.</span>
          <span style={{ fontSize: 15, color: 'var(--muted)' }}>شكراً، سنعود إليك خلال 24 ساعة.</span>
        </div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); setSent(true); }}
          style={{ background: '#fff', border: '1px solid var(--line)', padding: L.boxPad, display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 14, alignSelf: 'start' }}
        >
          <label className="field" style={{ gridColumn: span() }}>الاسم<input name="name" required placeholder="ياسمين بناني" autoComplete="name" /></label>
          <label className="field" style={{ gridColumn: span() }}>البريد الإلكتروني<input name="email" type="email" dir="ltr" required placeholder="yasmine@exemple.ma" autoComplete="email" /></label>
          <label className="field" style={{ gridColumn: span(true) }}>الموضوع<input name="subject" placeholder="نصيحة، طلب، استبدال…" /></label>
          <label className="field" style={{ gridColumn: 'span 2' }}>الرسالة<textarea name="message" required rows={6} placeholder="رسالتك" /></label>
          <button type="submit" className="btn btn-primary btn-tall" style={{ gridColumn: 'span 2' }}>إرسال</button>
        </form>
      )}
    </section>
  );
}

export function Faq() {
  const L = useLayout();
  const [open, setOpen] = useState(0);
  return (
    <section data-reveal style={{ padding: `${L.pageTop} ${L.px} 0`, display: 'grid', gridTemplateColumns: L.split2, gap: L.pGap }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <span className="mono">مساعدة</span>
        <h1 className="display" style={{ lineHeight: 1, fontSize: L.h2 }}>الأسئلة الشائعة</h1>
        <Link className="link-underline" to={PATHS.contact} style={{ alignSelf: 'flex-start' }}>تواصل معنا</Link>
      </div>
      <div style={{ borderBottom: '1px solid var(--line)' }}>
        {FAQ.map(([q, a], i) => (
          <div key={q} style={{ borderTop: '1px solid var(--line)' }}>
            <button
              aria-expanded={open === i} aria-controls={`faq-${i}`} onClick={() => setOpen(open === i ? -1 : i)}
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, padding: '22px 0', background: 'none', border: 0, cursor: 'pointer', textAlign: 'start', fontSize: 16, fontWeight: 600 }}
            >
              <span>{q}</span>
              <span style={{ flex: 'none', width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--line-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{open === i ? '−' : '+'}</span>
            </button>
            {open === i && <p id={`faq-${i}`} style={{ margin: 0, paddingBottom: 24, paddingInlineEnd: 48, fontSize: 15, lineHeight: 1.7, color: 'var(--muted)' }}>{a}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

export function Legal({ kind }: { kind: 'cgv' | 'privacy' }) {
  const L = useLayout();
  const legal = LEGAL[kind];
  const sections = legal.sections.map(([t, b], i) => ({ n: String(i + 1).padStart(2, '0'), t, b }));
  return (
    <section data-reveal style={{ padding: `${L.pageTop} ${L.px} 0`, display: 'grid', gridTemplateColumns: L.split2, gap: L.pGap }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, position: L.sticky, top: 110, alignSelf: 'start' }}>
        <span className="mono">معلومات قانونية · {legal.updated}</span>
        <h1 className="display" style={{ fontSize: L.h3 }}>{legal.title}</h1>
        {L.desktop && (
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {sections.map((ls) => <a key={ls.n} href={`#s-${ls.n}`} style={{ fontSize: 13.5, color: 'var(--muted)' }}>{ls.n} — {ls.t}</a>)}
          </nav>
        )}
      </div>
      <div style={{ maxWidth: 680 }}>
        {sections.map((ls) => (
          <div key={ls.n} id={`s-${ls.n}`} style={{ padding: '26px 0', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 10, scrollMarginTop: 110 }}>
            <span className="mono" style={{ fontSize: 10.5, letterSpacing: '.14em' }}>{ls.n}</span>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{ls.t}</h2>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.75, color: 'var(--body)', textWrap: 'pretty' }}>{ls.b}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Account() {
  const L = useLayout();
  return (
    <section data-reveal style={{ padding: `${L.pageTop} ${L.px} 0`, display: 'flex', justifyContent: 'center' }}>
      <form onSubmit={(e) => e.preventDefault()} style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 className="display" style={{ margin: '0 0 8px', lineHeight: 1, fontSize: L.h3, textAlign: 'center' }}>حسابي</h1>
        <label className="field">البريد الإلكتروني<input type="email" dir="ltr" required placeholder="yasmine@exemple.ma" autoComplete="email" /></label>
        <label className="field">كلمة المرور<input type="password" required placeholder="••••••••" autoComplete="current-password" /></label>
        <button type="submit" className="btn btn-primary btn-tall">تسجيل الدخول</button>
        <button type="button" className="btn btn-outline btn-tall">إنشاء حساب</button>
        <span style={{ textAlign: 'center', fontSize: 13, color: 'var(--graphite)' }}>تتبّع الطلبات، المفضلة وسجل المشتريات.</span>
      </form>
    </section>
  );
}

const ANALYSIS = [
  { k: 'الرمز', v: 'سهم صاعد على شكل شريط: التقدّم وتحسين الحياة اليومية. منه استُلهمت تدرّجات الأزرق نحو الفيروزي في الموقع.' },
  { k: 'النجمة', v: 'الشرارة الذهبية: الفكرة الذكية. اللون الذهبي مخصّص لأزرار الشراء (اطلب الآن، أضف إلى السلة).' },
  { k: 'الكتابة', v: 'حروف عريضة ومتراصّة: MAXI بالأزرق الداكن وGADGET بالتدرّج. العناوين بخط Cairo العريض.' },
  { k: 'النبرة', v: 'مباشرة ومطمئنة مثل الإعلانات: السعر المشطوب، الختم الأحمر، التوصيل المجاني والدفع عند الاستلام.' },
];
const PALETTE = [
  { name: 'أزرق داكن', hex: '#12294D', use: 'النصوص، الشعار، الأزرار' },
  { name: 'فيروزي', hex: '#1FA3B3', use: 'العناوين الصغيرة واللمسات' },
  { name: 'ذهبي', hex: '#F5B82E', use: 'أزرار الشراء' },
  { name: 'أحمر', hex: '#D6283C', use: 'الأسعار المخفّضة' },
  { name: 'ضباب', hex: '#F5F8FB', use: 'الخلفية' },
  { name: 'سماوي', hex: '#EAF1F6', use: 'خلفيات الصور' },
];
const RULES = [
  { k: 'الأزرار', v: 'شكل حبّة، ارتفاع 54–56 بكسل. الذهبي = شراء، الأزرق الداكن = إجراء رئيسي، المحدَّد = إجراء ثانوي.' },
  { k: 'البطاقات', v: 'زوايا دائرية 18 بكسل، صورة على خلفية بيضاء، شارة تخفيض حمراء، زر سلة ذهبي.' },
  { k: 'المسافات', v: 'سلّم 4 · 8 · 12 · 16 · 24 · 32 · 56 · 96 · 128 بكسل. 128 بكسل بين الأقسام (72 على الهاتف).' },
  { k: 'الشبكة', v: 'هوامش 72 بكسل على الحاسوب و20 على الهاتف؛ المنتجات في 4 أعمدة، وعمودان على الهاتف.' },
  { k: 'الاتجاه', v: 'الموقع بالعربية من اليمين إلى اليسار؛ الأرقام والأسعار بالأرقام اللاتينية كما هو معتاد في المغرب.' },
];

export function Charte() {
  const L = useLayout();
  const pill: React.CSSProperties = { height: 54, padding: '0 30px', borderRadius: 999, fontSize: 12, fontWeight: 600, letterSpacing: '.16em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center' };
  return (
    <section style={{ padding: `${L.pageTop} ${L.px} 0`, display: 'flex', flexDirection: 'column', gap: L.sec }}>
      <div data-reveal style={{ display: 'grid', gridTemplateColumns: L.split2, gap: L.pGap, alignItems: 'center' }}>
        <img src="/logo-mark.svg" alt="شعار ماكسي غادجت" style={{ width: '100%', maxWidth: 300, aspectRatio: '1', objectFit: 'contain' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <span className="mono">01 — تحليل الشعار</span>
          <h1 className="display" style={{ lineHeight: 1, fontSize: L.h2 }}>الهوية البصرية</h1>
          {ANALYSIS.map((an) => <div key={an.k} style={row}><span style={rowKey}>{an.k}</span><span style={{ fontSize: 14.5, lineHeight: 1.6 }}>{an.v}</span></div>)}
        </div>
      </div>
      <div data-reveal style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <span className="mono">02 — الألوان (مستوحاة من الشعار)</span>
        <div style={{ display: 'grid', gridTemplateColumns: L.g5, gap: 12 }}>
          {PALETTE.map((c) => (
            <div key={c.hex} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ aspectRatio: '4/3', background: c.hex, border: '1px solid var(--line)' }} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--graphite)' }}>{c.hex} · {c.use}</span>
            </div>
          ))}
        </div>
      </div>
      <div data-reveal style={{ display: 'grid', gridTemplateColumns: L.split2, gap: L.pGap }}>
        <span className="mono">03 — الخطوط</span>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px 0', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: 44, lineHeight: 1 }}>Cairo 800 — عناوين</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--graphite)' }}>العناوين · سُمك 800 — صدى للحروف العريضة في الشعار</span>
          </div>
          <div style={{ padding: '20px 0', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 18, lineHeight: 1.6 }}>Cairo عادي — النصوص، من 15 إلى 18 بكسل، تباعد أسطر 1.6–1.7.</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--graphite)' }}>النصوص · الأزرار (سُمك 700)</span>
          </div>
          <div style={{ padding: '20px 0', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="mono" style={{ fontSize: 13 }}>عناوين صغيرة — العناية بالوجه · المرجع MG-NECK-01</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--graphite)' }}>Cairo 700 فيروزي: العناوين الصغيرة، المراجع، الأقسام</span>
          </div>
        </div>
      </div>
      <div data-reveal style={{ display: 'grid', gridTemplateColumns: L.split2, gap: L.pGap }}>
        <span className="mono">04 — الأزرار، البطاقات، المسافات</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <span style={{ ...pill, background: 'var(--gold)', color: 'var(--ink-2)' }}>اطلب الآن</span>
            <span style={{ ...pill, background: 'var(--ink)', color: '#fff' }}>رئيسي</span>
            <span style={{ ...pill, border: '1px solid var(--ink)' }}>ثانوي</span>
            <span style={{ padding: '4px 0', borderBottom: '1px solid var(--ink)', fontSize: 11.5, fontWeight: 600, letterSpacing: '.16em', textTransform: 'uppercase' }}>رابط نصي</span>
            <span style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--grad)' }} />
          </div>
          {RULES.map((ru) => <div key={ru.k} style={row}><span style={rowKey}>{ru.k}</span><span style={{ fontSize: 14.5, lineHeight: 1.6 }}>{ru.v}</span></div>)}
        </div>
      </div>
    </section>
  );
}

export function NotFound() {
  const L = useLayout();
  return (
    <section style={{ padding: `${L.pageTop} ${L.px} 0`, display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'flex-start' }}>
      <span className="mono">خطأ 404</span>
      <h1 className="display" style={{ fontSize: L.h2 }}>هذه الصفحة غير موجودة.</h1>
      <Link className="btn btn-primary" to="/">العودة إلى الرئيسية</Link>
    </section>
  );
}
