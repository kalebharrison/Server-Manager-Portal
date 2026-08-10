#!/bin/sh
set -eu

IMAGE_NAME="${IMAGE_NAME:-server-manager-portal:local}"
CONTAINER_NAME="${CONTAINER_NAME:-server-manager-portal-local}"
PORT="${PORT:-2121}"
HOST_STORAGE="${HOST_STORAGE:-$HOME/Downloads/server-manager-portal}"
JWT_SECRET="${JWT_SECRET:-local-dev-secret-local-dev-secret-1234567890}"

mkdir -p "$HOST_STORAGE/config" "$HOST_STORAGE/backup"

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker build -f docker/Dockerfile --build-arg GIT_SHA=local -t "$IMAGE_NAME" .
docker run -d \
  --name "$CONTAINER_NAME" \
  -p "$PORT:2121" \
  -e JWT_SECRET="$JWT_SECRET" \
  -e CONFIG_DIR=/app/config \
  -e FORCE_SECURE_COOKIES=false \
  -e PUID="${PUID:-1000}" \
  -e PGID="${PGID:-1000}" \
  -v "$HOST_STORAGE/config:/app/config" \
  -v "$HOST_STORAGE/backup:/app/backup" \
  "$IMAGE_NAME"

printf 'Container started: %s\n' "$CONTAINER_NAME"
printf 'Portal URL: http://127.0.0.1:%s\n' "$PORT"
printf 'Storage: %s\n' "$HOST_STORAGE"

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/config/public" >/dev/null 2>&1; then
    printf 'Smoke check passed.\n'
    exit 0
  fi
  sleep 2
done

printf 'Smoke check failed. Recent logs:\n' >&2
docker logs --tail 80 "$CONTAINER_NAME" >&2 || true
exit 1
