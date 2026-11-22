# Déployer Kinoo sur Render — pas à pas

Kinoo a besoin d'un serveur qui reste allumé (les salles de visionnage se synchronisent par WebSocket). Render le permet,
Vercel non. La base de données reste sur Supabase.

## Avant de commencer
- Le code à jour est sur la branche **main** de GitHub (PR n°1 fusionnée).
- Vous avez sous la main : l'adresse de base Supabase (Session pooler), le certificat Supabase, vos clés Google, Turnstile et Resend
  (voir `docs/CONFIGURATION.md`). **Ne les collez jamais dans une conversation ni sur GitHub** : uniquement dans Render.

## Étape 1 — Créer le service
1. Compte sur https://render.com (connexion avec GitHub).
2. **New +** → **Blueprint** → choisissez le dépôt `ndiayefatoucha185/Kinoo`, branche `main`.
3. Render lit `render.yaml` et propose le service **kinoo** (offre *Starter*, région Frankfurt). Gardez *Starter* : l'offre gratuite
   s'endort après quelques minutes et coupe les salles en cours. (Tarif à vérifier sur render.com/pricing.)

## Étape 2 — Remplir les variables
Render demande les valeurs marquées « à renseigner » (les 4 secrets sont générés tout seuls) :

| Variable | Valeur |
|---|---|
| `PUBLIC_BASE_URL` | Au début `https://kinoo.onrender.com` (l'adresse que Render vous donne), puis votre vrai domaine |
| `DATABASE_URL` | URI Supabase *Session pooler* avec votre mot de passe |
| `DB_SSL_CA` | Contenu du certificat Supabase, sur **une seule ligne**, les retours à la ligne remplacés par `\n` |
| `ADMIN_EMAIL`, `ADMIN_INITIAL_PASSWORD` | Compte Super Admin (le mot de passe ne sert qu'à la première création : changez-le ensuite) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Clés Google OAuth |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Clés Cloudflare Turnstile |
| `RESEND_API_KEY`, `EMAIL_FROM` | E-mails (ex. `Kinoo <no-reply@votre-domaine>`) |

Puis **Apply**. Le premier déploiement dure quelques minutes. Les tables de la base se créent toutes seules au démarrage.

## Étape 3 — Vérifier
1. Ouvrez `https://<votre-service>.onrender.com/api/health` : une réponse « ok » doit s'afficher.
2. Ouvrez le site, inscrivez-vous, connectez-vous en Super Admin, créez une salle depuis deux navigateurs et testez la synchronisation.
3. En cas d'erreur : Render → votre service → **Logs**.

## Étape 4 — Votre nom de domaine
1. Render → service → **Settings** → **Custom Domains** → ajoutez `kinoo.app` (ou le vôtre) et suivez les enregistrements DNS indiqués.
2. Mettez `PUBLIC_BASE_URL` à jour avec ce domaine (le service redémarre).
3. Ajoutez le domaine dans : Google (origines JavaScript et URI de redirection `https://domaine/auth/callback`), Cloudflare Turnstile,
   et vérifiez-le chez Resend (enregistrements DNS) pour que les e-mails partent.

## Étape 5 — Mises à jour
Chaque mise à jour de `main` redéploie automatiquement. Procédure conseillée : travailler sur une branche, la tester, puis la fusionner dans `main`.

## Contrôle avant ouverture au public
`npm test`, `npm run build`, puis un test complet à deux navigateurs (inscription, séance gratuite, salle, forfaits).
Optionnel mais utile : serveur TURN pour le vocal sur 4G (voir `docs/CONFIGURATION.md`, section 6).
