# Setup & Deployment Guide

## Docker Environment
The application is designed to run in a containerized environment using Docker Compose.

### `docker-compose.yml` Services
1. **PocketBase (`pb_margins`):**
   - Image: `adrianmusante/pocketbase:latest`
   - Port: `8090`
   - Volume: `pocketbase_data:/pocketbase` (Contains `data/data.db`)
2. **Caddy:**
   - Reverse proxy for routing traffic.

### Persistence
The data is persisted using a Docker named volume `pocketbase_data`. This ensures that your customers, styles, and settings are not lost when the container is stopped or removed.

## Troubleshooting

### Login Issues
If you cannot log into the Admin UI:
1. Ensure the container is running: `docker ps`
2. Manually create/update a superuser:
   ```bash
   docker exec pb_margins /opt/pocketbase/pocketbase superuser upsert admin@admin.com password --dir /pocketbase/data
   ```

### Permission Denied (WSL2)
If you encounter filesystem permission errors, ensure you are using **Named Volumes** instead of Bind Mounts for the database directory, as WSL2/Windows permissions can conflict with Linux container permissions.

### Service Connectivity
If the frontend cannot connect to PocketBase:
- Check `src/lib/pocketbase.ts` to ensure the `baseUrl` matches your environment (default is `http://127.0.0.1:8090`).
- Ensure the PocketBase container has started successfully: `docker logs pb_margins`.
