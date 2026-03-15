import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export const generateMultitenancy = async (config, outputDir) => {

	const multitenancyTemplate = `
package middleware

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func TenantMiddleware(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. Get Requested Tenant from Header (Hint)
		requestedTenant := c.GetHeader("X-Tenant-ID")

		// 2. Get roles from JWT (previously set by JWTMiddleware)
		userRolesInterface, exists := c.Get("UserRoles")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "No roles found in token"})
			c.Abort()
			return
		}

		roles, ok := userRolesInterface.([]interface{})
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid roles format"})
			c.Abort()
			return
		}

		// 3. Lookup AUTHORIZED DB name for these roles
		var dbName string
		err := db.Raw("SELECT db_name FROM tenant_roles WHERE role_name IN ? LIMIT 1", roles).Scan(&dbName).Error
		
		if err != nil || dbName == "" {
			c.JSON(http.StatusForbidden, gin.H{"error": "User does not belong to any active tenant context"})
			c.Abort()
			return
		}

		// 4. SECURITY CROSS-CHECK: 
		// If a tenant header is provided, it MUST match the database derived from the token.
		// This prevents "Tenant Spoofing" attacks.
		if requestedTenant != "" && requestedTenant != dbName {
			c.JSON(http.StatusForbidden, gin.H{
				"error": fmt.Sprintf("Security Breach: Requested tenant '%s' does not match authorized context", requestedTenant),
			})
			c.Abort()
			return
		}

		// 5. Store verified tenant info for downstream use
		c.Set("tenantDB", dbName)
		c.Next()
	}
}
`;

	const dbApiTemplate = `
package management

import (
	"fmt"
	"net/http"
	"os/exec"
	"{{app_name}}/config"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type DatabaseRequest struct {
	Role   string \`json:"role" binding:"required"\`
	DBName string \`json:"db_name" binding:"required"\`
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
		
		fmt.Printf("Migrating new tenant DB: %s\\n", req.DBName)
		
		cmd := exec.Command("liquibase", 
			"--url=" + jdbcUrl, 
			"--username=" + ds.Username, 
			"--password=" + ds.Password, 
			"--changeLogFile=migrations/master.xml", 
			"update")
		
		if err := cmd.Run(); err != nil {
			fmt.Printf("Liquibase Error: %v\\n", err)
			// We don't fail the whole request because the DB is created, 
			// but we warn the admin.
			c.JSON(http.StatusOK, gin.H{"message": "Database created but migration failed to auto-start. Please run manually.", "error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Database created, role mapped, and migration completed for " + req.Role})
	}
}
`;

	const middlewarePath = path.join(outputDir, 'middleware/tenant_middleware.go');
	const dbApiPath = path.join(outputDir, 'management/db_controller.go');

	await fs.ensureDir(path.join(outputDir, 'middleware'));
	await fs.ensureDir(path.join(outputDir, 'management'));

	await fs.writeFile(middlewarePath, multitenancyTemplate);
	await fs.writeFile(dbApiPath, dbApiTemplate.replace('{{app_name}}', config.name));

	console.log(chalk.gray('  Generated Multitenancy Middleware & Management API'));
};
