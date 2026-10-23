# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22

# Base commune : Node 22 (aligné sur .nvmrc).
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# Dépendances applicatives (avec devDependencies pour le build et les outils).
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Outils de développement : tests et diagnostic.
FROM deps AS tools
COPY . .

# Build Next.js + bundle autonome du CLI de base de données.
FROM deps AS builder
ENV NODE_ENV=production
ENV APP_URL=http://localhost:3000
COPY . .
RUN npm run build && npm run build:db-cli && rm -rf .next/cache

# Dépendances de production uniquement.
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Dépendances minimales du CLI de migration (uniquement `pg`).
FROM base AS migrate-deps
COPY docker/db/package.json docker/db/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Image de migration : CLI compilé + migrations SQL, sans code source lisible.
FROM base AS migrate
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="ONIR CMS — migrations"
LABEL org.opencontainers.image.description="Migrations et seed PostgreSQL d'ONIR CMS"
LABEL org.opencontainers.image.source="https://github.com/RINOHeinrich1/onir-cms"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.revision="${REVISION}"
ENV NODE_ENV=production
COPY --from=migrate-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
USER node
CMD ["node", "dist/db-cli.mjs", "migrate-and-seed"]

# Image d'exécution : build immuable, sans sources ni devDependencies.
FROM base AS runner
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="ONIR CMS"
LABEL org.opencontainers.image.description="CMS open source de prospection et de conversation assistée par IA"
LABEL org.opencontainers.image.source="https://github.com/RINOHeinrich1/onir-cms"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.revision="${REVISION}"
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json next.config.ts ./

RUN mkdir -p /app/var/media && chown -R node:node /app/var
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["./node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
