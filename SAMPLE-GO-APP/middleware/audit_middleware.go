
package middleware

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"go-duck/models"
)

func AuditMiddleware(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == http.MethodGet {
			c.Next()
			return
		}

		// Simplified auditing logic
		method := c.Request.Method
		path := c.Request.URL.Path
		
		// Map method to action
		action := "UPDATE"
		if method == http.MethodPost { action = "CREATE" }
		if method == http.MethodDelete { action = "DELETE" }

		// Extract Identity from context (set by JWTMiddleware)
		userEmail, _ := c.Get("UserEmail")
		emailStr := "anonymous"
		if email, ok := userEmail.(string); ok { emailStr = email }
		
		keycloakId, _ := c.Get("KeycloakID")
		kidStr := ""
		if kid, ok := keycloakId.(string); ok { kidStr = kid }
		
		clientIP := c.ClientIP()

		// Call next handlers
		c.Next()

		// Logic to capture entity ID and snapshot values would go here...
		// For now, track the action
		auditEntry := models.AuditLog{
			EntityName: path,
			Action:     action,
			ModifiedBy: emailStr,
			KeycloakID: kidStr,
			ModifiedAt: time.Now(),
			ClientIP:   clientIP,
		}
		db.Create(&auditEntry)
	}
}
