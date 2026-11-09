#!/usr/bin/env bash
set -euo pipefail

TARGET="/usr/share/nginx/xiamuclub-backend-platform/console"
BACKUP_BASE="/usr/share/nginx/xiamuclub-backend-platform"
ARCHIVE_PATH="${1:-/tmp/dist-console-upload-latest.tar}"
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP="${BACKUP_BASE}/console-backup-${TS}"

mkdir -p "${TARGET}"
cp -a "${TARGET}" "${BACKUP}"
find "${TARGET}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
tar -xf "${ARCHIVE_PATH}" -C "${TARGET}"
rm -f "${ARCHIVE_PATH}"

echo "backup:${BACKUP}"
ls -1 "${TARGET}/assets"/useCommon*.js
stat -c '%y' "${TARGET}/index.html"
