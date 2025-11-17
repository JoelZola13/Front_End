## Weaviate Compose Configuration

- **File:** `docker-compose.weaviate.yml`
- **Image:** `semitechnologies/weaviate:1.25.3` (the version used during the latest embedding + export run).

This compose file is copied directly from the Street_Bot repo so you can recreate the exact Weaviate setup elsewhere. It mounts the persistent volume (`weaviate_weaviate-data`) and exposes HTTP `8090` + gRPC `50051`, matching the environment that produced the `weaviate_export` snapshot.

To start it manually:
```bash
docker compose -f docker-compose.weaviate.yml up -d
```

Remember to set `OPENAI_APIKEY` in the environment before bringing it up if you want to use the `text2vec-openai` module.
