#!/bin/bash
# Instalado por Terraform. SSM solo puede proporcionar el digest, no comandos arbitrarios.
set -euo pipefail
export AWS_DEFAULT_REGION=us-east-2
registry=603404126514.dkr.ecr.us-east-2.amazonaws.com
repository="$registry/scintilla"
digest="${1:-}"
[[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'Digest inválido' >&2; exit 1; }
exec 9>/run/scintilla-deploy.lock
flock -w 30 9 || { echo 'Ya existe un despliegue activo' >&2; exit 1; }
cloud-init status --wait
systemctl is-active --quiet docker
export DOCKER_CONFIG
DOCKER_CONFIG=$(mktemp -d)
previous=0
new_started=0
cleanup() {
  result=$?
  trap - EXIT
  if (( result != 0 )); then
    docker rm -f scintilla-candidate >/dev/null 2>&1 || true
    if (( new_started == 1 )); then docker rm -f scintilla >/dev/null 2>&1 || true; fi
    if (( previous == 1 )); then
      docker rename scintilla-previous scintilla
      docker start scintilla
      echo 'Se restauró el contenedor anterior; verificar su health.' >&2
    fi
  fi
  rm -rf -- "$DOCKER_CONFIG"
  exit "$result"
}
trap cleanup EXIT
aws ecr get-login-password | docker login --username AWS --password-stdin "$registry"
docker pull "$repository@$digest"
# Comprobación previa en otro puerto; el contenedor actual sigue atendiendo.
docker rm -f scintilla-candidate >/dev/null 2>&1 || true
docker run -d --name scintilla-candidate --label app=scintilla -p 127.0.0.1:18080:8080 "$repository@$digest"
healthy() {
  port=$1
  for i in $(seq 1 30); do
    if curl --fail --silent --max-time 2 "http://127.0.0.1:$port/health" >/dev/null; then return 0; fi
    sleep 2
  done
  return 1
}
healthy 18080 || { docker logs --tail 30 scintilla-candidate; exit 1; }
docker rm -f scintilla-candidate
# Conserva una copia detenida para rollback si falla el nuevo arranque.
if docker container inspect scintilla-previous >/dev/null 2>&1; then
  echo 'Quedó un rollback previo pendiente; revisar antes de desplegar.' >&2
  exit 1
fi
if docker container inspect scintilla >/dev/null 2>&1; then
  docker rename scintilla scintilla-previous
  previous=1
  docker stop --time 15 scintilla-previous
fi
new_started=1
docker run -d --name scintilla --label app=scintilla --restart unless-stopped \
  --log-opt max-size=10m --log-opt max-file=3 \
  -p 127.0.0.1:8080:8080 "$repository@$digest"
healthy 8080 || { docker logs --tail 30 scintilla; exit 1; }
if (( previous == 1 )); then docker rm scintilla-previous; fi
previous=0
printf 'Scintilla disponible en localhost:8080 con %s\n' "$digest"
