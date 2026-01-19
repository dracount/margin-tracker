# Database Schema

Margin Tracker uses PocketBase as its primary database. The schema consists of two main business collections.

## 1. `customers` Collection
Groups styles together and identifies the client.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | Text | Yes | Formal name of the customer |
| `customer_id` | Text | Yes | Short code (e.g., PHB001) |
| `logo` | File | No | Customer logo image |

**API Rules:**
- `List/View/Create/Update/Delete`: `@request.auth.id != ""` (Authenticated users only)

---

## 2. `styles` Collection
Store individual product style information and costing data.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `customer` | Relation | Yes | Reference to `customers` collection |
| `styleId` | Text | Yes | Unique style identifier (e.g., TP131) |
| `factory` | Text | No | Manufacturing factory name |
| `description` | Text | No | Item description |
| `fabricTrim` | Text | No | Material details |
| `type` | Text | No | Garment type |
| `units` | Number | No | Total production units |
| `pack` | Number | No | Items per pack |
| `price` | Number | No | Unit cost price |
| `rate` | Number | No | Exchange rate (FOB) |
| `extraCost` | Number | No | Additional costs (ship/customs) |
| `sellingPrice` | Number | No | Final selling price per unit |

**API Rules:**
- `List/View/Create/Update/Delete`: `@request.auth.id != ""` (Authenticated users only)

---

## 3. `users` Collection (Built-in)
Used for application login.

| Field | Type | Description |
|-------|------|-------------|
| `email` | Email | User login identifier |
| `password` | Password | Securely hashed credential |
| `name` | Text | Display name |
