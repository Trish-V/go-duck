
package middleware

import (
	"net/http"
	"sync"
	"go-duck/config"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

var (
	limiters = make(map[string]*rate.Limiter)
	mu       sync.Mutex
)

// RateLimitMiddleware provides burst protection based on configuration
func RateLimitMiddleware(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		
		mu.Lock()
		limiter, exists := limiters[ip]
		if !exists {
			rps := cfg.GoDuck.Security.RateLimit.RPS
			burst := cfg.GoDuck.Security.RateLimit.Burst
			limiter = rate.NewLimiter(rate.Limit(rps), burst)
			limiters[ip] = limiter
		}
		mu.Unlock()

		if !limiter.Allow() {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "Rate limit exceeded. Please try again later.",
			})
			return
		}
		c.Next()
	}
}
