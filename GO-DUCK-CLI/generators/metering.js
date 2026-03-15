import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export const generateMeteringCode = async (config, outputDir) => {
    const middlewareDir = path.join(outputDir, 'middleware');
    const modelsDir = path.join(outputDir, 'models');
    const controllersDir = path.join(outputDir, 'controllers');

    await fs.ensureDir(middlewareDir);
    await fs.ensureDir(modelsDir);
    await fs.ensureDir(controllersDir);

    const meteringModel = `
package models

import (
	"time"
)

type APIUsage struct {
	ID          uint      \`gorm:"primaryKey" json:"id"\`
	UserID      string    \`json:"userId" gorm:"index:idx_user_api,unique"\`
	APIPath     string    \`json:"apiPath" gorm:"index:idx_user_api,unique"\`
	UsageCount  int64     \`json:"usageCount"\`
	MaxLimit    int64     \`json:"maxLimit" gorm:"default:1000"\`
	LastAccessed time.Time \`json:"lastAccessed"\`
}
`;

    const meteringMiddleware = `
package middleware

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"{{app_name}}/models"
)

func MeteringMiddleware(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetHeader("X-Keycloak-Id")
		if userID == "" {
			c.Next()
			return
		}

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
`;

    const meteringController = `
package controllers

import (
	"net/http"
	"{{app_name}}/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type MeteringController struct {
	DB *gorm.DB
}

func (mc *MeteringController) SetLimit(c *gin.Context) {
	var req struct {
		UserID   string \`json:"userId" binding:"required"\`
		APIPath  string \`json:"apiPath" binding:"required"\`
		MaxLimit int64  \`json:"maxLimit" binding:"required"\`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var usage models.APIUsage
	result := mc.DB.Where("user_id = ? AND api_path = ?", req.UserID, req.APIPath).First(&usage)
	
	if result.Error == gorm.ErrRecordNotFound {
		usage = models.APIUsage{
			UserID:     req.UserID,
			APIPath:    req.APIPath,
			MaxLimit:   req.MaxLimit,
			UsageCount: 0,
		}
		mc.DB.Create(&usage)
	} else {
		mc.DB.Model(&usage).Update("max_limit", req.MaxLimit)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Limit updated successfully"})
}

func (mc *MeteringController) GetUsage(c *gin.Context) {
	var usages []models.APIUsage
	mc.DB.Find(&usages)
	c.JSON(http.StatusOK, usages)
}
`;

    await fs.writeFile(path.join(modelsDir, 'api_usage.go'), meteringModel);
    await fs.writeFile(path.join(middlewareDir, 'metering_middleware.go'), meteringMiddleware.replace('{{app_name}}', config.name));
    await fs.writeFile(path.join(controllersDir, 'metering_controller.go'), meteringController.replace('{{app_name}}', config.name));

    console.log(chalk.gray('  Generated Metering Model, Middleware & Controller'));
};
