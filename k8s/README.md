# Darts Deployment

Run the Darts app on a container host (Docker / docker-compose) or a Kubernetes
cluster.

## Components

- **backend** — Go API on `:8080`, serves only `/api/*`. SQLite DB at
  `DARTS_DB_PATH` (default `/data/darts.db`).
- **frontend** — Vite/React SPA, built to static files and served by nginx.
  nginx proxies `/api/*` to the backend.

## Docker

Build and run with docker compose:

```sh
docker compose up -d --build
```

- Frontend: http://localhost:8081
- Backend API:  http://localhost:8080/api

The SQLite DB persists in the `darts-data` Docker volume.

### Building images manually

Backend:

```sh
docker build -t darts-backend:latest ./backend
```

Frontend (set the backend host with a build/runtime arg — nginx substitutes it
via envsubst at container start):

```sh
docker build \
  --build-arg DARTS_BACKEND_HOST=darts-backend \
  -t darts-frontend:latest ./frontend

# Override at runtime (no rebuild needed):
docker run -e DARTS_BACKEND_HOST=10.0.0.5 -p 8081:80 darts-frontend:latest
```

## Kubernetes

All manifests live in `k8s/`. Apply them with kustomize or kubectl:

```sh
kubectl apply -k k8s/
```

Or apply individually in dependency order:

```sh
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/backend-pvc.yaml
kubectl apply -f k8s/backend.yaml     # deployment + service
kubectl apply -f k8s/frontend.yaml    # deployment + service
kubectl apply -f k8s/ingress.yaml
```

### Before you deploy — things to edit

| File | What to change |
|------|----------------|
| `k8s/backend.yaml`, `k8s/frontend.yaml` | `image:` — point at your registry, not `:latest` local tag. |
| `k8s/ingress.yaml` | `host:` value, `ingressClassName`, TLS options. |
| `k8s/backend-pvc.yaml` | `storageClassName:` to match your cluster (or leave default). |

### Notes / gotchas

- **SQLite is a single-file, single-writer database.** Keep the backend at
  `replicas: 1` and use a node-local or POSIX-locking volume (local-path,
  OpenEBS LocalPV, or hostPath). Network filesystems without proper file
  locking (NFS, some CephFS configs) can corrupt or lock the DB.
- If your storage class provides no node affinity, pin the backend to a node or
  use a storage class with `ReadWriteOnce` semantics on a single node.
- The backend runs as UID `65532`. The PVC is created by the storage provisioner;
  if your provisioner mounts volumes as root without a `fsGroup`, add under the
  container `securityContext: { fsGroup: 65532 }` to ensure write access.
- Frontend is stateless — safe to scale to multiple replicas.

### Updating images

kubectl (roll out after pushing a new image tag):

```sh
kubectl -n darts rollout restart deployment/darts-backend
kubectl -n darts rollout restart deployment/darts-frontend
```
