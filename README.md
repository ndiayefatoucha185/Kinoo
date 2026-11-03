# Kinoo — visionnage synchronisé

Kinoo permet de regarder une vidéo (YouTube, lien direct, flux HLS, fichier local) **en même temps** que ses proches, avec chat, réactions et vocal.
L'hôte contrôle la lecture ; les invités restent synchronisés automatiquement.

**Technique** : React 19 + Vite + Tailwind 4 (client) · Express + WebSocket `ws` (serveur) · PostgreSQL (Supabase) via Drizzle ORM.

## Démarrer en local

1. Installer [Node.js 22](https://nodejs.org/).
2. `npm install`
3. Copier `.env.example` vers `.env` (une seule fois, sinon vous écrasez vos réglages) puis le remplir — voir [docs/CONFIGURATION.md](docs/CONFIGURATION.md).
4. Créer les tables : Supabase → SQL Editor → coller `supabase/schema.sql` → Run (ou `npm run db:migrate`).
5. `npm run dev` puis ouvrir http://localhost:3000

Le compte Super Admin est créé au premier démarrage à partir de `ADMIN_EMAIL` et `ADMIN_INITIAL_PASSWORD`.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur + client en développement |
| `npm run build` | Build de production (`dist/` + `build/server.cjs`) |
| `npm start` | Lance le build de production |
| `npm test` | Tests automatiques (`tests/`) |
| `npm run lint` | Vérification des types TypeScript |
| `npm run db:migrate` | Applique les fichiers de `supabase/migrations/` pas encore appliqués |

## Base de données

- `supabase/schema.sql` : schéma complet (nouvelle base).
- `supabase/migrations/NNNN_nom.sql` : évolutions successives. Pour changer le schéma, ajoutez un nouveau fichier numéroté, **ne modifiez jamais** un fichier déjà appliqué, puis lancez `npm run db:migrate`.
- Le serveur n'utilise **jamais** les clés `anon` / `service_role` de Supabase : il se connecte directement à Postgres (`DATABASE_URL`). La sécurité par ligne (RLS) est activée sans règle pour bloquer l'accès direct via l'API publique de Supabase.

## Sécurité (résumé)

- Mots de passe hachés (bcrypt), sessions JWT révocables, mots de passe de salle hachés (scrypt).
- Jetons de réinitialisation / vérification à usage unique, stockés sous forme d'empreinte.
- CORS strict, CSP, limitation de débit, validation des entrées, en-têtes de sécurité.
- Aucun secret dans le code : tout passe par `.env` (ignoré par Git).

## Fonctionnement des salles

- À la création, l'hôte indique le **nombre de personnes à inviter** (plafonné par sa formule : 8 / 15 / 25 personnes hôte compris).
- Quand tout le monde est entré, la salle **se verrouille** ; les personnes déjà entrées peuvent revenir après une coupure.
- **Salle d'attente** : la séance démarre automatiquement quand tout le monde est là (option), ou quand l'hôte clique sur « Démarrer maintenant ».
- Si l'hôte quitte, la séance est terminée (immédiatement via « Quitter », ou après 60 s s'il ferme simplement l'onglet). Une salle vide se termine après 60 s.

## Amis, séances programmées, messagerie, statistiques

- **Amis** (formule Premium) : ajout par pseudo ou e-mail ; si la personne a un compte Kinoo, l'indicateur « en ligne » est réel.
- **Messagerie privée** (Premium) : entre amis ayant un compte, stockée en base, rafraîchie toutes les 5 secondes.
- **Séances programmées** : stockées en base, disponibles depuis n'importe quel appareil.
- **Temps de visionnage** : mesuré par le serveur (temps de lecture réellement écoulé), pas estimé.
- Les tables correspondantes se créent toutes seules au démarrage du serveur ; les fichiers `supabase/migrations/0003_social.sql` et `0004_watch_time.sql` en sont la trace.

## Déploiement

Un `Dockerfile` est fourni (Google Cloud Run). Variables à définir en production : voir [docs/CONFIGURATION.md](docs/CONFIGURATION.md#mise-en-production).
