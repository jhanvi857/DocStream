package collab

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"docstream/internal/crdt"

	"github.com/redis/go-redis/v9"
)

// wrap a collab operation with the publishing server's instance ID.
type RedisMessage struct {
	SenderInstanceID string  `json:"sender_instance_id"`
	Op               crdt.Op `json:"op"`
}

// coordinate Redis publication and subscription channels.
type RedisPubSub struct {
	client     *redis.Client
	instanceID string
}

func NewRedisPubSub(client *redis.Client, instanceID string) *RedisPubSub {
	return &RedisPubSub{
		client:     client,
		instanceID: instanceID,
	}
}

// marshal and broadcast an operation onto the Redis channel.
func (rps *RedisPubSub) PublishOp(ctx context.Context, docID string, op crdt.Op) error {
	msg := RedisMessage{
		SenderInstanceID: rps.instanceID,
		Op:               op,
	}

	payload, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal Redis pubsub message: %w", err)
	}

	channel := fmt.Sprintf("doc:%s", docID)
	if err := rps.client.Publish(ctx, channel, payload).Err(); err != nil {
		return fmt.Errorf("failed to publish to Redis: %w", err)
	}

	return nil
}

// PresenceEntry represents a presence record stored in Redis.
type PresenceEntry struct {
	ConnID   string `json:"conn_id"`
	UserID   string `json:"user_id"`
	UserName string `json:"user_name"`
	Color    string `json:"color"`
}

// SetPresence records or refreshes presence in Redis with a TTL.
func (rps *RedisPubSub) SetPresence(ctx context.Context, docID, connID, userID, userName, color string) error {
	if rps == nil || rps.client == nil {
		return nil
	}

	entry := PresenceEntry{
		ConnID:   connID,
		UserID:   userID,
		UserName: userName,
		Color:    color,
	}
	data, err := json.Marshal(entry)
	if err != nil {
		return err
	}

	hashKey := fmt.Sprintf("doc:%s:presence", docID)
	if err := rps.client.HSet(ctx, hashKey, connID, string(data)).Err(); err != nil {
		return err
	}
	// Expire the hash key automatically after 60s of inactivity
	rps.client.Expire(ctx, hashKey, 60*time.Second)
	return nil
}

// ReconcileGuestPresence removes any guest-prefixed presence entry associated with connID from Redis.
// Returns the stale guest ID if one was found and removed.
func (rps *RedisPubSub) ReconcileGuestPresence(ctx context.Context, docID, connID string) (string, error) {
	if rps == nil || rps.client == nil {
		return "", nil
	}

	hashKey := fmt.Sprintf("doc:%s:presence", docID)
	val, err := rps.client.HGet(ctx, hashKey, connID).Result()
	if err != nil {
		return "", nil // No prior entry
	}

	var entry PresenceEntry
	if err := json.Unmarshal([]byte(val), &entry); err != nil {
		return "", nil
	}

	if strings.HasPrefix(entry.UserID, "guest-") {
		// Delete the stale guest entry from Redis presence hash
		rps.client.HDel(ctx, hashKey, connID)
		return entry.UserID, nil
	}

	return "", nil
}

// RemovePresence purges presence for a connection ID from Redis.
func (rps *RedisPubSub) RemovePresence(ctx context.Context, docID, connID string) error {
	if rps == nil || rps.client == nil {
		return nil
	}

	hashKey := fmt.Sprintf("doc:%s:presence", docID)
	return rps.client.HDel(ctx, hashKey, connID).Err()
}

// GetActivePresence returns all active presence records for a document from Redis.
func (rps *RedisPubSub) GetActivePresence(ctx context.Context, docID string) ([]PresenceEntry, error) {
	if rps == nil || rps.client == nil {
		return nil, nil
	}

	hashKey := fmt.Sprintf("doc:%s:presence", docID)
	valMap, err := rps.client.HGetAll(ctx, hashKey).Result()
	if err != nil {
		return nil, err
	}

	entries := make([]PresenceEntry, 0, len(valMap))
	for _, val := range valMap {
		var entry PresenceEntry
		if err := json.Unmarshal([]byte(val), &entry); err == nil {
			entries = append(entries, entry)
		}
	}
	return entries, nil
}

