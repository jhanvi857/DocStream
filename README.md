# DocStream - Real-Time Collaborative Document Editor

DocStream is a production-ready, highly scalable collaborative document editor backend (similar to Google Docs) built in **Go**, designed to synchronize concurrent edits in conflict-free real-time across multiple instances.

---

## System Architecture

DocStream uses a distributed architecture designed to coordinate concurrent client sessions, scale horizontally, and achieve eventual consistency.

```mermaid
flowchart TD
    Client1[Next.js Client 1] <-->|WebSocket| Node1[Go Backend Node 1]
    Client2[Next.js Client 2] <-->|WebSocket| Node2[Go Backend Node 2]
    
    Node1 <-->|Redis Pub/Sub| RedisBroker[(Redis Pub/Sub)]
    Node2 <-->|Redis Pub/Sub| RedisBroker
    
    Node1 -->|Connection Pool| DB[(PostgreSQL)]
    Node2 -->|Connection Pool| DB
    
    subgraph Go Backend Node
        Handler[ServeWS Handler] --> Hub[Collab Hub]
        Hub --> Session[Document Session]
        Session --> CRDT[RGA CRDT Engine]
        Session --> Version[Version Service]
        Version --> DB
    end
```

### Key Components
- **API Gateway / Router**: Built using `go-chi` (v5) providing prefix-based REST routing, request ID logging, rate limiting, and CORS handlers.
- **WebSocket Upgrade Server**: Connects clients to document sessions over WebSockets using `nhooyr.io/websocket`.
- **Collab Hub**: Runs a non-blocking background select loop coordinating client registrations and asynchronous database load triggers.
- **Document Sessions**: Tracks in-memory character sequence states, active client cursors, and local socket broadcast targets.
- **Redis Pub/Sub**: Routes operational updates across backend servers, enabling multi-instance horizontal scaling.
- **Postgres Database**: Serves as the persistent store for relational users, documents, permissions, and append-only operations logs.

---

## Real-Time Synchronization: Sequence CRDT

DocStream implements a custom **Sequence CRDT (Conflict-free Replicated Data Type)** instead of Operational Transformation (OT). While OT requires a centralized server to coordinate and transform edit indices (which is hard to scale and distribute), CRDTs guarantee that document states converge to the exact same content regardless of network delays or message arrival orders.

### 1. Character Representation
Each character in the document is represented as a unique node in a list structure:
```go
type CRDTChar struct {
    ID        string `json:"id"`         // Format: "{userID}:{logicalClock}"
    Char      string `json:"char"`       // Character value (supports multi-byte Unicode/Emojis)
    AfterID   string `json:"after_id"`   // ID of the preceding character (empty if at start)
    IsDeleted bool   `json:"is_deleted"` // Tombstone marker
}
```

### 2. Globally Unique IDs
Every character is tagged with an ID of format `{userID}:{logicalClock}`:
- `userID`: Unique string identifying the client who created the edit.
- `logicalClock`: An incremental integer tracker incremented by the client for each operation.
This format guarantees globally unique identifiers without centralized coordination.

### 3. Conflict Resolution (RGA Algorithm)
When two users concurrently type after the same character, both operations have the same `afterID` (siblings). DocStream resolves this conflict using the **RGA (Replicated Growable Array)** algorithm:
- When applying an operation `newOp` after `afterID`, the engine starts scanning the character sequence immediately after `afterID`.
- It skips past any concurrent characters whose IDs are lexicographically larger than `newOp.CharID` (and skips all of their nested descendants).
- It inserts the character at the first index where these conditions break.
Lexicographical tiebreaking ensures that all nodes resolve conflicts identically, ensuring convergence.

### 4. Tombstone Deletes
When a user deletes a character, the character is **not** removed from the memory slice. It is marked as `IsDeleted = true` (tombstone). Preserving deleted elements is necessary because concurrent operations from other users might still reference them in their `afterID` links.

---

## Database Architecture & Schema

We follow an append-only architecture for editing events. The server never mutates old operations; it only appends to `ops_log` and captures periodic snapshots.

```mermaid
erDiagram
    USERS {
        uuid id PK
        text email UK
        text password_hash
        timestamptz created_at
    }
    DOCUMENTS {
        uuid id PK
        text title
        jsonb content
        uuid owner_id FK
        int snapshot_version
        timestamptz created_at
        timestamptz updated_at
    }
    DOCUMENT_PERMISSIONS {
        uuid doc_id FK, PK
        uuid user_id FK, PK
        text role "owner/editor/viewer"
    }
    OPS_LOG {
        uuid id PK
        uuid doc_id FK
        uuid user_id FK
        text op_type "insert/delete"
        text char_id
        text char
        text after_id
        bool is_deleted
        jsonb vector_clock
        timestamptz created_at
    }
    
    USERS ||--o{ DOCUMENTS : owns
    USERS ||--o{ DOCUMENT_PERMISSIONS : has
    DOCUMENTS ||--o{ DOCUMENT_PERMISSIONS : defines
    DOCUMENTS ||--o{ OPS_LOG : logs
    USERS ||--o{ OPS_LOG : creates
```

