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
| Backup Cron | Daily at 2:00 AM |

## Credentials

**App Login:**
- Email: `davidsevel@gmail.com`
- Password: `password`

**PocketBase Admin Panel:**
- URL: https://margintracker.my-oracle-n8n.kozow.com/_/
- Email: `davidsevel@gmail.com`
- Password: `password`

## File Locations

| Location | Purpose |
|----------|---------|
| `~/my-automation-stack/` | Main Docker Compose stack (Caddy, n8n, etc.) |
| `~/my-automation-stack/Caddyfile` | Caddy reverse proxy config |
| `~/my-automation-stack/docker-compose.yml` | Main stack services |
| `~/michael/margin-tracker/` | Margin Tracker app (separate compose file) |
| `~/michael/margin-tracker/docker-compose.prod.yml` | Margin Tracker services |
| `~/michael/margin-tracker/backups/` | Daily backup files |

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
- Frontend auto-detects URL at runtime (uses `window.location.origin` in production)
- PocketBase data persisted in named volume `margin-tracker_margin_pocketbase_data`

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

**Or run remotely from WSL:**
```bash
ssh -i ~/.ssh/ssh-key-2025-06-23.key ubuntu@80.225.95.183 "cd ~/michael/margin-tracker && git pull && docker compose -f docker-compose.prod.yml up -d --build"
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

## Migrating Database from Local

To copy the local PocketBase database to Oracle:

```bash
# 1. Export local database
docker cp pb_margins:/pocketbase/data /tmp/pb_export
tar -czf /tmp/pb_export.tar.gz -C /tmp pb_export

# 2. Upload to Oracle
scp -i ~/.ssh/ssh-key-2025-06-23.key /tmp/pb_export.tar.gz ubuntu@80.225.95.183:/tmp/

# 3. On Oracle: Stop PocketBase, replace data, restart
ssh -i ~/.ssh/ssh-key-2025-06-23.key ubuntu@80.225.95.183 "
  docker stop margin_pocketbase
  docker run --rm -v margin-tracker_margin_pocketbase_data:/pocketbase alpine sh -c 'rm -rf /pocketbase/data/*'
  cd /tmp && tar -xzf pb_export.tar.gz
  docker run --rm -v margin-tracker_margin_pocketbase_data:/pocketbase -v /tmp/pb_export:/import alpine sh -c 'cp -r /import/* /pocketbase/data/ && chmod -R 777 /pocketbase/data'
  docker start margin_pocketbase
"
```

## Admin Access

**PocketBase Admin UI:** https://margintracker.my-oracle-n8n.kozow.com/_/

**Create/Update Superuser (for admin panel):**
```bash
docker exec margin_pocketbase /opt/pocketbase/pocketbase superuser upsert EMAIL PASSWORD --dir /pocketbase/data
```

**Update App User Password (via SQL):**
```bash
# Generate bcrypt hash locally
python3 -c "import bcrypt; print(bcrypt.hashpw(b'NEW_PASSWORD', bcrypt.gensalt(10)).decode())"

# Write hash to SQL file and upload, then:
docker stop margin_pocketbase
docker run --rm -v margin-tracker_margin_pocketbase_data:/pocketbase -v /tmp/update_pw.sql:/tmp/update_pw.sql alpine sh -c "apk add sqlite -q && sqlite3 /pocketbase/data/data.db < /tmp/update_pw.sql"
docker start margin_pocketbase
```

## Backup

### Automated Daily Backup

A cron job runs daily at 2:00 AM:
```
0 2 * * * /home/ubuntu/michael/margin-tracker/scripts/backup.sh >> /home/ubuntu/michael/margin-tracker/backups/cron.log 2>&1
```

**Backup location:** `~/michael/margin-tracker/backups/`
**Retention:** 7 days (older backups auto-deleted)

### Manual Backup

```bash
# Run backup manually
~/michael/margin-tracker/scripts/backup.sh

# Or create a quick backup
docker exec margin_pocketbase tar -czf /tmp/backup.tar.gz -C /pocketbase data
docker cp margin_pocketbase:/tmp/backup.tar.gz ./pocketbase-backup.tar.gz
```

### Restore Backup

```bash
docker stop margin_pocketbase
docker run --rm -v margin-tracker_margin_pocketbase_data:/pocketbase -v $(pwd)/pocketbase-backup.tar.gz:/tmp/backup.tar.gz alpine sh -c "rm -rf /pocketbase/data/* && tar -xzf /tmp/backup.tar.gz -C /pocketbase"
docker start margin_pocketbase
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

# Check volumes
docker volume ls | grep margin
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

### Login Works But Shows 0 Customers / Empty Data
**Cause:** Browser has a stale auth token from a different PocketBase instance (e.g., localhost).

**Solution:** Clear the token and re-login:
```javascript
// Run in browser console (F12 → Console)
localStorage.removeItem('pocketbase_auth');
location.reload();
```
Then log in again to get a fresh token from Oracle.

### API Returns Empty Results But Database Has Data
1. Check if user is authenticated: API requires `@request.auth.id != ""`
2. Verify the auth token is from the correct PocketBase instance
3. Test API with a fresh token:
```bash
TOKEN=$(curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"identity":"EMAIL","password":"PASSWORD"}' \
  'https://margintracker.my-oracle-n8n.kozow.com/api/collections/users/auth-with-password' \
  | grep -o '"token":"[^"]*' | cut -d'"' -f4)
curl -s -H "Authorization: $TOKEN" 'https://margintracker.my-oracle-n8n.kozow.com/api/collections/customers/records'
```

### Frontend Connecting to Wrong PocketBase
The frontend auto-detects the URL at runtime:
- On `localhost` → connects to `http://127.0.0.1:8090`
- On any other hostname → connects to `window.location.origin`

If issues persist, check `src/lib/pocketbase.ts`.

### Database Permission Errors
After migrating data, fix permissions:
```bash
docker stop margin_pocketbase
docker run --rm -v margin-tracker_margin_pocketbase_data:/pocketbase alpine chmod -R 777 /pocketbase/data
docker start margin_pocketbase
```
