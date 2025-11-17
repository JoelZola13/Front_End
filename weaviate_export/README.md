## Weaviate Data Export

This directory contains a raw snapshot of the Weaviate persistence volume that was running on the local development machine.

### How it was collected
1. Determined the active Docker volume (`weaviate_weaviate-data`) by inspecting the running `weaviate` container defined in `docker/weaviate/docker-compose.weaviate.yml`.
2. Ran a temporary Alpine container to copy everything from `/var/lib/weaviate` inside that volume into this repository while preserving the directory structure.

### Contents
- `volume_data/` &mdash; files directly mirrored from the Docker volume (e.g. `schema.db`, `classifications.db`, `raft/`).

### Restoring
To restore this snapshot into a fresh Weaviate volume:
```bash
docker compose -f docker/weaviate/docker-compose.weaviate.yml down
docker run --rm \
  -v weaviate_weaviate-data:/dest \
  -v "$(pwd)/weaviate_export/volume_data":/src \
  alpine sh -c "rm -rf /dest/* && cp -a /src/. /dest"
docker compose -f docker/weaviate/docker-compose.weaviate.yml up -d
```
