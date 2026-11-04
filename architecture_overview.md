# CodeSync - Architecture Overview

CodeSync is a "Collaborative Code Development and Intelligent Defect-Risk Analysis Platform". It uses a microservice-like architecture managed via a monorepo, integrating a real-time collaborative IDE, static code analysis, and machine learning models for risk prediction.

---

## 1. High-Level Architecture
The project is divided into three main components:
1. **Frontend (`client`)**: A web-based IDE where users write code, configure execution environments, and view analysis results.
2. **Backend Server (`server`)**: The core API server handling user authentication, project/file management, real-time collaboration syncing, in-browser terminal execution, and orchestration of background jobs (like code analysis).
3. **ML Worker (`ml-worker`)**: A Python-based microservice responsible for predicting defect risk in the code using trained machine learning classifiers.

---

## 2. Tech Stack

### Frontend (Client)
- **Framework**: [Next.js](https://nextjs.org/) (React 19)
- **Styling**: Vanilla CSS / Modules (Tailwind if configured, but based on Next.js setup)
- **Code Editor**: `@monaco-editor/react` (VS Code's editor in the browser)
- **Terminal**: `xterm.js` (for rendering the terminal output in the browser)
- **Real-time Sync**: `yjs` & `y-websocket` (CRDTs for real-time collaborative editing)

### Backend (Server)
- **Runtime**: Node.js & Express.js (TypeScript)
- **Database ORM**: Prisma
- **Real-time Execution**: `node-pty` (pseudo-terminal for running code)
- **Background Jobs**: BullMQ (with Redis)
- **Authentication**: JWT (JSON Web Tokens) & Bcrypt
- **WebSocket Servers**: Custom implementations for `yjs` (collaboration) and terminal streaming.

### Machine Learning Worker (ML-Worker)
- **API Framework**: FastAPI & Uvicorn
- **Data & ML**: Pandas, Scikit-Learn, Joblib (Random Forest, Logistic Regression, etc.)

### Infrastructure & Services (Docker Compose)
- **Database**: PostgreSQL (relational storage for all platform data)
- **Cache/Queue**: Redis (used by BullMQ)
- **Storage**: MinIO (S3-compatible object storage)
- **Static Analysis**: SonarQube (generates code metrics and identifies code smells)

---

## 3. Data Flow & Connections

### A. Real-Time Collaboration (WebSockets)
1. **Editing**: When a user types in the Monaco Editor, changes are translated into CRDT operations via `yjs`.
2. **Syncing**: The frontend connects to the Backend's `y-websocket` server.
3. **Broadcasting**: The Backend broadcasts the document state changes to all other connected clients, resolving conflicts automatically. The state is periodically saved to the `File` table in Postgres (`yjsState` column).

### B. In-Browser Terminal Execution
1. **Run Config**: Users define a `RunConfiguration` (e.g., `npm run dev` or `python main.py`).
2. **Execution**: When "Run" is clicked, the Frontend opens a WebSocket connection to the Backend's Terminal socket.
3. **Pty**: The Backend spawns a pseudo-terminal (`node-pty`) in a secure/isolated process.
4. **I/O Streaming**: Stdout/Stderr from the running process is streamed back over the WebSocket to be displayed in the frontend `xterm.js` terminal. User inputs (stdin) flow in reverse.

### C. Code Analysis & ML Risk Prediction
1. **Trigger**: A user triggers an analysis (or it triggers on a save/commit).
2. **Static Analysis**: The Backend queues a job (via BullMQ/Redis) and pushes the code to the **SonarQube** container. SonarQube calculates metrics (Cyclomatic Complexity, LOC, etc.) and code smells.
3. **Feature Vector generation**: The Backend collects the SonarQube metrics and calculates change stats (lines added/removed between versions).
4. **ML Inference**: The Backend sends a REST request to the **ML Worker** (`POST /predict`), passing the feature vector.
5. **Storage**: The ML Worker responds with a risk score and level (low/medium/high). The Backend saves all metrics, smells, and ML predictions into the database under the `Analysis` record.

---

## 4. Database Schema (PostgreSQL via Prisma)

The database models are tightly structured. Key relationships include:
- **Users**: Manage authentication and relations to projects (`ownedProjects`, `memberships`).
- **Projects**: The root container for code. Includes language configuration and `RunConfiguration`.
- **ProjectMembers**: Maps users to projects with roles (`team_lead`, `member`).
- **Files**: The live working tree of files and folders, containing file names, contents, and Yjs states.
- **Versions & VersionFiles**: Immutable snapshots of code at specific points in time (for tracking history).
- **Analyses**: 
  - `AnalysisMetrics`: Metrics pulled from SonarQube.
  - `AnalysisSmell`: Specific code issues mapped to file lines.
  - `AnalysisPrediction`: The ML model's risk score and the features that contributed to it.
- **ActivityLog & ExecutionLog**: Track user actions and logs of code execution runs.

---

## 5. Summary of Network Topology

```mermaid
graph TD
    Client[Next.js Client (Monaco/Xterm)]
    
    subgraph "Backend Services"
        API[Express API Server]
        WSTerm[WebSocket: Terminal]
        WSYjs[WebSocket: Collab Editing]
    end
    
    subgraph "Background Infrastructure (Docker)"
        DB[(PostgreSQL)]
        Redis[(Redis)]
        MinIO[(MinIO S3)]
        Sonar[SonarQube]
        MLWorker[FastAPI ML Worker]
    end
    
    Client -- HTTP/REST --> API
    Client -- WS --> WSTerm
    Client -- WS --> WSYjs
    
    API -- Read/Write --> DB
    WSYjs -- Save State --> DB
    
    API -- Queue Jobs --> Redis
    API -- Store artifacts --> MinIO
    
    API -- Scan Code --> Sonar
    Sonar -- Metrics --> API
    
    API -- Feature Vector --> MLWorker
    MLWorker -- Risk Score --> API
```
