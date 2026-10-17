/**
 * Pixel Meta (Facebook) pour les campagnes publicitaires.
 * Chargé seulement si l'API fournit un identifiant (FB_PIXEL_ID dans le .env de l'API) ; sinon tout est ignoré.
 * Événements standard : https://developers.facebook.com/docs/meta-pixel/reference
 */
type Fbq = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][]; push: Fbq; loaded: boolean; version: string;
};
declare global { interface Window { fbq?: Fbq; _fbq?: Fbq } }

let ready = false;
/** Événements survenus avant l'arrivée de l'identifiant (fiche ouverte depuis une pub) : envoyés à l'initialisation. */
let pending: [string, Record<string, unknown> | undefined, { eventID: string } | undefined][] = [];

export function initPixel(id: string) {
  if (ready || !/^\d{5,20}$/.test(id)) return;
  ready = true;
  if (!window.fbq) {
    // Équivalent du code d'installation officiel : les appels sont mis en file jusqu'au chargement du script.
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args); else fbq.queue.push(args);
    } as Fbq;
    fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
    window.fbq = fbq;
    window._fbq ??= fbq;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
  }
  window.fbq('init', id);
}

/** À appeler après le premier PageView : envoie les événements en attente (ou les abandonne s'il n'y a pas de pixel). */
export function flushPixel() {
  if (ready) for (const [event, params, opts] of pending) window.fbq?.('track', event, params, opts);
  pending = [];
}

/**
 * `eventID` : même identifiant que l'événement envoyé par le serveur (API Conversions, backend/src/shop/meta-capi.ts),
 * pour que Meta ne compte qu'une fois un achat reçu des deux côtés.
 */
export function track(event: 'PageView' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase', params?: Record<string, unknown>, eventID?: string) {
  const opts = eventID ? { eventID } : undefined;
  if (ready) window.fbq?.('track', event, params, opts);
  else if (event !== 'PageView' && pending.length < 20) pending.push([event, params, opts]);
}
