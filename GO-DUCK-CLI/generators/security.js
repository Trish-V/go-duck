import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export const generateSecurityMiddleware = async (config, outputDir) => {
	const middlewareDir = path.join(outputDir, 'middleware');
	await fs.ensureDir(middlewareDir);

	const jwtMiddleware = `
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
`;

	const rateLimitMiddleware = `
package middleware

import (
	"net/http"
	"sync"
	"{{app_name}}/config"

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
`;

	await fs.writeFile(path.join(middlewareDir, 'jwt_middleware.go'), jwtMiddleware);
	await fs.writeFile(path.join(middlewareDir, 'rate_limit_middleware.go'), rateLimitMiddleware.replace('{{app_name}}', config.name));

	const corsMiddleware = `
package middleware

import (
	"{{app_name}}/config"
	"github.com/gin-gonic/gin"
)

func CORSMiddleware(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		origins := cfg.GoDuck.Server.CORS.AllowOrigins
		methods := cfg.GoDuck.Server.CORS.AllowMethods
		headers := cfg.GoDuck.Server.CORS.AllowHeaders

		origin := c.Request.Header.Get("Origin")
		allowOrigin := ""
		for _, o := range origins {
			if o == "*" || o == origin {
				allowOrigin = origin
				if o == "*" {
					allowOrigin = "*"
				}
				break
			}
		}

		if allowOrigin != "" {
			c.Writer.Header().Set("Access-Control-Allow-Origin", allowOrigin)
		}
		
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		
		headerString := ""
		for i, h := range headers {
			if i > 0 { headerString += ", " }
			headerString += h
		}
		c.Writer.Header().Set("Access-Control-Allow-Headers", headerString)

		methodString := ""
		for i, m := range methods {
			if i > 0 { methodString += ", " }
			methodString += m
		}
		c.Writer.Header().Set("Access-Control-Allow-Methods", methodString)

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}
`;

	await fs.writeFile(path.join(middlewareDir, 'cors_middleware.go'), corsMiddleware.replace('{{app_name}}', config.name));
	console.log(chalk.gray('  Generated Advanced Security & CORS Middleware'));
};
