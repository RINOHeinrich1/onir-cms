#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE="$ROOT_DIR/.env.docker"
EXAMPLE_FILE="$ROOT_DIR/.env.docker.example"

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl est requis pour générer les secrets locaux." >&2
  exit 1
fi

if [ -f "$ENV_FILE" ]; then
  echo ".env.docker existe déjà : aucune modification."
  exit 0
fi

cp "$EXAMPLE_FILE" "$ENV_FILE"

CONFIG_MASTER_KEY=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)
LINK_TOKEN_KEY=$(openssl rand -hex 32)
AI_PROVIDER_KEY=$(openssl rand -hex 32)
WEBHOOK_SECRET_KEY=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
ADMIN_PASSWORD="Admin-$(openssl rand -hex 8)"

replace() {
  key=$1
  value=$2
  tmp="$ENV_FILE.tmp"
  sed "s|^${key}=.*|${key}=${value}|" "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
}

replace POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
replace CONFIG_MASTER_KEY "$CONFIG_MASTER_KEY"
replace SESSION_SECRET "$SESSION_SECRET"
replace LINK_TOKEN_KEY "$LINK_TOKEN_KEY"
replace AI_PROVIDER_KEY "$AI_PROVIDER_KEY"
replace WEBHOOK_SECRET_KEY "$WEBHOOK_SECRET_KEY"
replace DEFAULT_ADMIN_PASSWORD "$ADMIN_PASSWORD"

chmod 600 "$ENV_FILE"

echo "Fichier .env.docker généré (non versionné)."
echo "Admin : admin@example.com"
echo "Mot de passe : $ADMIN_PASSWORD"
echo
echo "Démarrer l'environnement :"
echo "  docker compose --env-file .env.docker -f docker-compose.dev.yml up --build"
