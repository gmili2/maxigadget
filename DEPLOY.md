# Mettre MAXIGADGET en ligne sur Namecheap (Stellar) avec GitHub Actions

Une fois la configuration faite (une seule fois, ~20 min), **chaque `git push` sur `main` met le site à jour** : GitHub vérifie le code, le construit, l'envoie sur l'hébergement, met à jour la base et redémarre l'API.

```
Votre domaine (ou domaine temporaire …cpanel.site)
 ├─ /            → site (dossier du domaine, ex. public_html)
 ├─ /api/…       → API Node.js (cPanel → Setup Node.js App, dossier ~/maxigadget-api)
 └─ base         → MariaDB de l'hébergement (cPanel → MySQL Databases)
```

---

## 1. Domaine

Dans cPanel → **Domains** : utilisez le domaine de votre offre, ou créez un **domaine temporaire** (`….cpanel.site`) pour tester.
Notez son **dossier racine** (Document Root), par exemple `public_html` → ce sera `SITE_DIR`.

## 2. Base de données

cPanel → **MySQL® Database Wizard** :
1. Base : `maxigadget` → cPanel la nomme `utilisateurcpanel_maxigadget`.
2. Utilisateur : `maxigadget` + mot de passe fort → `utilisateurcpanel_maxigadget`.
3. Privilèges : **ALL PRIVILEGES**.

Puis cPanel → **phpMyAdmin** → la base → **Opérations** → Interclassement : **`utf8mb4_unicode_ci`** → Exécuter.

Adresse de connexion (remplacez ; si le mot de passe contient des caractères spéciaux, encodez-les : `@` → `%40`, `#` → `%23`, `/` → `%2F`) :
```
mysql://utilisateurcpanel_maxigadget:MOTDEPASSE@localhost:3306/utilisateurcpanel_maxigadget
```

## 3. Application Node.js (l'API)

cPanel → **Setup Node.js App** → **Create Application** :

| Champ | Valeur |
|---|---|
| Node.js version | **22.x** |
| Application mode | Production |
| Application root | `maxigadget-api` |
| Application URL | votre domaine + **`api`** (ex. `monsite.cpanel.site/api`) |
| Application startup file | `dist/main.js` |

Cliquez **Create**. (L'application ne démarrera correctement qu'après le premier déploiement.)
En haut de la page, cPanel affiche une commande `source /home/…/nodevenv/maxigadget-api/22/bin/activate` : le `22` doit correspondre à `NODE_MAJOR` (22 par défaut).

## 4. Fichier `.env` de l'API

cPanel → **File Manager** → dossier `maxigadget-api` → **+ File** → `.env`, contenu :

```ini
NODE_ENV=production
DATABASE_URL="mysql://utilisateurcpanel_maxigadget:MOTDEPASSE@localhost:3306/utilisateurcpanel_maxigadget"
JWT_SECRET="COLLEZ-ICI-UNE-LONGUE-CHAINE-ALEATOIRE"
FRONTEND_URL="https://monsite.cpanel.site"

# Compte administrateur créé au premier déploiement (12 caractères minimum)
ADMIN_EMAIL="admin@votre-domaine.ma"
ADMIN_PASSWORD="choisissez-un-mot-de-passe-solide"

# Coordonnées affichées aux clients qui paient par virement
BANK_HOLDER="MAXIGADGET SARL"
BANK_NAME="Nom de la banque"
BANK_RIB="000 000 0000000000000000 00"

# E-mails de commande (Resend, facultatif) : confirmation au client + alerte à la boutique
RESEND_API_KEY="re_..."
MAIL_FROM="MAXIGADGET <commandes@votre-domaine.ma>"
ORDER_NOTIFY_EMAIL="vous@exemple.com"
```

