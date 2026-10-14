/* Client de l'API GMBIJOUX (backend/). Le jeton d'accès reste en mémoire ;
   la session est prolongée via le cookie httpOnly de rafraîchissement. */

export type ApiUser = { id: string; email: string; firstName: string; lastName: string; role: 'ADMIN' | 'CUSTOMER' };
export type Page<T> = { data: T[]; meta: { page: number; limit: number; total: number; totalPages: number; countsByStatus?: Record<string, number> } };

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status; this.code = code; this.details = details;
  }
}

const BASE = '/api/v1';
let accessToken: string | null = null;
let refreshing: Promise<ApiUser | null> | null = null;
let onLogout: (() => void) | null = null;

export const setLogoutHandler = (fn: (() => void) | null) => { onLogout = fn; };

async function parse(res: Response) {
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.code ?? 'ERROR', body?.message ?? `Erreur ${res.status}`, body?.details);
  return body;
}

/** Un seul rafraîchissement à la fois, même si plusieurs requêtes expirent ensemble. */
export function refreshSession(): Promise<ApiUser | null> {
  refreshing ??= fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'same-origin' })
    .then(parse)
    .then((b: { data: { accessToken: string; user: ApiUser } }) => { accessToken = b.data.accessToken; return b.data.user; })
    .catch(() => { accessToken = null; return null; })
    .finally(() => { refreshing = null; });
  return refreshing;
}

export async function login(email: string, password: string): Promise<ApiUser> {
  const b = await parse(await fetch(`${BASE}/auth/login`, {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  }));
  accessToken = b.data.accessToken;
  return b.data.user;
}

export async function logout() {
  await fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
  accessToken = null;
}

/** Appel à l'API. Un corps FormData (envoi de fichier) part tel quel ; sinon il est sérialisé en JSON. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const form = init.body instanceof FormData;
  const send = () => fetch(BASE + path, {
    method: init.method ?? 'GET', credentials: 'same-origin',
    headers: {
      ...(init.body !== undefined && !form && { 'Content-Type': 'application/json' }),
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : form ? (init.body as FormData) : JSON.stringify(init.body),
  });
  let res = await send();
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await refreshSession()) res = await send();
    else { onLogout?.(); }
  }
  return parse(res);
}

/** Récupère toutes les pages d'une liste paginée de l'API (50 éléments par page). */
export async function apiAll<T>(path: string): Promise<T[]> {
  const sep = path.includes('?') ? '&' : '?';
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const r = await api<Page<T>>(`${path}${sep}limit=50&page=${page}`);
    out.push(...r.data);
    if (page >= r.meta.totalPages) return out;
  }
}
