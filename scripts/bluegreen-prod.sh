#!/usr/bin/env bash
set -euo pipefail

TAG="${1:?Usage: bluegreen-prod.sh <version>}"
NODE1_KEY="${NODE1_KEY:-$HOME/.ssh/prod_node1}"
NODE2_KEY="${NODE2_KEY:-$HOME/.ssh/prod_node2}"
LB_KEY="${LB_KEY:-$HOME/.ssh/prod_haproxy}"
NODE1_USER="${NODE1_USER:-ubuntu}"
NODE2_USER="${NODE2_USER:-onir-temp}"
LB_USER="${LB_USER:-onir-temp}"
NODE1_HOST="${NODE1_HOST:-141.94.213.19}"
NODE2_HOST="${NODE2_HOST:-167.114.66.243}"
LB_HOST="${LB_HOST:-51.38.83.166}"
IMAGE="ghcr.io/rinoheinrich1/onir-cms:${TAG}"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o BatchMode=yes)

ssh1() { ssh -i "$NODE1_KEY" "${SSH_OPTS[@]}" "${NODE1_USER}@${NODE1_HOST}" "$@"; }
ssh2() { ssh -i "$NODE2_KEY" "${SSH_OPTS[@]}" "${NODE2_USER}@${NODE2_HOST}" "$@"; }
ssh_lb() { ssh -i "$LB_KEY" "${SSH_OPTS[@]}" "${LB_USER}@${LB_HOST}" "$@"; }

wait_health() {
  local host="$1" port="$2" label="$3"
  for attempt in $(seq 1 60); do
    if [ "$host" = "node1" ]; then
      if ssh1 "curl -fsS http://127.0.0.1:${port}/api/health" >/dev/null 2>&1; then return 0; fi
    else
      if ssh2 "curl -fsS http://127.0.0.1:${port}/api/health" >/dev/null 2>&1; then return 0; fi
    fi
    sleep 2
  done
  echo "[prod-bluegreen] healthcheck KO: ${label} (${port})" >&2
  return 1
}

active_node1="$(ssh_lb "sudo grep -q 'server node1-green .* weight 100' /etc/haproxy/haproxy.cfg" && echo green || echo blue)"
active_node2="$(ssh_lb "sudo grep -q 'server node2-green .* weight 100' /etc/haproxy/haproxy.cfg" && echo green || echo blue)"

if [ "$active_node1" = "green" ]; then
  target_node1="blue"; port_node1=3101; source_container="onir-cms-app-node1-green"
else
  target_node1="green"; port_node1=3102; source_container="onir-cms-app-node1-blue"
fi
if [ "$active_node2" = "green" ]; then
  target_node2="app"; port_node2=3000; slot_node2="blue"
else
  target_node2="app-green"; port_node2=3001; slot_node2="green"
fi

echo "[prod-bluegreen] node1 ${active_node1} -> ${target_node1}; node2 ${active_node2} -> ${target_node2}"

# Node 1 : récupérer l'environnement de l'instance active et démarrer le slot inactif.
local_env="$(mktemp)"
ssh1 "sudo docker inspect ${source_container} --format '{{range .Config.Env}}{{println .}}{{end}}'" > "$local_env"
sed -i "s/^ONIR_CMS_VERSION=.*/ONIR_CMS_VERSION=${TAG}/" "$local_env"
chmod 600 "$local_env"
remote_env="/tmp/onir-prod-node1-${TAG}.env"
ssh1 "sudo tee ${remote_env} >/dev/null" < "$local_env"
ssh1 "sudo docker pull '${IMAGE}' >/dev/null"
ssh1 "sudo docker rm -f onir-cms-app-node1-${target_node1} >/dev/null 2>&1 || true"
ssh1 "sudo docker run -d --name onir-cms-app-node1-${target_node1} --restart unless-stopped --network onir-cms-node1_default -p 0.0.0.0:${port_node1}:3000 --env-file ${remote_env} '${IMAGE}' >/dev/null"
ssh1 "sudo rm -f ${remote_env}"
rm -f "$local_env"
wait_health node1 "$port_node1" "node1-${target_node1}"

# Node 2 : mise à jour de l'environnement et du slot inactif.
ssh2 "sudo sed -i 's/^ONIR_CMS_VERSION=.*/ONIR_CMS_VERSION=${TAG}/' /opt/onir-cms/.env.release"
ssh2 "sudo docker compose -p onir-cms-node --env-file /opt/onir-cms/.env.release -f /opt/onir-cms/docker-compose.node.yml -f /opt/onir-cms/docker-compose.bluegreen.yml pull ${target_node2} migrate >/dev/null"
ssh2 "sudo docker compose -p onir-cms-node --env-file /opt/onir-cms/.env.release -f /opt/onir-cms/docker-compose.node.yml -f /opt/onir-cms/docker-compose.bluegreen.yml run --rm migrate >/dev/null"
ssh2 "sudo docker compose -p onir-cms-node --env-file /opt/onir-cms/.env.release -f /opt/onir-cms/docker-compose.node.yml -f /opt/onir-cms/docker-compose.bluegreen.yml up -d --no-deps ${target_node2} >/dev/null"
wait_health node2 "$port_node2" "node2-${target_node2}"

# Bascule HAProxy, nœud par nœud.
for spec in "node1 ${target_node1}" "node2 ${slot_node2}"; do
  set -- $spec
  node="$1"; slot="$2"
  ssh_lb "sudo python3 - ${node} ${slot}" <<'PY'
import re, sys
from pathlib import Path
node, slot = sys.argv[1], sys.argv[2]
p = Path('/etc/haproxy/haproxy.cfg')
lines = p.read_text().splitlines()
for i, line in enumerate(lines):
    m = re.match(r'(\s*server )(' + re.escape(node) + r'-(blue|green)\b.*?weight )(\d+)(.*)', line)
    if not m:
        continue
    active = m.group(3) == slot
    lines[i] = f"{m.group(1)}{m.group(2)}{'100' if active else '0'}{m.group(5)}"
p.write_text('\n'.join(lines) + '\n')
PY
  ssh_lb "sudo haproxy -c -f /etc/haproxy/haproxy.cfg >/dev/null && sudo systemctl reload haproxy"
done

curl -fsS "https://magic-panel.onir-cms.tech/api/health" >/dev/null
echo "[prod-bluegreen] ${TAG} actif sur node1:${port_node1} et node2:${port_node2}"