Pour `JWT_SECRET`, générez une chaîne aléatoire (sur votre Mac) : `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
**Ce fichier ne doit jamais être mis sur GitHub.**

## 5. Accès SSH pour GitHub

Une clé dédiée a été créée sur le Mac de développement : `~/.ssh/maxigadget_deploy` (privée) et `~/.ssh/maxigadget_deploy.pub` (publique).

1. cPanel → **SSH Access** → **Manage SSH Keys** → **Import Key** :
   - Name : `github-actions`
   - Public key : collez le résultat de `cat ~/.ssh/maxigadget_deploy.pub`
   - **Import**, puis dans la liste → **Manage** → **Authorize**.
2. Notez le **nom du serveur** (cPanel, colonne de droite « Server Name » / « Shared IP », ex. `server123.web-hosting.com`) et votre **nom d'utilisateur cPanel**.
3. Test depuis le Mac : `ssh -i ~/.ssh/maxigadget_deploy -p 21098 UTILISATEUR@SERVEUR "echo ok"`

## 6. Réglages GitHub

Dépôt → **Settings** → **Secrets and variables** → **Actions**.

**Secrets** (onglet *Secrets*) :

| Nom | Valeur |
|---|---|
| `SSH_HOST` | nom du serveur (ex. `server123.web-hosting.com`) |
| `SSH_USER` | utilisateur cPanel |
| `SSH_PRIVATE_KEY` | contenu de la clé privée : `pbcopy < ~/.ssh/maxigadget_deploy` puis coller |

**Variables** (onglet *Variables*) :

| Nom | Valeur | |
|---|---|---|
| `DEPLOY_ENABLED` | `true` | active le déploiement |
| `SITE_URL` | `https://monsite.cpanel.site` | vérification automatique après déploiement |
| `SITE_DIR` | `public_html` | dossier du domaine (étape 1) |
| `APP_DIR` | `maxigadget-api` | facultatif (valeur par défaut) |
| `SSH_PORT` | `21098` | facultatif (valeur par défaut Namecheap) |
| `NODE_MAJOR` | `22` | facultatif |

## 7. Premier déploiement

GitHub → **Actions** → **Build & deploy** → **Run workflow** → cochez **« Importer les produits de départ »** → **Run**.

Le déploiement :
1. vérifie et construit le site et l'API ;
2. envoie l'API, installe ses dépendances, applique les migrations de la base ;
3. crée l'admin (depuis `.env`), les catégories et la livraison ; avec la case cochée, importe les 10 produits de départ (3 publiés avec photos, 7 en brouillon) (sans fausses commandes ni faux clients) ;
4. redémarre l'API, envoie le site, puis vérifie que `SITE_URL/api/v1/health` répond.

Ensuite : ouvrez `SITE_URL` (boutique) et `SITE_URL/admin` (connexion avec `ADMIN_EMAIL` / `ADMIN_PASSWORD`).
Les déploiements suivants se font **automatiquement à chaque `git push` sur `main`** (le catalogue n'est jamais réimporté ni écrasé).

## 8. HTTPS

cPanel → **SSL/TLS Status** → vérifiez que le domaine a un certificat (AutoSSL, gratuit). Ensuite, dans `.htaccess` du site (fichier `public/.htaccess` du dépôt), décommentez les 3 lignes « Forcer HTTPS » et poussez.

---

## En cas de problème

| Symptôme | Où regarder |
|---|---|
| Étape « Installer, migrer… » en échec | Le message GitHub indique la cause : `.env` manquant, mot de passe de base incorrect, etc. |
| Page blanche ou erreur 503 sur `/api` | cPanel → Setup Node.js App → l'application → **Restart** ; journal : `~/maxigadget-api/stderr.log` (File Manager) |
| Erreur 404 en rechargeant `/produits` ou `/admin` | `.htaccess` absent du dossier du site : relancer le déploiement |
| Connexion admin impossible | `ADMIN_EMAIL` / `ADMIN_PASSWORD` du `.env` au moment du **premier** déploiement ; le mot de passe n'est jamais modifié ensuite |

**Sauvegardes** : cPanel → **Backup** (base MariaDB + dossier `maxigadget-api/uploads` qui contient les images envoyées depuis l'admin).

**Ne jamais lancer `npm run db:seed` sur l'hébergement** : ce script de démonstration vide toute la base.
