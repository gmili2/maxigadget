/**
 * Premier démarrage en production (et à chaque déploiement : le script ne crée que ce qui manque).
 *
 *   node dist/cli/bootstrap.js                 → compte admin, catégories, livraison
 *   node dist/cli/bootstrap.js --with-catalog  → + produits de départ si le catalogue est vide
 *
 * Ne supprime ni ne modifie jamais de données existantes (contrairement à `npm run db:seed`).
 * Le mot de passe d'un admin existant n'est jamais changé.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../common/password';
import { pinPrismaEngine } from '../prisma-engine';
import { installCatalog, installReferenceData } from './catalog';

// Charge backend/.env (Node 20.12+), comme l'API.
try { process.loadEnvFile('.env'); } catch { /* variables fournies par l'hébergeur */ }

async function main() {
  const withCatalog = process.argv.includes('--with-catalog');
  pinPrismaEngine();
  const prisma = new PrismaClient();
  try {
    let admin = await prisma.user.findFirst({ where: { role: 'ADMIN', deletedAt: null }, orderBy: { createdAt: 'asc' } });
    if (admin) {
      console.log(`Admin existant : ${admin.email} (inchangé)`);
    } else {
      const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
      const password = process.env.ADMIN_PASSWORD;
      if (!email || !password || password.length < 12) {
        throw new Error('Aucun admin : définissez ADMIN_EMAIL et ADMIN_PASSWORD (12 caractères minimum) dans .env');
      }
      admin = await prisma.user.create({
        data: {
          email, passwordHash: await hashPassword(password),
          firstName: 'Admin', lastName: 'MaxiGadget', role: 'ADMIN', emailVerifiedAt: new Date(),
        },
      });
      console.log(`Admin créé : ${email}`);
    }

    const refs = await installReferenceData(prisma);
    console.log(`Catégories : ${Object.keys(refs.cats).length} · livraison : ${refs.shipping.name}`);

    if (withCatalog) {
      const count = await prisma.product.count();
      if (count) console.log(`Catalogue déjà rempli (${count} produits) : rien à importer`);
      else console.log(`Produits importés : ${Object.keys(await installCatalog(prisma, admin.id, refs)).length}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
