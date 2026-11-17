# Kinoo Couple — application séparée (site, installation téléphone, Google Play / App Store)

Kinoo Couple utilise le **même serveur et la même base** que Kinoo. Seule l'interface change : un accueil dédié
aux couples, pas de forfaits Découverte/Standard/Premium, pas de menu Kinoo.

## Comment le « mode Couple » s'active
| Situation | Résultat |
|---|---|
| Adresse `couple.votre-domaine` (ex. `couple.kinoo.app`) | Kinoo Couple |
| `http://localhost:3000/?app=couple` (test en local) | Kinoo Couple (mémorisé pour l'onglet) |
| `http://localhost:3000/?app=kinoo` | Retour à Kinoo |
| Build `npm run build:couple` (application installée) | Kinoo Couple |

## Étape 1 — Tester en local
1. `git pull origin fix/security-audit`, arrêter puis relancer `npm run dev`.
2. Ouvrir `http://localhost:3000/?app=couple`.

## Étape 2 — Site web couple.votre-domaine
1. Chez votre hébergeur de domaine, créer l'enregistrement **couple** qui pointe vers le même service que `kinoo.app`
   (Cloud Run : « Domain mapping » / CNAME).
2. Google OAuth : ajouter `https://couple.votre-domaine` dans les **origines JavaScript autorisées** et
   `https://couple.votre-domaine/auth/callback` dans les URI de redirection.
3. Cloudflare Turnstile : ajouter `couple.votre-domaine` aux domaines autorisés.
4. Aucune autre variable à changer : le serveur autorise automatiquement `couple.<PUBLIC_BASE_URL>`.

## Étape 3 — Installation sur téléphone sans boutique (PWA)
Sur `couple.votre-domaine` : Android/Chrome → menu « Installer l'application » ; iPhone/Safari → Partager →
« Sur l'écran d'accueil ». L'icône « Kinoo Couple » apparaît, l'application s'ouvre en plein écran.

## Étape 4 — Google Play et App Store (Capacitor)
Prérequis (à vérifier sur les sites officiels, les tarifs évoluent) :
- Compte **Google Play Console** (paiement unique, environ 25 $).
- Compte **Apple Developer** (environ 99 $ par an). Compiler pour iPhone demande un **Mac avec Xcode**, ou un service de
  compilation en ligne (ex. Codemagic).
- Une **politique de confidentialité** publique (déjà dans l'application : onglet Confidentialité) et la
  **suppression de compte** (déjà présente : RGPD).

Commandes (à lancer une fois, dans le dossier du projet) :
```
npm install @capacitor/core
npm install -D @capacitor/cli @capacitor/android @capacitor/ios
npm run build:couple
npx cap add android
npx cap add ios        # sur Mac uniquement
npx cap sync
npx cap open android   # ouvre Android Studio -> Build -> Generate Signed Bundle
npx cap open ios       # ouvre Xcode -> Product -> Archive
```
Avant : mettre dans `.env.couple` l'adresse réelle de votre serveur (`VITE_API_URL`), et sur le serveur ajouter dans
`ALLOWED_ORIGINS` : `https://localhost,capacitor://localhost`.
Les icônes sources sont dans `public/couple/` (`icon-1024.png` pour les boutiques).

## Points d'attention avant publication
1. **Paiement** : Apple (et Google dans la plupart des cas) imposent leur propre système d'achat intégré pour un
   abonnement numérique, avec une commission (15 à 30 %). Wave / Orange Money ne seront pas acceptés comme moyen
   de paiement *dans* l'application iPhone. Le plus simple : abonnement sur le site, application pour l'usage. À décider
   avant de soumettre.
2. **Connexion Google** : Google bloque la connexion dans une application embarquée. Dans l'application installée,
   utiliser l'inscription e-mail ; la connexion Google native pourra être ajoutée ensuite.
3. **Contenu vidéo** : les boutiques examinent les applications de lecture de vidéos. Fichiers locaux des utilisateurs,
   aucun film hébergé par vous sans droits, et classification d'âge adaptée (16+).
4. Prévoir quelques jours à quelques semaines de validation par Apple et Google.
