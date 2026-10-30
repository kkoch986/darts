#!/usr/bin/env bash
set -euo pipefail

# Build and push the darts backend & frontend images to Docker Hub.
# Usage:   bash build-push-darts.sh [username]

USERNAME="${1:-kkoch986}"
BACKEND_TAG="docker.io/${USERNAME}/darts-backend:latest"
FRONTEND_TAG="docker.io/${USERNAME}/darts-frontend:latest"

echo "Building and pushing images for user: $USERNAME"

if [ ! -d "backend/Dockerfile" ] && [ ! -f "backend/Dockerfile" ]; then
  echo "ERROR: not a darts repo (no backend/Dockerfile)" >&2
  exit 1
fi

echo "==> Building backend"
docker build -f ./backend/Dockerfile -t "$BACKEND_TAG" ./backend

echo "==> Building frontend (DARTS_BACKEND_HOST=darts-backend)"
docker build \
  --build-arg DARTS_BACKEND_HOST=darts-backend \
  -f ./frontend/Dockerfile \
  -t "$FRONTEND_TAG" \
  ./frontend

echo "==> Pushing $BACKEND_TAG"
docker push "$BACKEND_TAG"

echo "==> Pushing $FRONTEND_TAG"
docker push "$FRONTEND_TAG"

echo
echo "Done. Images pushed:"
echo "  $BACKEND_TAG"
echo "  $FRONTEND_TAG"
