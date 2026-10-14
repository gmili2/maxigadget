import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Hébergement cPanel (CloudLinux, famille RHEL) : sous Passenger, Prisma détecte mal la version
 * d'OpenSSL du système et cherche un moteur inexistant (« debian-openssl-1.0.x »).
 * On désigne explicitement le moteur RHEL correspondant à l'OpenSSL installé.
 * Sans effet ailleurs (macOS, Debian/Ubuntu, ou variable déjà définie).
 */
export function pinPrismaEngine() {
  if (process.platform !== 'linux' || process.env.PRISMA_QUERY_ENGINE_LIBRARY) return;
  const ssl = existsSync('/usr/lib64/libssl.so.3') ? '3.0.x' : existsSync('/usr/lib64/libssl.so.1.1') ? '1.1.x' : null;
  if (!ssl) return;
  let dir: string;
  try { dir = dirname(require.resolve('.prisma/client/index.js')); } catch { return; }
  const lib = join(dir, `libquery_engine-rhel-openssl-${ssl}.so.node`);
  if (existsSync(lib)) process.env.PRISMA_QUERY_ENGINE_LIBRARY = lib;
}
