
package cache

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"go-duck/config"
	"github.com/go-redis/redis/v8"
)

var (
	RedisClient *redis.Client
	ctx         = context.Background()
)

// InitCache initializes Redis if enabled
func InitCache(cfg *config.Config) {
	if !cfg.GoDuck.Cache.Redis.Enabled {
		log.Println("Redis Caching is disabled.")
		return
	}

	client := redis.NewClient(&redis.Options{
		Addr:     cfg.GoDuck.Cache.Redis.Host,
		Password: cfg.GoDuck.Cache.Redis.Password,
		DB:       cfg.GoDuck.Cache.Redis.DB,
	})

	// Perform a quick ping to verify connection without crashing the app
	if err := client.Ping(ctx).Err(); err != nil {
		log.Printf("Warning: Redis is enabled but unreachable at %s: %v. Caching will be bypassed.", cfg.GoDuck.Cache.Redis.Host, err)
		return
	}

	RedisClient = client
	log.Printf("Connected to Redis at %s", cfg.GoDuck.Cache.Redis.Host)
}

// Get retrieves a value from cache
func Get(key string, dest interface{}) bool {
	if RedisClient == nil {
		return false
	}

	val, err := RedisClient.Get(ctx, key).Result()
	if err != nil {
		if err != redis.Nil {
			log.Printf("Redis Get Error: %v", err)
		}
		return false
	}

	err = json.Unmarshal([]byte(val), dest)
	return err == nil
}

// Set stores a value in cache with TTL
func Set(key string, value interface{}, ttl time.Duration) {
	if RedisClient == nil {
		return
	}

	data, err := json.Marshal(value)
	if err != nil {
		log.Printf("Redis Marshal Error: %v", err)
		return
	}

	if err := RedisClient.Set(ctx, key, data, ttl).Err(); err != nil {
		log.Printf("Redis Set Error: %v", err)
	}
}

// Delete removes a key from cache
func Delete(key string) {
	if RedisClient == nil {
		return
	}
	RedisClient.Del(ctx, key)
}

// ClearPattern deletes all keys matching a pattern (e.g. for entity invalidation)
func ClearPattern(pattern string) {
	if RedisClient == nil {
		return
	}
	iter := RedisClient.Scan(ctx, 0, pattern, 0).Iterator()
	for iter.Next(ctx) {
		RedisClient.Del(ctx, iter.Val())
	}
}
