# MaxiGadget — boutique en ligne

Boutique de produits de beauté, de massage et de bien-être (Maroc, paiement à la livraison).
Projet dérivé de GMBIJOUX : même socle technique, catalogue et charte refaits.

- `src/` — site React + Vite (boutique + administration sur `/admin`)
- `backend/` — API NestJS + Prisma (MariaDB) — voir [backend/README.md](backend/README.md)
- `public/` — logo (`logo-mark.svg`), favicon et photos produits de départ
- [DEPLOY.md](DEPLOY.md) — mise en ligne (Namecheap + GitHub Actions)

## Démarrer en local

```bash
cd backend && cp .env.example .env && docker compose up -d   # MariaDB sur le port 3308
npm install && npm run db:deploy && npm run db:seed && npm run dev
cd .. && npm install && npm run dev                           # http://localhost:5173
```

## Charte

Couleurs issues du logo : marine `#12294D`, turquoise `#1FA3B3`, or `#F5B82E` (boutons d'achat), rouge promo `#D6283C`.
Typo : Montserrat. Détails sur la page `/charte-graphique`.
