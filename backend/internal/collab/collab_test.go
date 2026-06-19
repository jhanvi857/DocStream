package collab

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"docstream/internal/auth"
	"docstream/internal/document"
	"docstream/internal/crdt"
	"docstream/internal/version"
	"docstream/internal/ws"

	"github.com/go-chi/chi/v5"
	"nhooyr.io/websocket"
)

// mockVersionService implements version.Service in-memory for testing
type mockVersionService struct {
	ops      []*version.Op
	snapshot []byte
	version  int
}

func (m *mockVersionService) PersistOp(ctx context.Context, op *version.Op) (bool, error) {
	m.ops = append(m.ops, op)
	return false, nil
}

func (m *mockVersionService) LoadDocumentState(ctx context.Context, docID string) (json.RawMessage, []*version.Op, int, error) {
	return m.snapshot, m.ops, m.version, nil
}

func (m *mockVersionService) SaveSnapshot(ctx context.Context, docID string, content json.RawMessage, version int) error {
	m.snapshot = content
	m.version = version
	return nil
}

func (m *mockVersionService) GetOpsAfter(ctx context.Context, docID string, offset int) ([]*version.Op, error) {
	if offset >= len(m.ops) {
		return []*version.Op{}, nil
	}
	return m.ops[offset:], nil
}

func (m *mockVersionService) GetTotalOpsCount(ctx context.Context, docID string) (int, error) {
	return len(m.ops), nil
}

func (m *mockVersionService) GetOpsWithUser(ctx context.Context, docID string) ([]*version.OpWithUser, error) {
	return []*version.OpWithUser{}, nil
}

// mockDocService mocks document.Service for permission validation bypass
type mockDocService struct {
	document.Service
}

func (m *mockDocService) VerifyPermission(ctx context.Context, docID string, userID string, minRole document.Role) (bool, error) {
	return true, nil
}

func (m *mockDocService) GetRole(ctx context.Context, docID string, userID string) (document.Role, error) {
	return document.RoleEditor, nil
}

// readNextMsgOfType reads from the websocket connection until a message of targetType is found.
func readNextMsgOfType(ctx context.Context, c *websocket.Conn, targetType ws.MessageType) (ws.Message, error) {
	for {
		_, bytes, err := c.Read(ctx)
		if err != nil {
			return ws.Message{}, err
		}
		var msg ws.Message
		if err := json.Unmarshal(bytes, &msg); err != nil {
			return ws.Message{}, err
		}
		if msg.Type == targetType {
			return msg, nil
		}
	}
}

