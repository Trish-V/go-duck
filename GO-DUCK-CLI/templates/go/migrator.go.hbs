package migrations

import (
	"embed"
	"fmt"

	"github.com/pressly/goose/v3"
	"gorm.io/gorm"
)

// Global migrations embed filesystem
//go:embed sql/*.sql
var embedMigrations embed.FS

// RunGoNativeMigrations performs idempotent schema updates using Goose and maintains a migration version table
func RunGoNativeMigrations(db *gorm.DB) error {
	fmt.Printf("Checking embedded migrations with Goose...\n")

	// Get native SQL DB from GORM
	sqlDB, err := db.DB()
	if err != nil {
		return fmt.Errorf("failed to get sql.DB: %v", err)
	}

	// 1. Setup Goose
    // Goose natively supports versioning and history tracking via its version table.
    // We rename it to 'database_changelog' for the user.
	goose.SetTableName("database_changelog")
	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("failed to set goose dialect: %v", err)
	}

	// 2. Use embedded FS (migrator.go is in 'migrations/' and SQL files are in 'migrations/sql/')
    // So the path relative to Go source file is 'sql'
	goose.SetBaseFS(embedMigrations)

	// 3. Run Migrations
	if err := goose.Up(sqlDB, "sql"); err != nil {
		return fmt.Errorf("goose up failed: %v", err)
	}

	fmt.Println("All Goose migrations completed successfully.")
	return nil
}

// RunGoNativeMigrationsForTenant runs migrations for a specific tenant DB
func RunGoNativeMigrationsForTenant(db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return fmt.Errorf("failed to get sql.DB: %v", err)
	}

	goose.SetTableName("database_changelog")
	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("failed to set goose dialect: %v", err)
	}

	goose.SetBaseFS(embedMigrations)

	if err := goose.Up(sqlDB, "sql"); err != nil {
		return fmt.Errorf("goose up failed for tenant: %v", err)
	}

	return nil
}
