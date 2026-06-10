<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
## Backend
You are an expert Go backend engineer. I am building a production-ready 
collaborative document editor backend (like Google Docs). My frontend is 
already built in Next.js + Tailwind CSS.

## Tech Stack
- Language: Go (latest stable)
- Router: chi
- WebSocket: nhooyr.io/websocket
- Database: PostgreSQL (pgx/v5)
- Cache + Pub/Sub: Redis (go-redis/v9)
- Auth: JWT (golang-jwt/jwt/v5)
- Migration: golang-migrate
- Config: godotenv + custom config struct
- Logger: log/slog (stdlib)
- Real-time sync: CRDT (custom implementation)

## Folder Structure
collab-editor-backend/
├── cmd/server/main.go
├── internal/
│   ├── auth/         (handler, middleware, service, token)
│   ├── document/     (handler, service, repository, model)
│   ├── collab/       (hub, client, handler, session, operation, broadcast)
│   ├── version/      (repository, service, model)
│   ├── user/         (handler, service, repository, model)
│   └── ws/           (message.go — shared WS message envelope)
├── pkg/
│   ├── db/           (postgres.go, redis.go)
│   ├── logger/
│   ├── config/
│   └── errors/
├── migrations/
├── docker/
├── Makefile
├── .env.example
└── go.mod

## Architecture Decisions
- CRDT for conflict-free real-time sync (not OT)
- Each character has a unique ID + logical position
- Append-only ops_log in Postgres (never mutate, only append)
- Snapshots every 100 ops to avoid full replay on load
- Redis pub/sub for multi-instance fan-out
- Hub-client pattern: one Hub, one Session per document, one Client per WS connection
- JWT in WS query param (?token=...) validated on upgrade
- Optimistic UI: client applies op locally before server confirms

## Database Schema
-- users
id uuid PK, email text UNIQUE, password_hash text, created_at timestamptz

-- documents  
id uuid PK, title text, content jsonb, owner_id uuid FK,
snapshot_version int DEFAULT 0, created_at timestamptz, updated_at timestamptz

-- document_permissions
doc_id uuid FK, user_id uuid FK, role text (owner/editor/viewer), PRIMARY KEY(doc_id, user_id)

-- ops_log
id uuid PK, doc_id uuid FK, user_id uuid FK, op_type text (insert/delete),
char_id text, char text, after_id text, is_deleted bool,
vector_clock jsonb, created_at timestamptz

## WebSocket Message Envelope (ws/message.go)
type MessageType string
const (
  MsgTypeOp       MessageType = "op"
  MsgTypeCursor   MessageType = "cursor"
  MsgTypePresence MessageType = "presence"
  MsgTypeSync     MessageType = "sync"
  MsgTypeAck      MessageType = "ack"
  MsgTypeError    MessageType = "error"
)

type Message struct {
  Type    MessageType     `json:"type"`
  DocID   string          `json:"doc_id"`
  Payload json.RawMessage `json:"payload"`
}

## CRDT Design
- Each character: { id: string, char: string, afterID: string, isDeleted: bool }
- ID format: "{userID}:{logicalClock}" — globally unique
- Insert: place char after the char with afterID
- Delete: mark isDeleted = true (tombstone, never remove)
- Conflict resolution: if two chars have same afterID, sort by ID lexicographically
- Vector clock per client to track causality