func TestWebSocket_Collaboration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 1. Initialize authentication and services
	tokenManager := auth.NewTokenManager("access_secret_keys_test_only_mock_keys_1", "refresh_secret_keys_test_only_mock_keys_2")
	tokens, err := tokenManager.GeneratePair("user-c1", "c1@test.com")
	if err != nil {
		t.Fatalf("failed to generate access token: %v", err)
	}

	mockVService := &mockVersionService{
		ops:      make([]*version.Op, 0),
		snapshot: []byte("[]"),
		version:  0,
	}

	hub := NewHub(mockVService, nil)
	go hub.Run()

	docService := &mockDocService{}
	wsHandler := NewHandler(hub, docService, tokenManager)

	// 2. Setup http test server
	r := chi.NewRouter()
	r.Get("/ws/document/{id}", wsHandler.ServeWS)
	server := httptest.NewServer(r)
	defer server.Close()

	// Convert http:// to ws://
	wsURL := strings.Replace(server.URL, "http://", "ws://", 1) + "/ws/document/doc1?token=" + tokens.AccessToken

	// 3. Connect Client 1
	c1, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("Client 1 dial failed: %v", err)
	}
	defer c1.Close(websocket.StatusGoingAway, "")

	// 4. Connect Client 2 (using same token for simplicity)
	c2, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("Client 2 dial failed: %v", err)
	}
	defer c2.Close(websocket.StatusGoingAway, "")

	// 5. Send Sync on Client 1
	syncReq1 := ws.Message{
		Type:    ws.MsgTypeSync,
		DocID:   "doc1",
		Payload: json.RawMessage(`{"lastSeenClock":0}`),
	}
	reqBytes1, _ := json.Marshal(syncReq1)
	err = c1.Write(ctx, websocket.MessageText, reqBytes1)
	if err != nil {
		t.Fatalf("Client 1 sync write failed: %v", err)
	}

	// Read Client 1 sync response (wait for sync)
	syncResp1, err := readNextMsgOfType(ctx, c1, ws.MsgTypeSync)
	if err != nil {
		t.Fatalf("Client 1 sync read failed: %v", err)
	}
	if syncResp1.Type != ws.MsgTypeSync {
		t.Errorf("Client 1 expected message type %s, got %s", ws.MsgTypeSync, syncResp1.Type)
	}

	// Read Client 1 sync complete response
	completeResp1, err := readNextMsgOfType(ctx, c1, ws.MsgTypeSyncComplete)
	if err != nil {
		t.Fatalf("Client 1 complete read failed: %v", err)
	}
	if completeResp1.Type != ws.MsgTypeSyncComplete {
		t.Errorf("Client 1 expected sync complete message type, got %s", completeResp1.Type)
	}

	// Send Sync on Client 2
	syncReq2 := ws.Message{
		Type:    ws.MsgTypeSync,
		DocID:   "doc1",
		Payload: json.RawMessage(`{"lastSeenClock":0}`),
	}
	reqBytes2, _ := json.Marshal(syncReq2)
	err = c2.Write(ctx, websocket.MessageText, reqBytes2)
	if err != nil {
		t.Fatalf("Client 2 sync write failed: %v", err)
	}

	// Read Client 2 sync response
	syncResp2, err := readNextMsgOfType(ctx, c2, ws.MsgTypeSync)
	if err != nil {
		t.Fatalf("Client 2 sync read failed: %v", err)
	}
	if syncResp2.Type != ws.MsgTypeSync {
		t.Errorf("Client 2 expected message type %s, got %s", ws.MsgTypeSync, syncResp2.Type)
	}

	// Read Client 2 sync complete response
	completeResp2, err := readNextMsgOfType(ctx, c2, ws.MsgTypeSyncComplete)
	if err != nil {
		t.Fatalf("Client 2 complete read failed: %v", err)
	}
	if completeResp2.Type != ws.MsgTypeSyncComplete {
		t.Errorf("Client 2 expected sync complete message type, got %s", completeResp2.Type)
	}

	// 6. Client 1 inserts character "a"
	insertOp1 := crdt.Op{
		ID:        "op1",
		DocID:     "doc1",
		UserID:    "user-c1",
		OpType:    "insert",
		CharID:    "user-c1:1",
		Char:      "a",
		AfterID:   "",
		CreatedAt: time.Now(),
	}
	opBytes1, _ := json.Marshal(insertOp1)
	opMsg1 := ws.Message{
		Type:    ws.MsgTypeOp,
		DocID:   "doc1",
		Payload: opBytes1,
	}
	writeOpBytes1, _ := json.Marshal(opMsg1)
	err = c1.Write(ctx, websocket.MessageText, writeOpBytes1)
	if err != nil {
		t.Fatalf("Client 1 op write failed: %v", err)
	}

	// Client 2 reads the propagated operation
	propagatedMsg, err := readNextMsgOfType(ctx, c2, ws.MsgTypeOp)
	if err != nil {
		t.Fatalf("Client 2 read failed to receive c1's op: %v", err)
	}
	if propagatedMsg.Type != ws.MsgTypeOp {
		t.Errorf("Client 2 expected Op propagation, got %s", propagatedMsg.Type)
	}

	// Verify the session text from the Hub's perspective
	time.Sleep(100 * time.Millisecond) // Give the async session handler a moment to save
	session := hub.GetOrCreateSession("doc1")
	session.mu.RLock()
	gotText := session.crdtDoc.ToText()
	session.mu.RUnlock()

	if gotText != "a" {
		t.Errorf("expected session text %q, got %q", "a", gotText)
	}
}
