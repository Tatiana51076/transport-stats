#!/usr/bin/env bash
# ============================================================
# Ежедневный бэкап базы данных приложения.
# Ставится в cron:  0 3 * * * /opt/transport-stats/scripts/backup.sh
# Хранит последние 14 копий, старые удаляются автоматически.
# ============================================================
set -euo pipefail

# Папка для бэкапов (создаётся автоматически)
BACKUP_DIR="/var/backups/transport"

# Строка подключения берётся из .env проекта
ENV_FILE="/opt/transport-stats/.env"
DATABASE_URL="postgres://postgres:pgpass123@localhost:5432/transport"
if [ -f "$ENV_FILE" ]; then
  DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' || true)
fi

mkdir -p "$BACKUP_DIR"
TS=$(date +%Y%m%d_%H%M%S)
DUMP="$BACKUP_DIR/transport_$TS.dump"

# pg_dump в сжатом формате (custom)
pg_dump "$DATABASE_URL" --format=custom --file="$DUMP"

# Ротация: оставляем последние 14 копий
ls -1t "$BACKUP_DIR"/transport_*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f

echo "$(date -Is) backup ok: $DUMP"
