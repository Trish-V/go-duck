import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export const generatePostgRESTCode = async (config, outputDir) => {
    const controllersDir = path.join(outputDir, 'controllers');
    await fs.ensureDir(controllersDir);

    const postgrestController = `
package controllers

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type SearchController struct {
	DB *gorm.DB
}

// GenericSearch handles PostgREST-like queries
// Syntax: /api/search/:table?age=gt.20&order=id.desc&limit=10&offset=0
func (sc *SearchController) GenericSearch(c *gin.Context) {
	tableName := c.Param("table")
	query := sc.DB.Table(tableName)

	// Apply Filters
	params := c.Request.URL.Query()
	for key, values := range params {
		if key == "order" || key == "limit" || key == "offset" || key == "select" {
			continue
		}

		// Security: Basic Sanitization for Key (Allowing letters, numbers, _, -, and JSON arrows)
		// We split the key if it contains JSON operators to handle them specifically
		processedKey := key
		if strings.Contains(key, "->") {
			parts := strings.SplitN(key, "->", 2)
			column := parts[0]
			path := parts[1]
			operator := "->"
			if strings.HasPrefix(path, ">") {
				operator = "->>"
				path = path[1:]
			}
			// Wrap column in quotes and path in single quotes for Postgres JSONB safety
			processedKey = fmt.Sprintf("\"%s\"%s'%s'", column, operator, path)
		} else {
			// Standard column: Wrap in quotes for safety
			processedKey = fmt.Sprintf("\"%s\"", key)
		}

		for _, val := range values {
			parts := strings.SplitN(val, ".", 2)
			if len(parts) < 2 {
				// Default to equality
				query = query.Where(processedKey+" = ?", val)
				continue
			}

			op := parts[0]
			target := parts[1]

			switch op {
			case "eq":
				query = query.Where(processedKey+" = ?", target)
			case "neq":
				query = query.Where(processedKey+" <> ?", target)
			case "gt":
				query = query.Where(processedKey+" > ?", target)
			case "gte":
				query = query.Where(processedKey+" >= ?", target)
			case "lt":
				query = query.Where(processedKey+" < ?", target)
			case "lte":
				query = query.Where(processedKey+" <= ?", target)
			case "like":
				query = query.Where(processedKey+" LIKE ?", "%"+target+"%")
			case "ilike":
				query = query.Where(processedKey+" ILIKE ?", "%"+target+"%")
			case "in":
				list := strings.Split(target, ",")
				query = query.Where(processedKey+" IN ?", list)
			default:
				// Fallback to equality if operator is unrecognized
				query = query.Where(processedKey+" = ?", val)
			}
		}
	}

	// Apply Sorting
	if order := c.Query("order"); order != "" {
		parts := strings.SplitN(order, ".", 2)
		field := parts[0]
		direction := "asc"
		if len(parts) > 1 {
			direction = parts[1]
		}
		query = query.Order(fmt.Sprintf("%s %s", field, direction))
	}

	// Apply Pagination
	if limit := c.Query("limit"); limit != "" {
		query = query.Limit(parseInt(limit, 10))
	} else {
		query = query.Limit(100) // Default limit
	}

	if offset := c.Query("offset"); offset != "" {
		query = query.Offset(parseInt(offset, 0))
	}

	var results []map[string]interface{}
	if err := query.Find(&results).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Search failed: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, results)
}

func parseInt(s string, def int) int {
	var val int
	if _, err := fmt.Sscanf(s, "%d", &val); err != nil {
		return def
	}
	return val
}
`;

    await fs.writeFile(path.join(controllersDir, 'search_controller.go'), postgrestController);
    console.log(chalk.gray('  Generated PostgREST-like Search Controller'));
};
