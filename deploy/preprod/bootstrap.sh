#!/usr/bin/env bash
set -euo pipefail
umask 077

DOMAIN="${PREPROD_DOMAIN:-preprod-cms.onirtech.com}"
ROOT="/opt/onir-cms-preprod"
DEPLOY_USER="deploy-preprod"
SECRETS_FILE="${PREPROD_SECRETS_FILE:-/tmp/opencode/onir-cms-preprod-secrets.env}"
PUBKEY_FILE="${PREPROD_PUBKEY_FILE:-/tmp/opencode/onir-cms-preprod-deploy.pub}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-admin@onirtech.com}"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}.conf"
NGINX_LINK="/etc/nginx/sites-enabled/${DOMAIN}.conf"
AUTH_FILE="/etc/nginx/onir-cms-preprod.htpasswd"

die() {
  printf 'ERREUR: %s\n' "$*" >&2
  exit 1
}

[[ "${EUID}" -eq 0 ]] || die "ce script doit être lancé avec sudo"
[[ -f "${SECRETS_FILE}" ]] || die "fichier de secrets introuvable: ${SECRETS_FILE}"
[[ -f "${PUBKEY_FILE}" ]] || die "clé publique introuvable: ${PUBKEY_FILE}"
for cmd in docker nginx certbot openssl useradd usermod; do
  command -v "${cmd}" >/dev/null 2>&1 || die "commande requise absente: ${cmd}"
done

# shellcheck disable=SC1090
source "${SECRETS_FILE}"
for key in POSTGRES_PASSWORD SESSION_SECRET LINK_TOKEN_KEY AI_PROVIDER_KEY DEFAULT_ADMIN_PASSWORD PREPROD_BASIC_USER PREPROD_BASIC_PASSWORD; do
  [[ -n "${!key:-}" ]] || die "variable manquante dans ${SECRETS_FILE}: ${key}"
done

if ! id -u "${DEPLOY_USER}" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "${DEPLOY_USER}"
fi
usermod -aG docker "${DEPLOY_USER}"
passwd -l "${DEPLOY_USER}" >/dev/null 2>&1 || true

install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
AUTH_KEYS="/home/${DEPLOY_USER}/.ssh/authorized_keys"
touch "${AUTH_KEYS}"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "${AUTH_KEYS}"
chmod 600 "${AUTH_KEYS}"
if ! grep -qF "$(cat "${PUBKEY_FILE}")" "${AUTH_KEYS}"; then
  cat "${PUBKEY_FILE}" >> "${AUTH_KEYS}"
fi

install -d -m 755 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${ROOT}"
install -m 644 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${SCRIPT_DIR}/docker-compose.preprod.yml" "${ROOT}/docker-compose.preprod.yml"
install -m 750 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${SCRIPT_DIR}/deploy.sh" "${ROOT}/deploy.sh"
install -d -m 755 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${ROOT}/init"
install -m 644 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${SCRIPT_DIR}/init/000-extensions.sql" "${ROOT}/init/000-extensions.sql"

cat > "${ROOT}/.env.preprod" <<EOF
PREPROD_IMAGE=ghcr.io/rinoheinrich1/onir-cms
PREPROD_IMAGE_TAG=${PREPROD_INITIAL_IMAGE_TAG:-0.3.0}
PREPROD_APP_PORT=${PREPROD_APP_PORT:-3200}
PREPROD_DB_PORT=${PREPROD_DB_PORT:-5436}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
SESSION_SECRET=${SESSION_SECRET}
LINK_TOKEN_KEY=${LINK_TOKEN_KEY}
AI_PROVIDER_KEY=${AI_PROVIDER_KEY}
DEFAULT_ADMIN_EMAIL=${PREPROD_ADMIN_EMAIL:-preprod-admin@onirtech.com}
DEFAULT_ADMIN_PASSWORD=${DEFAULT_ADMIN_PASSWORD}
APP_URL=https://${DOMAIN}
AI_API_TOKEN=
AI_PRODUCT_ID=
AI_MODEL=${PREPROD_AI_MODEL:-Qwen/Qwen3.5-122B-A10B-FP8}
EOF
chown "${DEPLOY_USER}:${DEPLOY_USER}" "${ROOT}/.env.preprod"
chmod 600 "${ROOT}/.env.preprod"

printf '%s:%s\n' "${PREPROD_BASIC_USER}" "${PREPROD_BASIC_PASSWORD}" > "${ROOT}/.preprod-auth"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "${ROOT}/.preprod-auth"
chmod 600 "${ROOT}/.preprod-auth"

BASIC_HASH="$(openssl passwd -apr1 "${PREPROD_BASIC_PASSWORD}")"
printf '%s:%s\n' "${PREPROD_BASIC_USER}" "${BASIC_HASH}" > "${AUTH_FILE}"
NGINX_GROUP="$(id -gn www-data 2>/dev/null || printf 'root')"
chown "root:${NGINX_GROUP}" "${AUTH_FILE}"
chmod 640 "${AUTH_FILE}"

install -d -m 755 /var/www/html

cat > "${NGINX_SITE}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 404;
    }
}
EOF
ln -sfn "${NGINX_SITE}" "${NGINX_LINK}"
nginx -t
systemctl reload nginx

if [[ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
  certbot certonly --webroot -w /var/www/html -d "${DOMAIN}" \
    --non-interactive --agree-tos --email "${CERTBOT_EMAIL}" --keep-until-expiring
fi

sed \
  -e "s|__DOMAIN__|${DOMAIN}|g" \
  -e "s|__APP_PORT__|${PREPROD_APP_PORT:-3200}|g" \
  -e "s|__AUTH_FILE__|${AUTH_FILE}|g" \
  "${SCRIPT_DIR}/nginx.preprod.conf.template" > "${NGINX_SITE}"
nginx -t
systemctl reload nginx

sudo -u "${DEPLOY_USER}" bash -lc "cd '${ROOT}' && ./deploy.sh '${PREPROD_INITIAL_IMAGE_TAG:-0.3.0}'"

printf '\nPreprod initialisée.\n'
printf 'URL              : https://%s\n' "${DOMAIN}"
printf 'Admin email      : %s\n' "${PREPROD_ADMIN_EMAIL:-preprod-admin@onirtech.com}"
printf 'Admin password   : %s/.env.preprod (clé DEFAULT_ADMIN_PASSWORD)\n' "${ROOT}"
printf 'Basic auth       : %s/.preprod-auth\n' "${ROOT}"
printf 'Déploiement auto : activer la variable GitHub PREPROD_ENABLED puis pousser sur main.\n'
