import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';

/** Écran d'entrée de la boutique en accès privé. */
export function AccessGate({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api('/site/unlock', { method: 'POST', body: { code } });
      onUnlock();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Serveur injoignable, réessayez.');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'var(--ink)' }}>
      <form onSubmit={submit} style={{ width: 'min(420px,100%)', background: 'var(--ivory)', padding: 'clamp(28px,6vw,48px)', display: 'flex', flexDirection: 'column', gap: 18, textAlign: 'center', alignItems: 'center' }}>
        <img src="/logo-mark.svg" alt="MaxiGadget" style={{ width: 88, height: 88 }} />
        <span className="mono" style={{ fontSize: 10.5, letterSpacing: '.16em' }}>Accès privé</span>
        <h1 className="display" style={{ margin: 0, fontSize: 26, lineHeight: 1.1 }}>Bienvenue chez MaxiGadget</h1>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: 'var(--muted)' }}>La boutique est réservée à nos invités. Saisissez votre code d’accès pour découvrir la collection.</p>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code d’accès" aria-label="Code d’accès" autoFocus required autoComplete="off"
          style={{ width: '100%', height: 52, padding: '0 16px', border: '1px solid var(--line-strong)', background: '#fff', fontSize: 15, textAlign: 'center', letterSpacing: '.1em' }} />
        {error && <span role="alert" style={{ fontSize: 13, color: 'oklch(0.55 0.15 25)' }}>{error}</span>}
        <button className="btn btn-primary" disabled={busy || !code.trim()} style={{ width: '100%', height: 52, opacity: busy || !code.trim() ? 0.5 : 1 }}>{busy ? 'Vérification…' : 'Entrer'}</button>
      </form>
    </div>
  );
}
