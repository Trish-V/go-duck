package controllers

import (
"fmt"
"net/http"
"strconv"

"go-duck/config"
"go-duck/messaging"
"go-duck/models"
"go-duck/cache"
"go-duck/resilience"

"github.com/gin-gonic/gin"
"gorm.io/gorm"
)

type AuthorController struct {
DB *gorm.DB
Config *config.Config
}

// CreateAuthor
	db := ctrl.DB
	if tdb, exists := c.Get("tenantDBConn"); exists {
		db = tdb.(*gorm.DB)
	}

	var entity models.Author
	if err := c.ShouldBindJSON(&entity); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := db.WithContext(ctx).Create(&entity).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

// Dynamic Cache Invalidation (Tenant Aware)
cache.ClearPattern(tenantStr + ":Author*")

// MQTT Event (Resilient)
resilience.Execute(func() (interface{}, error) {
messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "CREATE", "Author", entity, nil)
return nil, nil
})

c.JSON(http.StatusCreated, entity)
}

// GetAllAuthors (with filtering, pagination, and lazy/eager loading)
func (ctrl *AuthorController) GetAll(c *gin.Context) {
	db := ctrl.DB
	if tdb, exists := c.Get("tenantDBConn"); exists {
		db = tdb.(*gorm.DB)
	}
	var entities []models.Author
	ctx := c.Request.Context()
	query := db.WithContext(ctx)

// 1. Pagination
page, _ := strconv.Atoi(c.DefaultQuery("page", "0"))
size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
query = query.Offset(page * size).Limit(size)

// 2. Eager Loading (Full Bodied) vs Lazy (IDs Only)
eager := c.Query("eager") == "true"
if eager {
query = query.Preload("Article")
query = query.Preload("Author")
}

// 3. Simple Filtering (Optimized for CRUD)
// Example: ?name=eq.John
for key, values := range c.Request.URL.Query() {
if key == "page" || key == "size" || key == "eager" || key == "sort" {
continue
}
for _, val := range values {
query = query.Where(key+" = ?", val)
}
}

if err := query.Find(&entities).Error; err != nil {
c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
return
}
c.JSON(http.StatusOK, entities)
}

// GetByID
func (ctrl *AuthorController) GetByID(c *gin.Context) {
id := c.Param("id")
tenant, _ := c.Get("tenantDB")
tenantStr := fmt.Sprintf("%v", tenant)
ctx := c.Request.Context()

// Tenant-Aware Cache Key
cacheKey := fmt.Sprintf("%s:Author:%s", tenantStr, id)

var entity models.Author

// 1. Check Distributed Cache (Redis)
if cache.Get(cacheKey, &entity) {
c.JSON(http.StatusOK, entity)
return
}

	// 2. Fallback to DB (With Context for Tracing)
	db := ctrl.DB
	if tdb, exists := c.Get("tenantDBConn"); exists {
		db = tdb.(*gorm.DB)
	}
	query := db.WithContext(ctx)
if c.Query("eager") == "true" {
query = query.Preload("Article")
query = query.Preload("Author")
}

if err := query.First(&entity, id).Error; err != nil {
c.JSON(http.StatusNotFound, gin.H{"error": "Resource not found"})
return
}

// 3. Update Cache (Resilient)
resilience.Execute(func() (interface{}, error) {
cache.Set(cacheKey, entity, ctrl.Config.GoDuck.Cache.Redis.TTL)
return nil, nil
})

c.JSON(http.StatusOK, entity)
}

// Update (PUT) - Full Update
	db := ctrl.DB
	if tdb, exists := c.Get("tenantDBConn"); exists {
		db = tdb.(*gorm.DB)
	}

	var entity models.Author
	if err := db.WithContext(ctx).First(&entity, id).Error; err != nil {
c.JSON(http.StatusNotFound, gin.H{"error": "Resource not found"})
return
}

// Capture Previous State
prev := entity

if err := c.ShouldBindJSON(&entity); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}

	if err := db.WithContext(ctx).Save(&entity).Error; err != nil {
c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
return
}

// Cache Invalidation (Tenant Aware)
cache.Delete(fmt.Sprintf("%s:Author:%s", tenantStr, id))

