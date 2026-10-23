#!/usr/bin/env bash
set -euo pipefail
umask 077

TAG="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE=(docker compose --env-file .env.preprod -f docker-compose.preprod.yml)

die() {
  printf 'ERREUR: %s\n' "$*" >&2
  exit 1
}

[[ -n "${TAG}" ]] || die "usage: deploy.sh <preprod-image-tag>"
[[ "${TAG}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || die "tag invalide: ${TAG}"
[[ -f "${ROOT}/.env.preprod" ]] || die "fichier introuvable: ${ROOT}/.env.preprod"
[[ -f "${ROOT}/docker-compose.preprod.yml" ]] || die "compose preprod introuvable"

cd "${ROOT}"

if grep -q '^PREPROD_IMAGE_TAG=' .env.preprod; then
  sed -i "s/^PREPROD_IMAGE_TAG=.*/PREPROD_IMAGE_TAG=${TAG}/" .env.preprod
else
  printf '\nPREPROD_IMAGE_TAG=%s\n' "${TAG}" >> .env.preprod
fi

APP_PORT="$(grep '^PREPROD_APP_PORT=' .env.preprod | cut -d= -f2- || true)"
APP_PORT="${APP_PORT:-3200}"

printf 'Déploiement preprod %s...\n' "${TAG}"
"${COMPOSE[@]}" pull app migrate
"${COMPOSE[@]}" up -d --remove-orphans

printf 'Attente de la santé applicative...\n'
HEALTHY=0
for _ in $(seq 1 100); do
  if curl -fsS --max-time 5 "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 3
done

if [[ "${HEALTHY}" -ne 1 ]]; then
  "${COMPOSE[@]}" ps >&2 || true
  "${COMPOSE[@]}" logs --tail=100 app migrate >&2 || true
  die "santé applicative indisponible après 300 s"
fi

LANDING_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/")"
PLUGINS_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/plugins")"
PLUGIN_FILE_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/plugins/immersive-4.44.0.onirtech-template")"

[[ "${LANDING_CODE}" == "200" ]] || die "landing HTTP ${LANDING_CODE}"
[[ "${PLUGINS_CODE}" == "200" ]] || die "marketplace HTTP ${PLUGINS_CODE}"
[[ "${PLUGIN_FILE_CODE}" == "200" ]] || die "archive plugin HTTP ${PLUGIN_FILE_CODE}"

APP_ID="$("${COMPOSE[@]}" ps -q app)"
[[ -n "${APP_ID}" ]] || die "conteneur app introuvable"
RUNNING_IMAGE="$(docker inspect --format '{{.Config.Image}}' "${APP_ID}")"

printf '\nPreprod déployée.\n'
printf 'Tag image     : %s\n' "${TAG}"
printf 'Image         : %s\n' "${RUNNING_IMAGE}"
printf 'Health        : OK\n'
printf 'Landing       : HTTP %s\n' "${LANDING_CODE}"
printf 'Marketplace   : HTTP %s\n' "${PLUGINS_CODE}"
printf 'Plugin file   : HTTP %s\n' "${PLUGIN_FILE_CODE}"
"${COMPOSE[@]}" ps
