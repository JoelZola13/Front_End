## Weaviate Data Export

This directory contains a raw snapshot of the Weaviate persistence volume after re-ingesting the StreetVoices chunks (≈3.8k objects).

### How it was collected
1. Confirmed ingestion via `scripts/ingest_weaviate.py` (`Weaviate total objects: 3830`).
2. Stopped the container: `docker compose -f docker/weaviate/docker-compose.weaviate.yml down`.
3. Copied the `weaviate_weaviate-data` volume with a temporary Alpine container:
   ```bash
   docker run --rm \
     -v weaviate_weaviate-data:/src \
     -v "$(pwd)/weaviate_export/volume_data":/dest \
     alpine sh -c "cd /src && cp -a . /dest && chown -R 1000:1000 /dest"
   ```

### Contents
- `volume_data/schema.db`, `classifications.db`, `modules.db`, `raft/raft.db`, and the per-class directories (e.g., `servicechunks/MXQxlG4ieakF/...`) that include the vector index and payload files.

### Restoring
On any machine with the same docker-compose setup:
```bash
docker compose -f docker/weaviate/docker-compose.weaviate.yml down
docker run --rm \
  -v weaviate_weaviate-data:/dest \
  -v "$(pwd)/weaviate_export/volume_data":/src \
  alpine sh -c "rm -rf /dest/* && cp -a /src/. /dest"
docker compose -f docker/weaviate/docker-compose.weaviate.yml up -d
```
