
package controllers

import (
	"net/http"
	"go-duck/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type AuditController struct {
	DB *gorm.DB
}

func (ac *AuditController) GetLogs(c *gin.Context) {
	var logs []models.AuditLog
	ac.DB.Order("modified_at desc").Find(&logs)
	c.JSON(http.StatusOK, logs)
}
