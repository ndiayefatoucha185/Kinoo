# Multi-stage Dockerfile pour le déploiement de production autonome de KINOO sur Google Cloud Run
FROM node:22-alpine AS builder

WORKDIR /app

# Copie des fichiers de dépendances
COPY package*.json ./
RUN npm ci

# Copie de l'ensemble du code source
COPY . .

# Déclaration d'arguments de build pour Vite (si fournis)
ARG VITE_SENTRY_DSN
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN

# Construction des bundles de production (client Vite + serveur bundled CJS)
RUN npm run build

# Étape finale d'exécution légère
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copie des dépendances de production uniquement et des fichiers compilés
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts

# Exposition du port 3000 (requis par Cloud Run)
EXPOSE 3000

# Démarrage de l'application
CMD ["node", "dist/server.cjs"]