## REST API Endpoints
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
GET    /documents              (list user's docs)
POST   /documents              (create doc)
GET    /documents/:id          (get doc + full content)
PATCH  /documents/:id          (update title)
DELETE /documents/:id          (delete doc)
POST   /documents/:id/share    (add collaborator)
GET    /documents/:id/history  (get ops log)
GET    /ws/document/:id        (WebSocket upgrade)

## Build this project in the following phases. 
## For each phase give me complete, working, production-quality Go code.

---

### PHASE 1 — Project Bootstrap
- go.mod with all dependencies
- .env.example with all required env vars
- pkg/config/config.go — load from env, typed struct
- pkg/logger/logger.go — slog setup with JSON output
- pkg/errors/errors.go — typed AppError with code + message
- docker/docker-compose.yml — postgres + redis
- Makefile — targets: run, build, migrate-up, migrate-down, test, docker-up
- cmd/server/main.go — empty server that starts on PORT, connects to DB and Redis, logs ready

---

### PHASE 2 — Database + Migrations
- pkg/db/postgres.go — pgx pool with health check
- pkg/db/redis.go — go-redis client with ping
- migrations/001_create_users.sql
- migrations/002_create_documents.sql
- migrations/003_create_ops_log.sql
Full SQL with indexes, constraints, foreign keys.

---

### PHASE 3 — Auth
- internal/user/model.go
- internal/auth/token.go — generate access token (15min) + refresh token (7d)
- internal/auth/service.go — register (bcrypt), login, refresh
- internal/auth/handler.go — POST /auth/register, /auth/login, /auth/refresh
- internal/auth/middleware.go — JWT validation, sets userID in context
Wire into main.go.

---

### PHASE 4 — Document REST API
- internal/document/model.go
- internal/document/repository.go — create, get, list, delete, update title
- internal/document/service.go — business logic + permission checks
- internal/document/handler.go — all REST endpoints
- migrations/004_create_document_permissions.sql
Wire into main.go with auth middleware.

---

### PHASE 5 — CRDT Core
- internal/collab/operation.go
  - CRDTChar struct { ID, Char, AfterID, IsDeleted }
  - CRDTDoc struct — ordered list of chars
  - func (d *CRDTDoc) Apply(op Op) error
  - func (d *CRDTDoc) Insert(op Op) 
  - func (d *CRDTDoc) Delete(op Op)
  - func (d *CRDTDoc) ToText() string
  - func (d *CRDTDoc) ToJSON() ([]byte, error)
  - Conflict resolution: tiebreak by char ID lexicographic sort
Full implementation with all edge cases handled.

---

### PHASE 6 — WebSocket Hub + Client
- ws/message.go — all message types + payload structs
- internal/collab/client.go
  - Client struct { id, userID, docID, conn, send chan, hub }
  - ReadPump — reads ops, sends to hub
  - WritePump — receives from send channel, writes to conn
  - Handles ping/pong keepalive
- internal/collab/session.go
  - Session struct { docID, clients map, crdtDoc, mu sync.RWMutex }
  - Join, Leave, Broadcast methods
  - ApplyOp — applies to CRDT, broadcasts to all clients except sender
- internal/collab/hub.go
  - Hub struct { sessions map[docID]Session, register/unregister/op channels }
  - Run() — central event loop (select on channels)
  - GetOrCreateSession
- internal/collab/handler.go
  - ServeWS — validate JWT from query param, check doc permission, upgrade, create client

---

### PHASE 7 — Ops Persistence + Versioning
- internal/version/model.go — Op struct matching ops_log table
- internal/version/repository.go
  - SaveOp
  - GetOpsSinceVersion
  - GetLatestSnapshot
  - SaveSnapshot
- internal/version/service.go
  - PersistOp — save to ops_log
  - TakeSnapshot — every 100 ops, save CRDTDoc.ToJSON() to documents.content
  - ReplayFromSnapshot — load snapshot + apply ops on top
Wire into collab/session.go: after each op is applied locally, call version service.

---

### PHASE 8 — Redis Pub/Sub Fan-out
- internal/collab/broadcast.go
  - Publisher: after local broadcast, publish op JSON to Redis channel "doc:{docID}"
  - Subscriber: on startup, subscribe to all active doc channels
  - On receive from Redis: apply to local session if exists, broadcast to local clients
  - Prevents echo: skip ops that originated from this server instance (use instanceID)
Wire into hub.go.

---

### PHASE 9 — Presence + Cursor
- Add cursor payload type to ws/message.go
  - CursorPayload { position int, userID string, userName string, color string }
- In session.go: track cursor positions per client (in-memory only, not persisted)
- On cursor message: broadcast to all other clients in session
- On client disconnect: broadcast presence-leave message
- Assign deterministic color per userID (hash → hex color)

---

### PHASE 10 — Sync on Connect + Reconnect
- On WS connect, client sends: { type: "sync", payload: { lastSeenClock: N } }
- Server responds with:
  - Full doc state if lastSeenClock == 0 (fresh load)
  - All ops since lastSeenClock if reconnecting
- Load doc: fetch snapshot from Postgres + replay ops_log on top
- Confirm sync complete with: { type: "sync_complete", payload: { serverClock: N } }
Wire into collab/handler.go and version/service.go.

---

### PHASE 11 — Document History API
- GET /documents/:id/history?from=0&limit=50
- Returns paginated ops_log for this document
- Each op includes: opType, char, position, userID, userName, createdAt
- Wire into document/handler.go + version/repository.go

---

### PHASE 12 — Hardening + Production Readiness
- Rate limiting middleware (token bucket, 100 req/min per IP)
- Request ID middleware (UUID in every request/response)
- Graceful shutdown (os.Signal → close hub → drain connections → close DB)
- CORS middleware configured for Next.js origin
- Structured error responses: { error: { code, message } }
- Unit tests for CRDT operation.go (insert, delete, concurrent ops, tiebreaking)
- Integration test for WS: two clients, concurrent ops, assert consistent final state
- Health check endpoint: GET /health → { status: ok, db: ok, redis: ok }

---

## For each phase:
1. Give me complete file contents, no placeholders, no TODOs
2. Show where to wire it into main.go
3. Call out any gotchas or non-obvious decisions
4. If a file was shown in a previous phase and needs updating, show the full updated file