### Snapshotting Mechanism
Replaying thousands of individual operations from the beginning to construct a document is expensive. To optimize reload times:
1. Every operations update is written to `ops_log`.
2. When the count of operations written since the last snapshot exceeds **100**, the server serializes the in-memory `CRDTDoc` (including tombstones) to JSON.
3. This JSON is saved into `documents.content`, and `documents.snapshot_version` is incremented.
4. When a new client connects, the server loads the snapshot and replays only the few incremental operations logged *after* the snapshot timestamp.

---

## Multi-Instance Scaling (Redis Pub/Sub)

To scale beyond a single server instance, DocStream synchronizes nodes using Redis Pub/Sub:
- When a document session starts on a node, it subscribes to the Redis channel `doc:{docID}`.
- When a local client submits an operation, the server persists it to PostgreSQL and publishes the operation to the Redis channel.
- Other servers receive the operation, apply it to their local session in-memory (skipping Postgres writes since the original server already did so), and broadcast it to their connected local sockets.
- **Echo Loop Prevention**: Each server generates a unique UUID `instanceID` on startup. Published Redis messages are wrapped with the sender's `instanceID`. Subscribed nodes drop messages matching their own `instanceID` to avoid duplicate processing.

---

## Presence & Cursor Tracking

DocStream tracks collaborative session states strictly in-memory:
- **Cursors**: Client positions are updated in-memory via `MsgTypeCursor` socket messages and fanned out to peer connections.
- **Presence**: Client join/leave actions trigger `MsgTypePresence` broadcasts.
- **Deterministic Color Assignment**: To prevent sharing color state, each user is assigned a deterministic CSS color by hashing their `userID` and index-mapping it to a curated color palette:
  ```go
  func GetDeterministicColor(userID string) string {
      var hash uint32 = 5381
      for i := 0; i < len(userID); i++ {
          hash = ((hash << 5) + hash) + uint32(userID[i])
      }
      colors := []string{"#E02424", "#3F83F8", "#0E9F6E", "#D03801", "#7E3AF2", "#ECE513", "#06B6D4", "#EC4899"}
      return colors[hash % uint32(len(colors))]
  }
  ```

---

## Production Hardening & Security

- **Token Bucket Rate Limiting**: The server uses a custom thread-safe token bucket middleware, limiting clients to **100 requests per minute per IP address**.
- **CORS Guards**: Preflight options and requests are restricted to the configured Next.js domain (`ALLOWED_ORIGIN`).
- **Request ID Tracking**: Chi injects a unique correlation ID (`X-Request-Id`) into request and response headers.
- **Graceful Shutdown**: Catches termination signals (`SIGINT`, `SIGTERM`), halts the HTTP listener, drains active connection pumps, flushes Postgres connection pools, and closes Redis clients.

---

## Project Structure

```
DocStream/
├── Dockerfile              # Root Dockerfile for the Go backend
├── README.md               # Architecture and system design specifications
├── .gitignore              # Global git ignore filters
├── backend/                # Go collaborative backend application
│   ├── cmd/server/         # main.go startup entrypoint
│   ├── internal/           # Decoupled application modules (auth, document, collab, version, user)
│   ├── pkg/                # Generic utility packages (db, config, logger, errors, middleware)
│   ├── migrations/         # SQL migration scripts
│   ├── docker/             # Local infrastructure (docker-compose postgres/redis)
│   └── Makefile            # Run, test, and migration scripts
└── frontend/               # Next.js collaborative editor application
```

---

## Running Locally

### 1. Infrastructure Setup
Spin up PostgreSQL and Redis containers using Docker Compose:
```bash
cd backend
make docker-up
```

### 2. Configure Environment
Create a `.env` file inside the `backend` directory copying [.env.example](file:///c:/Users/family/OneDrive/Desktop/DocStream/backend/.env.example):
```bash
cp .env.example .env
```
Ensure `DATABASE_URL` and `REDIS_URL` credentials match the docker configuration.

### 3. Run Database Migrations
Apply SQL schemas to the PostgreSQL container:
```bash
make migrate-up
```

### 4. Run backend
Start the Go application server:
```bash
make run
```

### 5. Running Tests
Run CRDT sequence unit tests and WebSocket collaboration integration tests:
```bash
make test
```
