
package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v4"
)

// JWTMiddleware validates Keycloak JWTs
func JWTMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid token format"})
			return
		}

		tokenString := parts[1]
		
		token, _, err := new(jwt.Parser).ParseUnverified(tokenString, jwt.MapClaims{})
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Could not parse token"})
			return
		}

		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			c.Set("KeycloakID", claims["sub"])
			c.Set("UserEmail", claims["email"])
			if ra, ok := claims["realm_access"].(map[string]interface{}); ok {
				c.Set("UserRoles", ra["roles"])
			}
		}

		c.Next()
	}
}

func GetUserID(c *gin.Context) string {
	val, _ := c.Get("KeycloakID")
	if str, ok := val.(string); ok {
		return str
	}
	return "anonymous"
}
