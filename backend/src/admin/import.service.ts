import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Gender, MovementType, Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { AppError } from '../common/http';
import { UploadsService } from '../common/uploads.service';
import { PrismaService } from '../prisma.service';

/*
 * Import de catalogue fournisseur (CSV). Une ligne = un produit.
 * Colonnes reconnues (en-têtes insensibles à la casse et aux accents, séparateur « ; », « , » ou tabulation) :
 *   nom*, prix*, prix_barre, prix_promo, stock, sku, categorie, collection, marque, accroche, description,
 *   points_forts (séparés par « | »), couleur, couleurs, garantie (mois), statut, images
 * Les colonnes techniques héritées (mouvement, diametre…) restent acceptées mais ne sont plus affichées.
 * « couleurs » : valeurs séparées par « | » → une déclinaison par couleur (stock = « stock » pour chacune).
 * « images » : adresses https séparées par « | » (la première devient la photo principale).
 */

export const MAX_IMPORT_ROWS = 300;
const MAX_IMAGES_PER_PRODUCT = 6;

const ALIASES: Record<string, string[]> = {
  nom: ['nom', 'name', 'titre', 'title', 'produit', 'designation'],
  prix: ['prix', 'price', 'prix_vente', 'prix_dh'],
  prix_barre: ['prix_barre', 'compare_at_price', 'ancien_prix', 'prix_avant'],
  prix_promo: ['prix_promo', 'sale_price', 'promo'],
  stock: ['stock', 'quantite', 'qty', 'quantity'],
  sku: ['sku', 'reference', 'ref', 'code'],
  categorie: ['categorie', 'category', 'rayon'],
  collection: ['collection'],
  marque: ['marque', 'brand', 'vendor'],
  description: ['description', 'desc', 'body'],
  accroche: ['accroche', 'sous_titre', 'short_description', 'resume'],
  points_forts: ['points_forts', 'features', 'avantages', 'caracteristiques'],
  garantie: ['garantie', 'warranty', 'garantie_mois'],
  mouvement: ['mouvement', 'movement'],
  couleur: ['couleur', 'color', 'couleur_principale'],
  couleurs: ['couleurs', 'colors', 'variantes', 'variants'],
  diametre: ['diametre', 'diameter', 'diametre_mm', 'taille'],
  etancheite: ['etancheite', 'water_resistance', 'etancheite_m'],
  verre: ['verre', 'glass'],
  boitier: ['boitier', 'case', 'materiau_boitier'],
  bracelet: ['bracelet', 'strap'],
  genre: ['genre', 'gender', 'sexe'],
  statut: ['statut', 'status'],
  images: ['images', 'image', 'photos', 'toutes_images', 'image_urls'],
};
const MOVEMENTS: Record<string, MovementType> = {
  automatique: 'AUTOMATIC', automatic: 'AUTOMATIC', auto: 'AUTOMATIC', quartz: 'QUARTZ', manuel: 'MANUAL', manual: 'MANUAL',
  solaire: 'SOLAR', solar: 'SOLAR', kinetique: 'KINETIC', kinetic: 'KINETIC',
};
const GENDERS: Record<string, Gender> = { homme: 'MEN', hommes: 'MEN', men: 'MEN', femme: 'WOMEN', femmes: 'WOMEN', women: 'WOMEN', mixte: 'UNISEX', unisexe: 'UNISEX', unisex: 'UNISEX' };
const HEX: Record<string, string> = {
  noir: '#111111', black: '#111111', 'full black': '#111111', blanc: '#F5F5F2', white: '#F5F5F2', bleu: '#1F3A8A', blue: '#1F3A8A',
  'bleu nuit': '#1F2A44', vert: '#2F5D3A', green: '#2F5D3A', rouge: '#9B1C1C', red: '#9B1C1C', or: '#C9A44C', gold: '#C9A44C', dore: '#C9A44C',
  'or rose': '#C9A08A', 'rose gold': '#C9A08A', argent: '#C0C0C0', silver: '#C0C0C0', argente: '#C0C0C0', acier: '#9EA3A8', gris: '#7A7A75',
  grey: '#7A7A75', gray: '#7A7A75', marron: '#6B4226', brown: '#6B4226', beige: '#D9C7A7', rose: '#E8B4B8', nacre: '#EDE6DA', champagne: '#E6D3A3',
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const key = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const slugify = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const code = (s: string) => norm(s).toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 4) || 'X';

/** « 1 290,50 », « 1290.5 », « 1290 DH » → 1290.5 ; vide → null ; illisible → NaN. */
function num(v: string | undefined) {
  const t = (v ?? '').replace(/\s|dh|mad|€/gi, '').replace(',', '.');
  return t === '' ? null : Number(t);
}

