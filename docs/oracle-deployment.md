# Oracle Cloud Deployment Guide

## Overview

This guide documents deploying Margin Tracker to Oracle Cloud Free Tier alongside an existing Docker Compose stack (n8n, Caddy, etc.).

**Live URL:** https://margintracker.my-oracle-n8n.kozow.com

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Oracle Cloud VM                          │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           my-automation-stack_default network        │    │
│  │                                                      │    │
│  │  ┌─────────┐   ┌──────────────────┐   ┌──────────┐  │    │
│  │  │  Caddy  │   │ margin_frontend  │   │  n8n     │  │    │
│  │  │ :80/443 │   │     (nginx)      │   │  :5678   │  │    │
│  │  └────┬────┘   └────────┬─────────┘   └──────────┘  │    │
│  │       │                 │                            │    │
│  │       │   ┌─────────────┴─────────────┐             │    │
│  │       │   │    margin_pocketbase      │             │    │
│  │       │   │         :8090             │             │    │
│  │       │   └───────────────────────────┘             │    │
│  └───────┴──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## File Locations

| Location | Purpose |
|----------|---------|
| `~/my-automation-stack/` | Main Docker Compose stack (Caddy, n8n, etc.) |
| `~/my-automation-stack/Caddyfile` | Caddy reverse proxy config |
| `~/my-automation-stack/docker-compose.yml` | Main stack services |
| `~/michael/margin-tracker/` | Margin Tracker app (separate compose file) |
| `~/michael/margin-tracker/docker-compose.prod.yml` | Margin Tracker services |

## DNS Configuration

**Provider:** Dynu
**Domain:** my-oracle-n8n.kozow.com

| Subdomain | Type | Points To |
|-----------|------|-----------|
| margintracker | CNAME | my-oracle-n8n.kozow.com |

## Docker Compose Configuration

**File:** `docker-compose.prod.yml`

```yaml
services:
  margin_pocketbase:
    image: adrianmusante/pocketbase:latest
    container_name: margin_pocketbase
    restart: unless-stopped
    volumes:
      - margin_pocketbase_data:/pocketbase

  margin_frontend:
    build:
      context: .
      args:
        VITE_PB_URL: /api
    container_name: margin_frontend
    restart: unless-stopped

volumes:
  margin_pocketbase_data:

networks:
  default:
    name: my-automation-stack_default
    external: true
```

**Key Points:**
- Uses `my-automation-stack_default` network (external) to share with Caddy
- Frontend builds with `VITE_PB_URL: /api` so API calls go through Caddy
- PocketBase data persisted in named volume

## Caddyfile Configuration

**File:** `~/my-automation-stack/Caddyfile`

```caddy
margintracker.my-oracle-n8n.kozow.com {
    handle /api/* {
        reverse_proxy margin_pocketbase:8090
    }

    handle /_/* {
        reverse_proxy margin_pocketbase:8090
    }

    handle {
        reverse_proxy margin_frontend:80
    }
}
```

**Routing:**
- `/api/*` → PocketBase API (port 8090)
- `/_/*` → PocketBase Admin UI (port 8090)
- Everything else → React frontend (nginx, port 80)

**Important:** Use `handle` not `handle_path` to preserve URL paths.

## Deployment Steps

### Initial Deployment

```bash
# 1. Clone the repo
cd ~/michael
git clone https://github.com/dracount/margin-tracker.git
cd margin-tracker

# 2. Start containers
docker compose -f docker-compose.prod.yml up -d --build

# 3. Copy Caddyfile (or manually add the margintracker block)
cp Caddyfile.prod ~/my-automation-stack/Caddyfile

# 4. Reload Caddy
cd ~/my-automation-stack
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile

# 5. Create admin user
docker exec margin_pocketbase /opt/pocketbase/pocketbase superuser create admin@admin.com YOUR_PASSWORD --dir /pocketbase/data
```

### Updating the App

**From local machine (WSL):**
```bash
cd /home/david/michael/Margin_Tracker
# Make changes...
git add . && git commit -m "Your changes" && git push
```

**On Oracle Cloud:**
```bash
cd ~/michael/margin-tracker
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

If Caddyfile changed:
```bash
cp Caddyfile.prod ~/my-automation-stack/Caddyfile
cd ~/my-automation-stack
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

## SSH Access from WSL

**Key location:** `~/.ssh/ssh-key-2025-06-23.key`

```bash
# Manual SSH
ssh -i ~/.ssh/ssh-key-2025-06-23.key ubuntu@80.225.95.183

# Run remote command
ssh -i ~/.ssh/ssh-key-2025-06-23.key ubuntu@80.225.95.183 "command here"
```

## Admin Access

**PocketBase Admin UI:** https://margintracker.my-oracle-n8n.kozow.com/_/

**Create/Update Admin:**
```bash
docker exec margin_pocketbase /opt/pocketbase/pocketbase superuser upsert EMAIL PASSWORD --dir /pocketbase/data
```

## Useful Commands

```bash
# View running containers
docker ps | grep margin

# View logs
docker logs margin_frontend
docker logs margin_pocketbase

# Restart containers
docker restart margin_frontend margin_pocketbase

# Stop containers
cd ~/michael/margin-tracker
docker compose -f docker-compose.prod.yml down

# Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build

# Check network
docker network inspect my-automation-stack_default | grep margin
```

## Troubleshooting

### 502 Bad Gateway
Containers not on same network as Caddy.
```bash
# Check networks
docker network inspect my-automation-stack_default

# Recreate containers
cd ~/michael/margin-tracker
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build
```

### 404 on /_/ (Admin UI)
Caddyfile using `handle_path` instead of `handle`. The `handle_path` directive strips the path prefix.

### Port Already Allocated
Another container using the same port. Margin Tracker should NOT expose ports directly - it uses Caddy.

### SSL Certificate Issues
Caddy handles SSL automatically. If issues occur:
```bash
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

## Backup

**PocketBase Data:**
```bash
# Create backup
docker exec margin_pocketbase tar -czf /tmp/backup.tar.gz -C /pocketbase data
docker cp margin_pocketbase:/tmp/backup.tar.gz ./pocketbase-backup.tar.gz

# Restore backup
docker cp ./pocketbase-backup.tar.gz margin_pocketbase:/tmp/
docker exec margin_pocketbase tar -xzf /tmp/backup.tar.gz -C /pocketbase
docker restart margin_pocketbase
```

## Quick Reference

| Item | Value |
|------|-------|
| App URL | https://margintracker.my-oracle-n8n.kozow.com |
| Admin URL | https://margintracker.my-oracle-n8n.kozow.com/_/ |
| Server IP | 80.225.95.183 |
| SSH User | ubuntu |
| SSH Key | ~/.ssh/ssh-key-2025-06-23.key |
| GitHub Repo | https://github.com/dracount/margin-tracker |
| Network | my-automation-stack_default |
