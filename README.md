# CodeSync — Collaborative Code Development & Intelligent Defect-Risk Analysis

A real-time collaborative coding platform with SonarQube static analysis and ML-powered defect-risk prediction.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Compose                        │
│                                                          │
│  ┌──────────┐   ┌──────────┐   ┌─────────────────────┐  │
│  │  client  │──▶│  server  │──▶│       db            │  │
│  │ Next.js  │   │ Express  │   │   PostgreSQL 15      │  │
│  │  :3000   │   │  :3001   │   │      :5432           │  │
│  └──────────┘   └────┬─────┘   └─────────────────────┘  │
│                      │                                   │
│            ┌─────────┼──────────┐                        │
│            ▼         ▼          ▼                        │
│        ┌───────┐ ┌───────┐ ┌──────────┐                  │
│        │ redis │ │ minio │ │sonarqube │                  │
│        │ :6379 │ │ :9000 │ │  :9200   │                  │
│        └───────┘ └───────┘ └──────────┘                  │
│                                                          │
│                 ┌───────────┐                            │
│                 │ ml-worker │                            │
│                 │  FastAPI  │                            │
│                 │   :8000   │                            │
│                 └───────────┘                            │
└─────────────────────────────────────────────────────────┘
```

## Quick Start (Docker — Recommended)

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- Git

That's it. No Python, Node.js, or any other runtime required on the host.

### Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd CodeSync

# 2. Create your environment file
cp .env.example .env

# 3. Build and start all services
docker compose up --build
```

> **First run takes 5–10 minutes** to build all images and start SonarQube (which needs time to initialise its Elasticsearch index).

### Access the Application

| Service | URL | Notes |
|---------|-----|-------|
| **Frontend** | http://localhost:3000 | Main application |
| **Backend API** | http://localhost:3001/api | REST API + WebSocket |
| **SonarQube** | http://localhost:9200 | Default: `admin` / `admin` |
| **MinIO Console** | http://localhost:9001 | Default: `minioadmin` / `minioadmin` |
| **ML Worker** | http://localhost:8000 | `GET /health`, `POST /predict` |

### SonarQube Token Setup (required for analysis)

SonarQube analysis requires a user token. On first run:

1. Open http://localhost:9200 in your browser
2. Log in with `admin` / `admin` (you'll be prompted to change the password)
3. Go to **My Account → Security → Generate Tokens**
4. Give it a name (e.g., `codesync`), click **Generate**
5. Copy the token and paste it into your `.env` file:
   ```
   SONARQUBE_TOKEN=sqa_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
6. Restart the server container:
   ```bash
   docker compose restart server
   ```

### Stopping and Restarting

```bash
# Stop all containers (data is preserved in volumes)
docker compose down

# Start again (no rebuild needed)
docker compose up

# Full rebuild (after code changes)
docker compose up --build

# Remove everything including data volumes (clean slate)
docker compose down -v
```

---

## Local Development (Without Docker)

For active development with hot-reload:

### Prerequisites

- Node.js 20+
- Python 3.11+
- PostgreSQL 15
- Redis

> **Recommended:** Use Docker for infrastructure (db, redis, minio, sonarqube) and run only the frontend/backend locally.

```bash
# Start only infrastructure services
docker compose up db redis minio sonarqube ml-worker

# Terminal 1: Backend
cd server
npm install
cp .env.example .env   # Edit DATABASE_URL etc. for localhost
npx prisma migrate dev
npm run dev

# Terminal 2: Frontend
cd client
npm install
NEXT_PUBLIC_API_URL=http://localhost:3001/api npm run dev
```

---

## Environment Variables

See [`.env.example`](.env.example) for all variables with documentation.

**Critical variables to change in production:**

| Variable | Description |
|----------|-------------|
| `JWT_ACCESS_SECRET` | Min 32-char random string |
| `JWT_REFRESH_SECRET` | Min 32-char random string |
| `POSTGRES_PASSWORD` | Database password |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | MinIO credentials |
| `SONARQUBE_TOKEN` | Generated from SonarQube UI |
| `NEXT_PUBLIC_API_URL` | Backend URL as seen by the browser |

---

## Troubleshooting

### Containers keep restarting

```bash
# Check logs for a specific service
docker compose logs server --tail=50
docker compose logs sonarqube --tail=50
docker compose logs ml-worker --tail=50
```

### SonarQube fails to start

SonarQube requires `vm.max_map_count=262144` on Linux hosts. Run:
```bash
sudo sysctl -w vm.max_map_count=262144
```
Or add `SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true` (already set in docker-compose.yml).

### Analysis says "ML Service unavailable"

The ml-worker health check must pass before the server starts. Check:
```bash
curl http://localhost:8000/health
```
Expected: `{"status":"ok","models_loaded":true,...}`

### "0 Analyses" on dashboard after running analysis

The analysis requires `SONARQUBE_TOKEN` to be set. Follow the SonarQube Token Setup steps above.

### Dashboard shows wrong member count or old timestamp

Member counts only include **accepted** members (not pending invitations). Timestamps update when files are edited and saved. If you just created a project, invite and accept the invitation to see it reflected.

### Port conflicts

Edit the port variables in `.env`:
```
CLIENT_PORT=3000
SERVER_PORT=3001
SONARQUBE_PORT=9200
```

---

## Project Structure

```
CodeSync/
├── client/             # Next.js 16 frontend
│   ├── src/app/        # App Router pages
│   ├── src/components/ # UI components
│   ├── src/contexts/   # React contexts (Auth, Toast, Tabs)
│   └── src/lib/api.ts  # API client
├── server/             # Express.js backend
│   ├── src/routes/     # API route handlers
│   ├── src/services/   # Business logic (SonarQube, execution)
│   ├── src/ws/         # WebSocket handlers (Yjs, terminal)
│   ├── src/middleware/  # Auth, error, role middleware
│   └── prisma/         # Database schema & migrations
├── ml-worker/          # FastAPI ML prediction service
│   ├── app.py          # API endpoints
│   ├── models/v1.0.0/  # Pre-trained scikit-learn models
│   └── requirements.txt
├── docker/             # Docker init scripts
├── docker-compose.yml  # Full service orchestration
├── .env.example        # Environment template
└── README.md
```

---

## Features

- **Real-time Collaboration** — Yjs CRDT-powered collaborative editing with live cursors
- **Static Code Analysis** — Integrated SonarQube: code smells, bugs, vulnerabilities, complexity metrics
- **ML Defect-Risk Prediction** — HistGradientBoosting classifier trained on the Technical Debt dataset (PR-AUC: 0.42)
- **In-Browser Code Execution** — Sandboxed Docker containers for Python, JavaScript, TypeScript, Java
- **Version Snapshots** — Immutable code snapshots linked to analysis results
- **Team Collaboration** — Project members, role-based permissions (Team Lead / Member), email invitations
