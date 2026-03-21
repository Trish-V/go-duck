
package management

import (
	"fmt"
	"net/http"
	"os/exec"
	"go-duck/config"

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

		// 3. Start Liquibase Migration for the new tenant
		appConfig, _ := config.LoadConfig()
		ds := appConfig.GoDuck.Datasource
		
		// Construct JDBC URL for the new database
		jdbcUrl := fmt.Sprintf("jdbc:postgresql://%s:%d/%s", ds.Host, ds.Port, req.DBName)
		
		fmt.Printf("Migrating new tenant DB: %s\n", req.DBName)
		
		cmd := exec.Command("liquibase", 
			"--url=" + jdbcUrl, 
			"--username=" + ds.Username, 
			"--password=" + ds.Password, 
			"--changeLogFile=migrations/master.xml", 
			"update")
		
		if err := cmd.Run(); err != nil {
			fmt.Printf("Liquibase Error: %v\n", err)
			// We don't fail the whole request because the DB is created, 
			// but we warn the admin.
			c.JSON(http.StatusOK, gin.H{"message": "Database created but migration failed to auto-start. Please run manually.", "error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Database created, role mapped, and migration completed for " + req.Role})
	}
}