/** Lecteur CSV (RFC 4180 : guillemets, retours à la ligne dans les champs). */
export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0];
  const sep = [';', '\t', ','].map((c) => [c, first.split(c).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

/** UTF-8 (avec ou sans BOM), sinon Windows-1252 (exports Excel). */
function decode(buf: Buffer) {
  const utf8 = buf.toString('utf8').replace(/^﻿/, '');
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf8;
}

export type ImportRow = {
  line: number; name: string; sku: string | null; priceCents: number; salePriceCents: number | null; stock: number;
  category: string; collection: string | null; brand: string; description: string; movementType: MovementType; color: string;
  colors: string[]; diameterMm: number; waterResistanceM: number; glass: string; caseMaterial: string; strapMaterial: string;
  gender: Gender; publish: boolean; images: string[]; shortDescription: string | null; features: string[]; warrantyMonths: number;
};
export type RowReport = { line: number; name: string; errors: string[]; warnings: string[]; row?: ImportRow };

@Injectable()
export class ImportService {
  private logger = new Logger('Import');

  constructor(private prisma: PrismaService, private uploads: UploadsService, private audit: AuditService) {}

  /** Lecture et contrôle du fichier, sans rien écrire. */
  analyse(file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) throw new AppError(HttpStatus.BAD_REQUEST, 'FILE_REQUIRED', 'Aucun fichier reçu');
    const rows = parseCsv(decode(file.buffer));
    if (rows.length < 2) throw new AppError(HttpStatus.BAD_REQUEST, 'EMPTY_FILE', 'Le fichier ne contient aucune ligne de produit');
    if (rows.length - 1 > MAX_IMPORT_ROWS) throw new AppError(HttpStatus.BAD_REQUEST, 'TOO_MANY_ROWS', `${MAX_IMPORT_ROWS} produits maximum par import`);

    const header = rows[0].map(key);
    const col: Record<string, number> = {};
    for (const [field, names] of Object.entries(ALIASES)) {
      const i = header.findIndex((h) => names.includes(h));
      if (i >= 0) col[field] = i;
    }
    if (col.nom === undefined || col.prix === undefined) {
      throw new AppError(HttpStatus.BAD_REQUEST, 'MISSING_COLUMNS', 'Colonnes obligatoires : « nom » et « prix »', { colonnesTrouvees: rows[0] });
    }
    const unknown = rows[0].filter((_, i) => !Object.values(col).includes(i)).filter((h) => h.trim());
    const get = (r: string[], f: string) => (col[f] === undefined ? '' : (r[col[f]] ?? '').trim());

    const seenSku = new Set<string>();
    const reports: RowReport[] = rows.slice(1).map((r, idx) => {
      const line = idx + 2;
      const errors: string[] = [], warnings: string[] = [];
      const name = get(r, 'nom').slice(0, 160);
      if (name.length < 2) errors.push('nom manquant');

      const price = num(get(r, 'prix'));
      const barre = num(get(r, 'prix_barre'));
      const promo = num(get(r, 'prix_promo'));
      if (price == null || Number.isNaN(price) || price <= 0) errors.push('prix invalide');
      // « prix_barre » (ancien prix) > prix : le prix devient le prix promo.
      let priceCents = Math.round((price ?? 0) * 100), salePriceCents: number | null = null;
      if (barre != null && !Number.isNaN(barre) && price && barre > price) { salePriceCents = priceCents; priceCents = Math.round(barre * 100); }
      if (promo != null && !Number.isNaN(promo)) {
        if (promo > 0 && promo < (price ?? 0)) salePriceCents = Math.round(promo * 100);
        else warnings.push('prix promo ignoré (doit être inférieur au prix)');
      }

      const stockN = num(get(r, 'stock'));
      const stock = stockN == null ? 0 : stockN;
      if (!Number.isInteger(stock) || stock < 0) errors.push('stock invalide');

      const sku = get(r, 'sku').toUpperCase().replace(/[^A-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || null;
      if (sku && seenSku.has(sku)) errors.push(`SKU ${sku} en double dans le fichier`);
      if (sku) seenSku.add(sku);

      const mvKey = norm(get(r, 'mouvement'));
      const movementType = MOVEMENTS[mvKey] ?? 'QUARTZ';
      if (mvKey && !MOVEMENTS[mvKey]) warnings.push(`mouvement « ${get(r, 'mouvement')} » ignoré`);
      const gKey = norm(get(r, 'genre'));
      const gender = GENDERS[gKey] ?? 'UNISEX';

      const images = get(r, 'images').split(/\s*[|\n]\s*/).filter(Boolean);
      const badImg = images.filter((u) => !/^https:\/\//i.test(u));
      if (badImg.length) warnings.push(`${badImg.length} image(s) ignorée(s) (adresse https attendue)`);
      const okImages = images.filter((u) => /^https:\/\//i.test(u)).slice(0, MAX_IMAGES_PER_PRODUCT);
      if (!okImages.length) warnings.push('aucune photo');

      const colors = [...new Set(get(r, 'couleurs').split('|').map((c) => c.trim()).filter(Boolean))].slice(0, 20);
      const diameter = num(get(r, 'diametre')), water = num(get(r, 'etancheite'));
      const statut = norm(get(r, 'statut'));

      const row: ImportRow = {
        line, name, sku, priceCents, salePriceCents, stock, category: get(r, 'categorie') || 'Massage',
        collection: get(r, 'collection') || null, brand: get(r, 'marque') || 'MaxiGadget', description: get(r, 'description').slice(0, 5000),
        movementType, color: get(r, 'couleur') || colors[0] || 'Noir', colors,
        diameterMm: diameter && diameter >= 10 && diameter < 100 ? Math.round(diameter * 10) / 10 : 40,
        waterResistanceM: water && water >= 0 && water <= 20_000 ? Math.round(water) : 30,
        glass: get(r, 'verre') || 'Minéral', caseMaterial: get(r, 'boitier') || 'Acier', strapMaterial: get(r, 'bracelet') || 'Acier',
        gender, publish: ['actif', 'active', 'publie', 'published', 'oui'].includes(statut), images: okImages,
        shortDescription: get(r, 'accroche').slice(0, 300) || null,
        features: get(r, 'points_forts').split('|').map((f) => f.trim()).filter(Boolean).slice(0, 12),
        warrantyMonths: (() => { const g = num(get(r, 'garantie')); return g != null && Number.isInteger(g) && g >= 0 && g <= 120 ? g : 6; })(),
      };
      return { line, name: name || '(sans nom)', errors, warnings, ...(errors.length ? {} : { row }) };
    });

    return {
      reports, unknownColumns: unknown,
      summary: { total: reports.length, valid: reports.filter((r) => !r.errors.length).length, invalid: reports.filter((r) => r.errors.length).length },
    };
  }

  /** Crée les produits valides (une transaction par produit : une erreur n'annule pas les autres). */
  async run(file: Express.Multer.File | undefined, actorId: string) {
    const { reports } = this.analyse(file);
    const results: { line: number; name: string; status: 'created' | 'skipped' | 'error'; message?: string; images?: number; slug?: string }[] = [];
    const created = { categories: new Set<string>(), brands: new Set<string>() };

    for (const rep of reports) {
      if (!rep.row) { results.push({ line: rep.line, name: rep.name, status: 'error', message: rep.errors.join(', ') }); continue; }
      const r = rep.row;
      try {
        if (r.sku && await this.prisma.product.findUnique({ where: { sku: r.sku }, select: { id: true } })) {
          results.push({ line: r.line, name: r.name, status: 'skipped', message: `SKU ${r.sku} déjà présent au catalogue` });
          continue;
        }
        // Sans SKU : un produit du même nom (insensible à la casse) est considérée comme déjà importée.
        if (!r.sku && await this.prisma.product.findFirst({ where: { name: r.name }, select: { id: true } })) {
          results.push({ line: r.line, name: r.name, status: 'skipped', message: 'un produit du même nom existe déjà' });
          continue;
        }
        const [brandId, categoryId, collectionId] = await Promise.all([
          this.findOrCreate('brand', r.brand, created.brands),
          this.findOrCreate('category', r.category, created.categories),
          r.collection ? this.findOrCreate('collection', r.collection) : Promise.resolve(null),
        ]);
        const sku = r.sku ?? await this.freeSku(`IMP-${code(r.name)}`);
        const slug = await this.freeSlug(slugify(r.name) || 'produit');

        const product = await this.prisma.$transaction(async (tx) => {
          const p = await tx.product.create({
            data: {
              name: r.name, slug, sku, reference: sku, description: r.description, priceCents: r.priceCents, salePriceCents: r.salePriceCents,
              stock: r.colors.length ? r.stock * r.colors.length : r.stock, status: r.publish ? 'ACTIVE' : 'DRAFT', publishedAt: r.publish ? new Date() : null,
              gender: r.gender, brandId, categoryId, collectionId, movementType: r.movementType, caseMaterial: r.caseMaterial.slice(0, 60),
              strapMaterial: r.strapMaterial.slice(0, 60), color: r.color.slice(0, 40), diameterMm: r.diameterMm, waterResistanceM: r.waterResistanceM,
              glass: r.glass.slice(0, 60), shortDescription: r.shortDescription, warrantyMonths: r.warrantyMonths,
              extraSpecs: r.features.length ? { features: r.features } : undefined,
              stockMovements: r.stock && !r.colors.length ? { create: { delta: r.stock, reason: 'INITIAL', actorId, note: 'Import CSV' } } : undefined,
            },
          });
          if (r.colors.length) {
            const option = await tx.productOption.create({
              data: { productId: p.id, name: 'Couleur', values: { create: r.colors.map((label, i) => ({ label: label.slice(0, 60), colorHex: HEX[norm(label)] ?? null, position: i })) } },
              include: { values: true },
            });
            for (const [i, v] of option.values.sort((a, b) => a.position - b.position).entries()) {
              const variant = await tx.productVariant.create({
                data: { productId: p.id, sku: await this.freeSku(`${sku}-${code(v.label)}`, tx), stock: r.stock, position: i, values: { create: { optionValueId: v.id } } },
              });
              if (r.stock) await tx.stockMovement.create({ data: { productId: p.id, variantId: variant.id, delta: r.stock, reason: 'INITIAL', actorId, note: 'Import CSV' } });
            }
          }
          await this.audit.log(actorId, 'product.import', 'product', p.id, { line: r.line, sku }, tx);
          return p;
        });

        // Photos : téléchargées après la création, une photo en échec n'empêche pas l'import.
        let images = 0;
        const failed: string[] = [];
        for (const [i, url] of r.images.entries()) {
          try {
            const saved = await this.uploads.fetchImage(url, 'products');
            await this.prisma.productImage.create({
              data: { productId: product.id, provider: 'LOCAL', storageKey: saved.key, url: saved.url, alt: r.name, position: i, isPrimary: images === 0 },
            });
            images++;
          } catch (e) {
            failed.push(`photo ${i + 1} : ${e instanceof Error ? e.message : 'erreur'}`);
          }
        }
        results.push({ line: r.line, name: r.name, status: 'created', images, slug, ...(failed.length && { message: failed.join(' · ') }) });
      } catch (e) {
        this.logger.warn(`Ligne ${r.line} : ${e instanceof Error ? e.message : e}`);
        results.push({ line: r.line, name: r.name, status: 'error', message: e instanceof AppError ? e.message : 'erreur à l’enregistrement' });
      }
    }
    return {
      results,
      summary: {
        created: results.filter((x) => x.status === 'created').length, skipped: results.filter((x) => x.status === 'skipped').length,
        errors: results.filter((x) => x.status === 'error').length, images: results.reduce((n, x) => n + (x.images ?? 0), 0),
        newCategories: [...created.categories], newBrands: [...created.brands],
      },
    };
  }

  private async findOrCreate(kind: 'brand' | 'category' | 'collection', name: string, createdNames?: Set<string>) {
    const slug = slugify(name) || kind;
    const model = this.prisma[kind] as unknown as {
      findFirst: (a: object) => Promise<{ id: string } | null>; create: (a: object) => Promise<{ id: string }>;
    };
    const found = await model.findFirst({ where: { OR: [{ slug }, { name }] }, select: { id: true } });
    if (found) return found.id;
    createdNames?.add(name);
    return (await model.create({ data: { name: name.slice(0, 100), slug } })).id;
  }

  private async freeSku(base: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const clean = base.toUpperCase().replace(/[^A-Z0-9-]+/g, '-').slice(0, 50);
    for (let i = 0; i < 1000; i++) {
      const sku = i ? `${clean}-${i + 1}` : clean;
      const [p, v] = await Promise.all([db.product.findUnique({ where: { sku }, select: { id: true } }), db.productVariant.findUnique({ where: { sku }, select: { id: true } })]);
      if (!p && !v) return sku;
    }
    throw new AppError(HttpStatus.CONFLICT, 'SKU_EXHAUSTED', `Impossible de trouver un SKU libre pour ${clean}`);
  }

  private async freeSlug(base: string) {
    for (let i = 0; i < 1000; i++) {
      const slug = (i ? `${base}-${i + 1}` : base).slice(0, 180);
      if (!(await this.prisma.product.findUnique({ where: { slug }, select: { id: true } }))) return slug;
    }
    throw new AppError(HttpStatus.CONFLICT, 'SLUG_EXHAUSTED', 'Adresse produit introuvable');
  }
}
