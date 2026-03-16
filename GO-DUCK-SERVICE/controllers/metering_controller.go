
package controllers

import (
	"net/http"
	"go-duck/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type MeteringController struct {
	DB *gorm.DB
}

func (mc *MeteringController) SetLimit(c *gin.Context) {
	var req struct {
		UserID   string `json:"userId" binding:"required"`
		APIPath  string `json:"apiPath" binding:"required"`
		MaxLimit int64  `json:"maxLimit" binding:"required"`
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
