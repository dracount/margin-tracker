# PocketBase Database Access

## Overview

This project uses PocketBase as the backend database, running in a Docker container.

## Docker Container

- **Container name:** `pb_margins`
- **Image:** `adrianmusante/pocketbase:latest`
- **Port:** `8090`
- **Data directory (inside container):** `/pocketbase/data`
- **PocketBase binary:** `/usr/local/bin/pocketbase`

## Admin Access

### Admin UI
- **URL:** http://127.0.0.1:8090/_/
- **Email:** `admin@margin.local`
- **Password:** `admin123`

### Creating a Superuser

If the superuser doesn't exist or you need to reset it:

```bash
docker exec pb_margins /usr/local/bin/pocketbase superuser upsert admin@margin.local admin123 --dir /pocketbase/data
```

## Collections

### customers
| Field | Type | Description |
|-------|------|-------------|
| name | text | Customer display name |
| customer_id | text | Customer reference code |
| logo | file | Customer logo image |

### styles
| Field | Type | Description |
|-------|------|-------------|
| customer | relation | Reference to customer |
| styleId | text | Style number (e.g., TP131) |
| factory | text | Factory code |
| deliveryDate | text | Delivery date |
| description | text | Product description |
| fabricTrim | text | Fabric/trim details |
| type | text | Product type |
| units | number | Number of units |
| pack | number | Pack size |
| price | number | Unit price |
| rate | number | Exchange rate |
| extraCost | number | Additional costs |
| sellingPrice | number | Selling price |

### users
Standard PocketBase auth collection for app users.

## Default User Account

- **Email:** `user@margin.local`
- **Password:** `user1234`

## Setting Up API Rules

If users can't see data after logging in, the collection API rules need to be configured:

```bash
node scripts/setup-rules.mjs
```

This sets the `listRule` and `viewRule` to `@request.auth.id != ""` (authenticated users only).

## Seeding Data

### Running the Seed Script

```bash
npm run seed
```

This script:
1. Authenticates as admin
2. Creates/finds the customer "PEEP & HEY BETTY"
3. Imports styles from `uploads/1.csv`

### Seed Script Location
- `/scripts/seed-data.mjs`

## Useful Docker Commands

```bash
# View container logs
docker logs pb_margins

# Restart PocketBase
docker restart pb_margins

# Access container shell
docker exec -it pb_margins sh

# Backup database (copy from volume)
docker cp pb_margins:/pocketbase/data ./backup

# Check PocketBase version
docker exec pb_margins /usr/local/bin/pocketbase --version
```

## API Endpoints

- **Health check:** http://127.0.0.1:8090/api/health
- **Collections API:** http://127.0.0.1:8090/api/collections/{collection}/records

## Troubleshooting

### "Permission denied" when creating superuser
Make sure to specify the data directory:
```bash
--dir /pocketbase/data
```

### "Failed to create record" (400 error)
- Check if you're authenticated
- Verify the collection API rules allow the operation
- Use admin authentication for seeding data

### Container not running
```bash
docker-compose up -d pocketbase
```
