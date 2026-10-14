/** Numéros de page affichés : première, dernière, et 1 page de part et d'autre de la page courante. */
export function pageList(page: number, pages: number): (number | '…')[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const n of [...keep].sort((a, b) => a - b)) {
    if (n - prev > 1) out.push('…');
    out.push(n);
    prev = n;
  }
  return out;
}

export function Pagination({ page, pages, onChange, label = 'Pagination' }: { page: number; pages: number; onChange: (page: number) => void; label?: string }) {
  if (pages <= 1) return null;
  const btn = (active: boolean): React.CSSProperties => ({ minWidth: 44, height: 44, padding: '0 14px', fontSize: 13.5, justifyContent: 'center', ...(active && { pointerEvents: 'none' }) });
  return (
    <nav aria-label={label} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <button className="chip" disabled={page <= 1} onClick={() => onChange(page - 1)} style={{ ...btn(false), opacity: page <= 1 ? 0.35 : 1 }} aria-label="Page précédente">← Précédent</button>
      {pageList(page, pages).map((n, i) => (n === '…'
        ? <span key={`e${i}`} style={{ padding: '0 6px', color: 'var(--graphite)' }}>…</span>
        : <button key={n} className={`chip${n === page ? ' active' : ''}`} aria-current={n === page ? 'page' : undefined} onClick={() => onChange(n)} style={btn(n === page)}>{n}</button>))}
      <button className="chip" disabled={page >= pages} onClick={() => onChange(page + 1)} style={{ ...btn(false), opacity: page >= pages ? 0.35 : 1 }} aria-label="Page suivante">Suivant →</button>
    </nav>
  );
}
