
package management

import (
	"fmt"
	"net/http"
	"go-duck/config"
	"go-duck/middleware"
	"go-duck/migrations"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type DatabaseRequest struct {
	Role   string `json:"role" binding:"required"`
	DBName string `json:"db_name" binding:"required"`
}

func CreateDatabaseAndMigrate(masterDB *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req DatabaseRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// 1. CREATE DATABASE
		// Note: CREATE DATABASE cannot be run in a transaction.
		// We use the masterDB connection.
		if err := masterDB.Exec(fmt.Sprintf("CREATE DATABASE %s", req.DBName)).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create database: " + err.Error()})
			return
		}

		// 2. Insert into roles mapping table
		if err := masterDB.Exec("INSERT INTO tenant_roles (role_name, db_name) VALUES (?, ?)", req.Role, req.DBName).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to map role: " + err.Error()})
			return
		}

		// 3. Run Goose Migrations for the new tenant
		fmt.Printf("Migrating new tenant DB: %s using Goose\n", req.DBName)
		
        // Get the connection we just opened
        appConfig, _ := config.LoadConfig()
		mgr := middleware.GetTenantManager(masterDB, appConfig)
        tenantDB, err := mgr.GetDB(req.DBName)
        if err != nil {
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to connect to new tenant DB: " + err.Error()})
            return
        }

        if err := migrations.RunGoNativeMigrationsForTenant(tenantDB); err != nil {
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Tenant migration failed: " + err.Error()})
            return
        }

		c.JSON(http.StatusOK, gin.H{"message": "Database created, role mapped, and migration completed for " + req.Role})
	}
}
