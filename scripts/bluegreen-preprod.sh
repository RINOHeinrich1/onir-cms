#!/usr/bin/env bash
set -euo pipefail

TAG="${1:?Usage: bluegreen-preprod.sh <image-tag>}"
BASE="/opt/onir-cms-preprod"
COMPOSE="$BASE/docker-compose.preprod.yml"
OVERRIDE="$BASE/docker-compose.bluegreen.yml"
ENV_FILE="$BASE/.env.preprod"
UPSTREAM="/etc/nginx/conf.d/onir-preprod-upstream.conf"
VHOST="/etc/nginx/sites-enabled/preprod-cms.onirtech.com.conf"
PROJECT="onir-cms-preprod"

compose() {
  sudo docker compose -p "$PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE" -f "$OVERRIDE" "$@"
}

# Le service vert réutilise exactement la définition du service bleu.
if [ ! -f "$OVERRIDE" ]; then
  sudo tee "$OVERRIDE" >/dev/null <<YAML
services:
  app-green:
    extends:
      file: $COMPOSE
      service: app
    ports:
      - "127.0.0.1:3201:3000"
YAML
fi

# Première installation : nginx passe par un upstream nommé, avec le bleu actif.
if [ ! -f "$UPSTREAM" ]; then
  sudo tee "$UPSTREAM" >/dev/null <<'NGINX'
upstream onir_preprod_app {
    server 127.0.0.1:3200 max_fails=2 fail_timeout=10s;
    server 127.0.0.1:3201 backup;
    keepalive 16;
}
NGINX
fi
if grep -q "127.0.0.1:320[01]" "$VHOST"; then
  sudo cp "$VHOST" "${VHOST}.bak-bluegreen-$(date -u +%Y%m%dT%H%M%SZ)"
  sudo sed -i -E 's#http://127\.0\.0\.1:320[01]#http://onir_preprod_app#g' "$VHOST"
  sudo nginx -t
  sudo systemctl reload nginx
fi

if grep -q 'server 127.0.0.1:3200;' "$UPSTREAM"; then
  ACTIVE=3200; TARGET=3201; SERVICE=app-green
else
  ACTIVE=3201; TARGET=3200; SERVICE=app
fi

echo "[bluegreen] ${ACTIVE} → ${TARGET} (${TAG})"

sudo sed -i "s/^PREPROD_IMAGE_TAG=.*/PREPROD_IMAGE_TAG=${TAG}/" "$ENV_FILE"

compose pull "$SERVICE"
compose run --rm migrate
compose up -d --no-deps "$SERVICE"

for attempt in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${TARGET}/api/health" >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    echo "[bluegreen] santé KO sur ${TARGET}, bascule annulée" >&2
    exit 1
  fi
  sleep 2
done

sudo tee "$UPSTREAM" >/dev/null <<NGINX
upstream onir_preprod_app {
    server 127.0.0.1:${TARGET} max_fails=2 fail_timeout=10s;
    server 127.0.0.1:${ACTIVE} backup;
    keepalive 16;
}
NGINX
sudo nginx -t
sudo systemctl reload nginx

curl -fsS "https://preprod-cms.onirtech.com/api/health" >/dev/null
echo "[bluegreen] actif sur ${TARGET}, ${ACTIVE} conservé en secours"
