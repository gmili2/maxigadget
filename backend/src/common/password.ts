import { argon2id, argon2Verify } from 'hash-wasm';
import { randomBytes } from 'node:crypto';

/**
 * Hachage des mots de passe : Argon2id (mémoire 19 MiB, 2 passes), format PHC standard
 * (`$argon2id$v=19$m=19456,t=2,p=1$…`). Implémentation WebAssembly : aucun module natif à compiler,
 * elle fonctionne sur les serveurs mutualisés (CloudLinux 8, glibc 2.28) comme en local.
 */
export function hashPassword(password: string) {
  return argon2id({
    password, salt: randomBytes(16), parallelism: 1, iterations: 2, memorySize: 19456, hashLength: 32, outputType: 'encoded',
  });
}

/** false pour un mot de passe faux ou un hash illisible (jamais d'exception). */
export function verifyPassword(hash: string, password: string) {
  return argon2Verify({ password, hash }).catch(() => false);
}
