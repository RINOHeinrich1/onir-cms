#!/usr/bin/env bash
set -euo pipefail

TAG="${1:?Usage: bluegreen-preprod.sh <image-tag>}"
BASE="/opt/onir-cms-preprod"
COMPOSE="$BASE/docker-compose.preprod.yml"
OVERRIDE="$BASE/docker-compose.bluegreen.yml"
CACHE_OVERRIDE="$BASE/onir-runtime-cache-override.yml"
PLATFORM_OVERRIDE="$BASE/onir-platform-override.yml"
GREEN_PLATFORM_OVERRIDE="$BASE/onir-platform-green-override.yml"
ENV_FILE="$BASE/.env.preprod"
UPSTREAM="/etc/nginx/conf.d/onir-preprod-upstream.conf"
VHOST="/etc/nginx/sites-enabled/preprod-cms.onirtech.com.conf"
PROJECT="onir-cms-preprod"

compose() {
  local -a args=(-p "$PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE" -f "$OVERRIDE")
  if [ -f "$PLATFORM_OVERRIDE" ]; then
    args+=(-f "$PLATFORM_OVERRIDE")
  fi
  if [ -f "$GREEN_PLATFORM_OVERRIDE" ]; then
    args+=(-f "$GREEN_PLATFORM_OVERRIDE")
  fi
  if [ -f "$CACHE_OVERRIDE" ]; then
    args+=(-f "$CACHE_OVERRIDE")
  fi
  docker compose "${args[@]}" "$@"
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

# ADR-0094 : active le cache runtime et le hot set LRU en préprod.
# Le Valkey local de préprod est le service onir-valkey-test de l'hôte.
cat > "$CACHE_OVERRIDE" <<YAML
services:
  app:
    environment:
      RUNTIME_CACHE_ENABLED: "true"
      RUNTIME_CACHE_URL: "redis://onir-valkey-test:6379"
      RUNTIME_CACHE_HOT_LINKS: "30"
      RUNTIME_CACHE_WARM_INTERVAL_MS: "300000"
      BILLING_API_URL: "https://preprod-backoffice.onir-cms.tech"
      BILLING_PORTAL_URL: "https://preprod-backoffice.onir-cms.tech/espace-client"
  app-green:
    environment:
      RUNTIME_CACHE_ENABLED: "true"
      RUNTIME_CACHE_URL: "redis://onir-valkey-test:6379"
      RUNTIME_CACHE_HOT_LINKS: "30"
      RUNTIME_CACHE_WARM_INTERVAL_MS: "300000"
      BILLING_API_URL: "https://preprod-backoffice.onir-cms.tech"
      BILLING_PORTAL_URL: "https://preprod-backoffice.onir-cms.tech/espace-client"
YAML

# Le fichier de secrets plateforme ne cible que le service `app` ; le slot
# blue-green `app-green` doit recevoir les mêmes variables pour l'API S2S.
if [ -f "$PLATFORM_OVERRIDE" ]; then
  python3 - "$PLATFORM_OVERRIDE" "$GREEN_PLATFORM_OVERRIDE" <<'PY'
import re
import sys

source = open(sys.argv[1], encoding="utf-8").read()
key = re.search(r'PLATFORM_API_KEY:\s*"([^"]+)"', source)
user = re.search(r'PLATFORM_API_USER_ID:\s*"([^"]+)"', source)
if key and user:
    with open(sys.argv[2], "w", encoding="utf-8") as output:
        output.write(
            "services:\n  app-green:\n    environment:\n"
            f'      PLATFORM_API_KEY: "{key.group(1)}"\n'
            f'      PLATFORM_API_USER_ID: "{user.group(1)}"\n'
        )
PY
fi

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

# Le premier serveur de l'upstream est l'actif, le second porte `backup`.
# L'ancienne détection testait la simple présence de 3200 : comme les deux
# serveurs sont toujours déclarés, elle considérait 3200 comme actif en
# permanence et ne mettait jamais à jour ce slot.
if nginx_fs grep -q '127.0.0.1:3200.*backup' "$UPSTREAM"; then
  ACTIVE=3201; TARGET=3200; SERVICE=app
else
  ACTIVE=3200; TARGET=3201; SERVICE=app-green
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
