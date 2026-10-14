# MAXIGADGET — API

> Mise en ligne sur Namecheap (cPanel) avec GitHub Actions : voir [../DEPLOY.md](../DEPLOY.md). Premier démarrage en production : `npm run bootstrap` (jamais `db:seed`).

NestJS 11 + Prisma 6 + **MariaDB 11.4** (la version de l'hébergement Namecheap Stellar). La conception complète (modèle, endpoints, sécurité) est dans [ARCHITECTURE.md](ARCHITECTURE.md).

## Démarrer en local

```bash
cd backend
cp .env.example .env          # puis renseigner JWT_SECRET et ADMIN_PASSWORD
docker compose up -d          # MariaDB 11.4 sur le port 3307 (ou sans Docker, voir ci-dessous)
npm install
npm run db:deploy             # applique les migrations
npm run db:seed               # ⚠️ vide la base puis la remplit avec les données de démo
npm run dev                   # API sur http://localhost:3000/api/v1
```

Puis, à la racine du site : `npm run dev`. Vite redirige `/api` vers le port 3000 (variable `API_URL` pour changer la cible).
L'administration est sur `/admin` ; le compte est `ADMIN_EMAIL` / `ADMIN_PASSWORD` du `.env`, créé par le seed.

**Sans Docker (Homebrew)** : `brew install mariadb@11.4`, puis une instance dédiée sur le port 3307 :

```bash
D=~/.local/share/maxigadget-mariadb; B=$(brew --prefix mariadb@11.4)
mariadb-install-db --datadir=$D/data --auth-root-authentication-method=socket   # une seule fois
$B/bin/mariadbd --datadir=$D/data --port=3307 --bind-address=127.0.0.1 --socket=$D/mysql.sock &
# une seule fois : base et utilisateur
$B/bin/mariadb --socket=$D/mysql.sock -e "CREATE DATABASE maxigadget CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER 'maxigadget'@'127.0.0.1' IDENTIFIED BY 'maxigadget'; GRANT ALL ON maxigadget.* TO 'maxigadget'@'127.0.0.1';"
```

## Ce qui est en place

| Domaine | Endpoints |
|---|---|
| Santé | `GET /health` |
| Auth | `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` |
| Commande (public) | `GET /shipping/methods?country=MA` · `POST /orders/quote` (totaux calculés côté serveur ; `shippingMethodId` facultatif) · `POST /orders` (en-tête `Idempotency-Key` conseillé) |
| Catalogue (public) | `GET /products` (filtres `q`, `category`, `collection`, `brand`, `tag`, `color`, `movement`, `gender`, `minPrice`, `maxPrice`, `inStock`, `onSale`, `isNew`, `featured`, `sort`, `page`, `limit`) · `GET /products/:slug` · `GET /categories` · `GET /collections` · `GET /brands` |
| Admin produits | `GET/POST /admin/products` · `GET/PATCH /admin/products/:id` · `PATCH …/:id/status` · `POST …/:id/stock` (avec `variantId` pour un produit à déclinaisons) · `PUT …/:id/variants` (options + déclinaisons) |
| Admin commandes | `GET /admin/orders` · `GET /admin/orders/:id` · `PATCH …/:id/status` · `POST …/:id/shipments` · `POST …/:id/payment-received` (espèces encaissées ou virement reçu) · `POST /admin/payments/:id/refund` |
| Production | `npm run bootstrap [-- --with-catalog]` : crée l'admin, les catégories et la livraison (et les produits de départ si le catalogue est vide), sans rien écraser |
| Admin catégories | `GET/POST /admin/categories` · `PATCH/DELETE /admin/categories/:id` · `POST/DELETE …/:id/image` |
| Admin photos produit | `POST /admin/products/:id/images` · `PATCH …/images/:imageId/primary` · `DELETE …/images/:imageId` |
| Admin promotions | `GET/POST /admin/coupons` · `PATCH/DELETE /admin/coupons/:id` · idem pour `/admin/promotions` |
| Admin avis | `GET /admin/reviews` · `PATCH /admin/reviews/:id/status` |
| Admin clients | `GET /admin/users` |
| Admin stats | `GET /admin/stats/overview` · `sales-by-day` · `top-products` · `recent-orders` · `low-stock` |

Sécurité : Argon2id ; JWT d'accès de 15 min gardé en mémoire par le front ; refresh token opaque (cookie `httpOnly`, `SameSite=Strict`, chemin `/api/v1/auth`) stocké haché et renouvelé à chaque usage, avec révocation de toute la session en cas de rejeu. Guard JWT global (`@Public()` pour ouvrir une route), rôle ADMIN relu en base, limitation de débit (100 req/min, 5 connexions/min), Helmet, CORS limité à `FRONTEND_URL`, validation stricte des corps, corps limité à 100 ko, journal d'audit (`audit_logs`) pour chaque action admin.

Règles métier côté serveur : machine à états des commandes (transitions invalides refusées), annulation qui restitue le stock et rembourse si la commande était payée, remboursement partiel ou total avec restitution du stock, stock jamais négatif, note moyenne des produits mise à jour à la modération, prix finaux calculés par `PricingService` (prix promo + promotions automatiques).

## Boutique au Maroc : prix, livraison, paiement

- **Devise** : dirham marocain (MAD, affiché « DH »). Les montants sont stockés en centimes de dirham.
- **Livraison** : gratuite, aucun choix au moment de la commande. Une seule méthode active (« Livraison gratuite », Amana, 1 à 3 jours, 0 DH) dans `shipping_methods`.
- **Paiement** : à la livraison (espèces) ou par **virement bancaire avant expédition**. Une commande par virement ne peut pas être confirmée tant que l'admin n'a pas cliqué « Virement reçu ». Les coordonnées affichées au client viennent de `BANK_HOLDER`, `BANK_NAME`, `BANK_RIB` dans `.env` (**à compléter**).
- La commande crée (ou retrouve par e-mail) un compte client, réserve le stock et le coupon dans une transaction verrouillée : deux clients ne peuvent pas acheter la même dernière pièce.

## Images

Envoyées depuis l'admin (JPG, PNG ou WebP, 5 Mo max, format vérifié sur le contenu du fichier) et enregistrées dans `UPLOAD_DIR` (`uploads/` par défaut), servies sous `/api/uploads`. Ce dossier doit être sauvegardé et persistant en production ; passer à Cloudinary/S3 dès qu'il y a plusieurs serveurs.

## Options et déclinaisons

Un produit peut avoir jusqu'à 3 options (Couleur, Bracelet, Taille…), chacune avec ses valeurs ; une valeur peut porter une pastille (`colorHex`). Chaque combinaison est une déclinaison (`product_variants`) avec son SKU, son stock, un prix et un prix promo facultatifs (sinon ceux de le produit) et un statut actif.
Le stock de le produit est la somme des déclinaisons actives, recalculée par l'API. Les commandes figent le libellé (« Bleu nuit · Cuir ») et le SKU de la déclinaison achetée ; annulation et remboursement remettent le stock sur la bonne déclinaison.
En public, `GET /products/:slug` renvoie `options`, `variants` (prix final, disponibilité) et `swatches` ; le filtre `color` cherche aussi dans les déclinaisons.

## Pas encore branché

- **Stripe** : les remboursements sont enregistrés en base, mais **aucun appel à Stripe n'est fait** (un avertissement est journalisé). Tant que l'intégration n'est pas faite, il faut aussi rembourser dans le tableau de bord Stripe.
- **Paiement par carte (Stripe), espace client, emails (confirmation de commande), wishlist** : pas encore implémentés. Le panier reste dans le navigateur ; la commande est envoyée à l'API au moment de la validation.
- **Redis** : la limitation de débit est en mémoire (suffisant pour une seule instance).
- **Cloudinary/S3** : les images sont stockées sur le disque du serveur (voir « Images »). Les photos de départ des produits sont dans `public/` du site.

## Notes base de données (MariaDB)

- Une seule migration initiale (`prisma/migrations/…_init`), complétée à la main par les contraintes `CHECK` (prix promo < prix, stock ≥ 0, totaux cohérents…). MariaDB les applique ; l'API traduit leurs erreurs en messages lisibles.
- Collation `utf8mb4_unicode_ci` : e-mails, codes promo et recherches sont insensibles aux majuscules sans traitement particulier. **Créer la base en `utf8mb4_unicode_ci` sur l'hébergement.**
- La recherche du catalogue utilise `LIKE` ; un index `FULLTEXT` (nom, description) est prêt pour une recherche plus fine.
- Règles assurées par l'API (pas d'index partiel sous MariaDB) : une seule photo principale par produit, une seule ligne de panier par produit sans déclinaison.
- Les statistiques « ventes par jour » sont regroupées en heure de Casablanca côté API : les fuseaux nommés ne sont pas toujours chargés dans MariaDB en mutualisé.
- Le client Prisma embarque les moteurs `rhel-openssl-1.1.x` et `rhel-openssl-3.0.x` (serveurs CloudLinux de Namecheap).
- Nouvelle migration : `npx prisma migrate dev --create-only` (nécessite le droit de créer une base temporaire) ou `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`, puis `npm run db:deploy`.
