
package middleware

import (
	"go-duck/config"
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
