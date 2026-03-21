import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import Handlebars from 'handlebars';

Handlebars.registerHelper('capitalize', (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
});

export const generateMultitenancy = async (config, outputDir, entities = []) => {

	const multitenancyTemplate = `
package middleware

import (
	"fmt"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"{{app_name}}/config"
)

// TenantDBManager handles dynamic connection pooling for all tenants
type TenantDBManager struct {
	masterDB *gorm.DB
	configs  *config.Config
	conns    map[string]*gorm.DB
	mu       sync.RWMutex
}

var (
	manager *TenantDBManager
	once    sync.Once
)

func GetTenantManager(db *gorm.DB, cfg *config.Config) *TenantDBManager {
	once.Do(func() {
		manager = &TenantDBManager{
			masterDB: db,
			configs:  cfg,
			conns:    make(map[string]*gorm.DB),
		}
	})
	return manager
}

func (m *TenantDBManager) GetDB(dbName string) (*gorm.DB, error) {
	m.mu.RLock()
	if db, ok := m.conns[dbName]; ok {
		m.mu.RUnlock()
		return db, nil
	}
	m.mu.RUnlock()

	m.mu.Lock()
	defer m.mu.Unlock()

	// Double check
	if db, ok := m.conns[dbName]; ok {
		return db, nil
	}

	// Dynamic Connection Opening
	ds := m.configs.GoDuck.Datasource
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%d sslmode=disable TimeZone=UTC",
		ds.Host, ds.Username, ds.Password, dbName, ds.Port)

	newDB, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		return nil, err
	}

	m.conns[dbName] = newDB
	return newDB, nil
}

func PublicTenantMiddleware(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	mgr := GetTenantManager(db, cfg)

	return func(c *gin.Context) {
		requestedTenant := c.GetHeader("X-Tenant-ID")
		if requestedTenant == "" {
			c.JSON(http.StatusForbidden, gin.H{"error": "X-Tenant-ID header required for public access"})
			c.Abort()
			return
		}

		tenantConn, err := mgr.GetDB(requestedTenant)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to resolve tenant database connection"})
			c.Abort()
			return
		}

		c.Set("tenantDB", requestedTenant)
		c.Set("tenantDBConn", tenantConn)
		c.Next()
	}
}

func TenantMiddleware(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	mgr := GetTenantManager(db, cfg)

	return func(c *gin.Context) {
		// 1. Identification (Hint from Header)
		requestedTenant := c.GetHeader("X-Tenant-ID")

		// 2. Authorization (Extracted from JWT by JWTMiddleware)
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

		// 3. Resolution (Which DB is this role authorized to access?)
		var dbName string
		err := db.Raw("SELECT db_name FROM tenant_roles WHERE role_name IN ? LIMIT 1", roles).Scan(&dbName).Error
		
		if err != nil || dbName == "" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Security: No tenant context mapped to user roles"})
			c.Abort()
			return
		}

		// 4. Security Check (Prevent Cross-Tenant Spoofing)
		if requestedTenant != "" && requestedTenant != dbName {
			c.JSON(http.StatusForbidden, gin.H{"error": "Security Breach: Header/Token tenant mismatch"})
			c.Abort()
			return
		}

		// 5. Dynamic Switching (Get or Create the DB Connection)
		tenantConn, err := mgr.GetDB(dbName)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to resolve tenant database connection"})
			c.Abort()
			return
		}

		// 6. Inject Live Connection into Context
		c.Set("tenantDB", dbName)
		c.Set("tenantDBConn", tenantConn)
		c.Next()
	}
}
`;

	const dbApiTemplate = `
package management

import (
	"fmt"
	"net/http"
	"{{app_name}}/config"
	"{{app_name}}/middleware"
	"{{app_name}}/migrations"

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

		// 3. Run Goose Migrations for the new tenant
		fmt.Printf("Migrating new tenant DB: %s using Goose\\n", req.DBName)
		
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
`;

	const tenantRoleModel = `
package models

type TenantRole struct {
	ID       uint    \`gorm:"primaryKey" json:"id"\`
	RoleName string  \`json:"roleName" gorm:"unique;not null"\`
	DBName   string  \`json:"dbName" gorm:"not null"\`
}
`;

	const middlewarePath = path.join(outputDir, 'middleware/tenant_middleware.go');
	const dbApiPath = path.join(outputDir, 'management/db_controller.go');
    const tenantModelPath = path.join(outputDir, 'models/tenant_role.go');

	await fs.ensureDir(path.join(outputDir, 'middleware'));
	await fs.ensureDir(path.join(outputDir, 'management'));
    await fs.ensureDir(path.join(outputDir, 'models'));

	await fs.writeFile(middlewarePath, Handlebars.compile(multitenancyTemplate)({ app_name: config.name, entities }));
	await fs.writeFile(dbApiPath, Handlebars.compile(dbApiTemplate)({ app_name: config.name, entities }));
    await fs.writeFile(tenantModelPath, tenantRoleModel);

	console.log(chalk.gray('  Generated Multitenancy Middleware & Management API'));
};
