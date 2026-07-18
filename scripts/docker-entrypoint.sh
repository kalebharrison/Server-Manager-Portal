#!/bin/sh
set -e

PUID=${PUID:-1000}
PGID=${PGID:-1000}

# Ensure bind-mounted data dirs are writable for the run-as user.
mkdir -p /app/config /app/backup
chown -R "$PUID:$PGID" /app/config /app/backup
chmod 700 /app/config /app/backup
find /app/config /app/backup -type f -exec chmod 600 {} +

exec su-exec "$PUID:$PGID" "$@"
