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
  docker compose -p "$PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE" -f "$OVERRIDE" "$@"
}

# Les fichiers nginx appartiennent à root : on les manipule via un conteneur
# root monté sur /etc/nginx, sans dépendre de sudo sur le runner.
nginx_fs() {
  docker run --rm -v /etc/nginx:/etc/nginx alpine:3.20 "$@"
}

nginx_host() {
  docker run --rm --privileged --pid=host -v /:/host alpine:3.20 chroot /host /usr/sbin/nginx "$@"
}

write_upstream() {
  local active="$1" target="$2"
  printf 'upstream onir_preprod_app {\n    server 127.0.0.1:%s max_fails=2 fail_timeout=10s;\n    server 127.0.0.1:%s backup;\n    keepalive 16;\n}\n' "$target" "$active" \
    | docker run --rm -i -v /etc/nginx:/etc/nginx alpine:3.20 sh -c 'cat > /etc/nginx/conf.d/onir-preprod-upstream.conf'
}

if ! grep -q '!override' "$OVERRIDE" 2>/dev/null; then
  cat > "$OVERRIDE" <<YAML
services:
  app-green:
    extends:
      file: $COMPOSE
      service: app
    ports: !override
      - "127.0.0.1:3201:3000"
YAML
fi

if ! nginx_fs test -f "$UPSTREAM"; then
  write_upstream 3200 3201
fi

if nginx_fs grep -q "127.0.0.1:320[01]" "$VHOST"; then
  nginx_fs cp "$VHOST" "${VHOST}.bak-bluegreen-$(date -u +%Y%m%dT%H%M%SZ)"
  nginx_fs sed -i -E 's#http://127\.0\.0\.1:320[01]#http://onir_preprod_app#g' "$VHOST"
  nginx_host -t
  nginx_host -s reload
fi

if nginx_fs grep -q 'server 127.0.0.1:3200' "$UPSTREAM"; then
  ACTIVE=3200; TARGET=3201; SERVICE=app-green
else
  ACTIVE=3201; TARGET=3200; SERVICE=app
fi

echo "[bluegreen] ${ACTIVE} -> ${TARGET} (${TAG})"

sed -i "s/^PREPROD_IMAGE_TAG=.*/PREPROD_IMAGE_TAG=${TAG}/" "$ENV_FILE"

compose pull "$SERVICE"
compose run --rm migrate
compose up -d --no-deps "$SERVICE"

for attempt in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${TARGET}/api/health" >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    echo "[bluegreen] sante KO sur ${TARGET}, bascule annulee" >&2
    exit 1
  fi
  sleep 2
done

write_upstream "$ACTIVE" "$TARGET"
nginx_host -t
nginx_host -s reload

curl -fsS "https://preprod-cms.onirtech.com/api/health" >/dev/null
echo "[bluegreen] actif sur ${TARGET}, ${ACTIVE} conserve en secours"
