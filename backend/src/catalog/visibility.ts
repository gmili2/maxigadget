import type { Prisma } from '@prisma/client';

/** Montre hors collection, ou dans une collection non archivée. */
export const COLLECTION_VISIBLE: Prisma.ProductWhereInput = { OR: [{ collectionId: null }, { collection: { isActive: true } }] };

/**
 * Montres visibles dans la boutique (liste, fiche, commande, référencement) : publiées, dans une catégorie
 * affichée et hors collection archivée. Masquer une catégorie ou archiver une collection retire ses montres
 * partout sans toucher à leur statut : les rétablir remet la boutique dans l'état précédent.
 */
export const VISIBLE: Prisma.ProductWhereInput = { status: 'ACTIVE', category: { isActive: true }, AND: [COLLECTION_VISIBLE] };
