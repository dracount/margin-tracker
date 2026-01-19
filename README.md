# Margin Tracker

A modern web application for tracking product margins, revenue, and profitability. Built with React, TypeScript, and PocketBase.

![Dashboard Preview](docs/images/dashboard_preview.png)

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js (for scripts)

### Installation
1. Clone the repository
2. Start the backend services:
   ```bash
   docker-compose up -d
   ```
3. Install frontend dependencies:
   ```bash
   npm install
   ```
4. Start the frontend development server:
   ```bash
   npm run dev
   ```

## 🛠 Tech Stack
- **Frontend:** React, TypeScript, Vite, Vanilla CSS
- **Backend:** PocketBase (SQLite + Auth + Collections)
- **Containerization:** Docker, Docker Compose
- **Proxy:** Caddy

## 📂 Project Structure
- `src/`: React application source code
- `scripts/`: Database seeding and CSV import utilities
- `docs/`: Detailed technical documentation
- `pb_data/`: (Volume) PocketBase database and storage

## 📖 Documentation
Detailed guides can be found in the [docs/](docs/) folder:
- [Architecture](docs/architecture.md)
- [Database Schema](docs/database.md)
- [Setup & Deployment](docs/deployment.md)
- [Import & Export](docs/import-export.md)

## 📄 License
MIT