// MQTT Event (Resilient)
resilience.Execute(func() (interface{}, error) {
messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "UPDATE", "Author", entity, prev)
return nil, nil
})

c.JSON(http.StatusOK, entity)
}

// Patch (PATCH) - Partial Update
	db := ctrl.DB
	if tdb, exists := c.Get("tenantDBConn"); exists {
		db = tdb.(*gorm.DB)
	}

	var entity models.Author
	if err := db.WithContext(ctx).First(&entity, id).Error; err != nil {
c.JSON(http.StatusNotFound, gin.H{"error": "Resource not found"})
return
}
prev := entity

var updates map[string]interface{}
if err := c.ShouldBindJSON(&updates); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}

if err := db.WithContext(ctx).Model(&entity).Updates(updates).Error; err != nil {
c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
return
}

// Fetch updated
db.WithContext(ctx).First(&entity, id)

// Cache Invalidation (Tenant Aware)
cache.Delete(fmt.Sprintf("%s:Author:%s", tenantStr, id))

// MQTT Event (Resilient)
resilience.Execute(func() (interface{}, error) {
messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "PATCH", "Author", entity, prev)
return nil, nil
})

c.JSON(http.StatusOK, gin.H{"message": "Updated successfully", "data": entity})
}

// BulkCreate handles creating multiple entities in one transaction
	db := ctrl.DB
	if tdb, exists := c.Get("tenantDBConn"); exists {
		db = tdb.(*gorm.DB)
	}

	var entities []models.Author
	if err := c.ShouldBindJSON(&entities); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := db.WithContext(ctx).Create(&entities).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Dynamic Cache Invalidation (Tenant Aware)
	cache.ClearPattern(tenantStr + ":Author*")

	// MQTT Event (Resilient)
	resilience.Execute(func() (interface{}, error) {
		messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "BULK_CREATE", "Author", entities, nil)
		return nil, nil
	})

	c.JSON(http.StatusCreated, entities)
}

// BulkUpdate handles updating multiple entities in one transaction
	db := ctrl.DB
	if tdb, exists := c.Get("tenantDBConn"); exists {
		db = tdb.(*gorm.DB)
	}

	var entities []models.Author
	if err := c.ShouldBindJSON(&entities); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, e := range entities {
			if err := tx.Save(&e).Error; err != nil {
				return err
			}
			cache.Delete(fmt.Sprintf("%s:Author:%d", tenantStr, e.ID))
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// MQTT Event (Resilient)
	resilience.Execute(func() (interface{}, error) {
		messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "BULK_UPDATE", "Author", entities, nil)
		return nil, nil
	})

	c.JSON(http.StatusOK, entities)
}

// BulkPatch handles partial updates for multiple entities
	db := ctrl.DB
	if tdb, exists := c.Get("tenantDBConn"); exists {
		db = tdb.(*gorm.DB)
	}

	var updates []struct {
		ID      uint                   `json:"id"`
		Changes map[string]interface{} `json:"changes"`
	}
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, u := range updates {
			if err := tx.Model(&models.Author{}).Where("id = ?", u.ID).Updates(u.Changes).Error; err != nil {
				return err
			}
			cache.Delete(fmt.Sprintf("%s:Author:%d", tenantStr, u.ID))
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Bulk patch completed successfully"})
}

// Delete
	db := ctrl.DB
	if tdb, exists := c.Get("tenantDBConn"); exists {
		db = tdb.(*gorm.DB)
	}

	var entity models.Author
	if err := db.WithContext(ctx).First(&entity, id).Error; err != nil {
c.JSON(http.StatusNotFound, gin.H{"error": "Resource not found"})
return
}

	if err := db.WithContext(ctx).Delete(&entity).Error; err != nil {
c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
return
}

// Cache Invalidation (Tenant Aware)
cache.Delete(fmt.Sprintf("%s:Author:%s", tenantStr, id))

// MQTT Event (Resilient)
resilience.Execute(func() (interface{}, error) {
messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "DELETE", "Author", entity, nil)
return nil, nil
})

c.JSON(http.StatusNoContent, nil)
}