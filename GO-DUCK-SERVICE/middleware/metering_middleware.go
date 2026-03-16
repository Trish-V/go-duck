
package middleware

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"go-duck/models"
)

func MeteringMiddleware(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		keycloakId, exists := c.Get("KeycloakID")
		if !exists {
			c.Next()
			return
		}
		userID := keycloakId.(string)

		path := c.Request.URL.Path
		var usage models.APIUsage

		// Get usage and limit
		result := db.Where("user_id = ? AND api_path = ?", userID, path).First(&usage)
		if result.Error == gorm.ErrRecordNotFound {
			usage = models.APIUsage{
				UserID:     userID,
				APIPath:    path,
				UsageCount: 1,
				MaxLimit:   1000, // Default limit
				LastAccessed: time.Now(),
			}
			db.Create(&usage)
		} else {
			if usage.UsageCount >= usage.MaxLimit {
				c.JSON(http.StatusTooManyRequests, gin.H{
					"error": "Usage limit exceeded",
					"limit": usage.MaxLimit,
					"usage": usage.UsageCount,
				})
				c.Abort()
				return
			}
			db.Model(&usage).Updates(map[string]interface{}{
				"usage_count":   usage.UsageCount + 1,
				"last_accessed": time.Now(),
			})
		}

		c.Next()
	}
}
