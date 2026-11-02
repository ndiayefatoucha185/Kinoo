# Configuration de Kinoo

Toutes les valeurs se mettent dans le fichier **`.env`** (jamais dans le code, jamais dans un message, jamais sur GitHub).
Après chaque modification du `.env`, relancez `npm run dev`.

## 1. Base de données (Supabase)

1. Supabase → **Connect** → onglet *Session pooler* → copiez l'URI (port 5432).
2. Dans `.env` : `DATABASE_URL=` suivi de cette URI avec votre vrai mot de passe.
3. Téléchargez le certificat (Supabase → Settings → Database → *SSL Configuration*), placez-le à la racine du projet sous le nom `supabase-ca.crt`, puis `DB_SSL_CA_FILE=supabase-ca.crt`.

## 2. Secrets (obligatoires en production)

Générez chaque secret avec :

```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Un secret différent pour chacun : `JWT_SECRET`, `OAUTH_STATE_SECRET`, `MODERATION_HMAC_SECRET`, `INTERNAL_CRON_SECRET`.

## 3. Connexion avec Google

1. https://console.cloud.google.com → *APIs & Services* → *Credentials* → **Create credentials → OAuth client ID** (type *Web application*).
2. *Authorized JavaScript origins* : `http://localhost:3000` (et votre domaine en production).
3. *Authorized redirect URIs* : `http://localhost:3000/` (et `https://votre-domaine/`).
4. Copiez dans `.env` : `GOOGLE_CLIENT_ID=` et `GOOGLE_CLIENT_SECRET=`.
5. Écran de consentement OAuth : ajoutez votre adresse comme *utilisateur test* tant que l'application n'est pas publiée.

## 4. E-mails (confirmation d'adresse, mot de passe oublié, invitations)

Deux fournisseurs sont gérés (un seul suffit) :

- **Resend** : créez un compte sur resend.com, vérifiez votre domaine (enregistrements DNS), créez une clé API → `RESEND_API_KEY=`.
- **Brevo** : compte sur brevo.com, vérifiez l'expéditeur, créez une clé API → `BREVO_API_KEY=`.

Puis `EMAIL_FROM=Kinoo <no-reply@votre-domaine>` (adresse du domaine vérifié).
Sans clé, les e-mails ne partent pas : en développement ils sont seulement simulés.

## 5. Anti-robots (Cloudflare Turnstile)

1. dash.cloudflare.com → *Turnstile* → *Add widget* (domaines : `localhost` et votre domaine).
2. `TURNSTILE_SITE_KEY=` (clé publique) et `TURNSTILE_SECRET_KEY=` (clé secrète).

## 6. Vocal / vidéo des participants (serveur TURN)

Sans serveur TURN, certains réseaux (4G, entreprises) ne peuvent pas établir le vocal. La synchronisation de la vidéo, elle, n'en dépend pas.
Options : un service géré (Metered, Twilio…) → `TURN_SERVER_URL=`, `TURN_USERNAME=`, `TURN_CREDENTIAL=` ; ou votre propre Coturn → `TURN_SERVER_URL=` et `TURN_SECRET=`.

## Mise en production

À définir sur l'hébergeur (Cloud Run : *Variables et secrets*), en plus de ce qui précède :

- `NODE_ENV=production`
- `PUBLIC_BASE_URL=https://votre-domaine` (obligatoire)
- `ALLOWED_ORIGINS=` si le site est servi depuis d'autres origines
- `ADMIN_EMAIL` et `ADMIN_INITIAL_PASSWORD` (utilisés uniquement à la création du compte Super Admin)
- tous les secrets de la section 2 (32 caractères minimum, stockés dans un gestionnaire de secrets)
- `IS_AI_STUDIO_PREVIEW=false` et `ALLOW_BEARER_FALLBACK=false`

Contrôle avant ouverture au public : `npm test`, `npm run build`, puis un test complet à deux navigateurs.
