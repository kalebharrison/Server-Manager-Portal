#!/bin/sh
set -e

PUID=${PUID:-1000}
PGID=${PGID:-1000}

# Bind-mounted data dirs must be writable by the run-as user.
mkdir -p /app/config /app/backup

if [ "$(id -u)" = "0" ]; then
  # Root-only: fix ownership/mode on config + backup (not /media).
  chown -R "$PUID:$PGID" /app/config /app/backup
  chmod 700 /app/config /app/backup
  find /app/config /app/backup -type f -exec chmod 600 {} +

  # Drop to PUID:PGID for the app (and child tools: ffmpeg/mkvmerge).
  # Do NOT set Docker Compose `user:` — that breaks su-exec (setgroups: Operation not permitted).
  exec su-exec "$PUID:$PGID" "$@"
fi

# Already non-root (uid already matches PUID, or operator set Docker user:).
# Skip chown; run as-is. Prefer root + PUID/PGID env so config/backup can be fixed on boot.
exec "$@"
