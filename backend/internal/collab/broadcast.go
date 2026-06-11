package collab

import (
	"context"
	"encoding/json"
	"fmt"

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
