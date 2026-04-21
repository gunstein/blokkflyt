#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR=~/source/blokkflyt
DEPLOY_DIR=~/source/blokkflyt/deploy

SERVICES=(blokkflyt-web blokkflyt-server)

echo "=== Pulling latest code ==="
cd "$SOURCE_DIR"
git pull --rebase

echo "=== Building containers ==="
cd "$DEPLOY_DIR"
podman-compose build "${SERVICES[@]}"

echo "=== Recreating containers ==="
podman-compose up -d --force-recreate "${SERVICES[@]}"

echo "=== Pruning old images ==="
podman image prune -f

echo "=== Done ==="
podman-compose ps
