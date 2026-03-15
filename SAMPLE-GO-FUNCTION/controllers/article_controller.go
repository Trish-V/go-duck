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

type ArticleController struct {
DB *gorm.DB
Config *config.Config
}

// CreateArticle
func (ctrl *ArticleController) Create(c *gin.Context) {
tenant, _ := c.Get("tenantDB")
tenantStr := fmt.Sprintf("%v", tenant)
ctx := c.Request.Context()

var entity models.Article
if err := c.ShouldBindJSON(&entity); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
if err := ctrl.DB.WithContext(ctx).Create(&entity).Error; err != nil {
c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
return
}

// Dynamic Cache Invalidation (Tenant Aware)
cache.ClearPattern(tenantStr + ":Article*")

// MQTT Event (Resilient)
resilience.Execute(func() (interface{}, error) {
messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "CREATE", "Article", entity, nil)
return nil, nil
})

c.JSON(http.StatusCreated, entity)
}

// GetAllArticles (with filtering, pagination, and lazy/eager loading)
func (ctrl *ArticleController) GetAll(c *gin.Context) {
var entities []models.Article
ctx := c.Request.Context()
query := ctrl.DB.WithContext(ctx)

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
func (ctrl *ArticleController) GetByID(c *gin.Context) {
id := c.Param("id")
tenant, _ := c.Get("tenantDB")
tenantStr := fmt.Sprintf("%v", tenant)
ctx := c.Request.Context()

// Tenant-Aware Cache Key
cacheKey := fmt.Sprintf("%s:Article:%s", tenantStr, id)

var entity models.Article

// 1. Check Distributed Cache (Redis)
if cache.Get(cacheKey, &entity) {
c.JSON(http.StatusOK, entity)
return
}

// 2. Fallback to DB (With Context for Tracing)
query := ctrl.DB.WithContext(ctx)
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
func (ctrl *ArticleController) Update(c *gin.Context) {
id := c.Param("id")
tenant, _ := c.Get("tenantDB")
tenantStr := fmt.Sprintf("%v", tenant)
ctx := c.Request.Context()

var entity models.Article
if err := ctrl.DB.WithContext(ctx).First(&entity, id).Error; err != nil {
c.JSON(http.StatusNotFound, gin.H{"error": "Resource not found"})
return
}

// Capture Previous State
prev := entity

if err := c.ShouldBindJSON(&entity); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}

if err := ctrl.DB.WithContext(ctx).Save(&entity).Error; err != nil {
c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
return
}

// Cache Invalidation (Tenant Aware)
cache.Delete(fmt.Sprintf("%s:Article:%s", tenantStr, id))

// MQTT Event (Resilient)
resilience.Execute(func() (interface{}, error) {
messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "UPDATE", "Article", entity, prev)
return nil, nil
})

c.JSON(http.StatusOK, entity)
}

// Patch (PATCH) - Partial Update
func (ctrl *ArticleController) Patch(c *gin.Context) {
id := c.Param("id")
tenant, _ := c.Get("tenantDB")
tenantStr := fmt.Sprintf("%v", tenant)
ctx := c.Request.Context()

var entity models.Article
if err := ctrl.DB.WithContext(ctx).First(&entity, id).Error; err != nil {
c.JSON(http.StatusNotFound, gin.H{"error": "Resource not found"})
return
}
prev := entity

var updates map[string]interface{}
if err := c.ShouldBindJSON(&updates); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}

if err := ctrl.DB.WithContext(ctx).Model(&entity).Updates(updates).Error; err != nil {
c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
return
}

// Fetch updated
ctrl.DB.WithContext(ctx).First(&entity, id)

// Cache Invalidation (Tenant Aware)
cache.Delete(fmt.Sprintf("%s:Article:%s", tenantStr, id))

// MQTT Event (Resilient)
resilience.Execute(func() (interface{}, error) {
messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "PATCH", "Article", entity, prev)
return nil, nil
})

c.JSON(http.StatusOK, gin.H{"message": "Updated successfully", "data": entity})
}

// BulkCreate handles creating multiple entities in one transaction
func (ctrl *ArticleController) BulkCreate(c *gin.Context) {
	tenant, _ := c.Get("tenantDB")
	tenantStr := fmt.Sprintf("%v", tenant)
	ctx := c.Request.Context()

	var entities []models.Article
	if err := c.ShouldBindJSON(&entities); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := ctrl.DB.WithContext(ctx).Create(&entities).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Dynamic Cache Invalidation (Tenant Aware)
	cache.ClearPattern(tenantStr + ":Article*")

	// MQTT Event (Resilient)
	resilience.Execute(func() (interface{}, error) {
		messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "BULK_CREATE", "Article", entities, nil)
		return nil, nil
	})

	c.JSON(http.StatusCreated, entities)
}

// BulkUpdate handles updating multiple entities in one transaction
func (ctrl *ArticleController) BulkUpdate(c *gin.Context) {
	tenant, _ := c.Get("tenantDB")
	tenantStr := fmt.Sprintf("%v", tenant)
	ctx := c.Request.Context()

	var entities []models.Article
	if err := c.ShouldBindJSON(&entities); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := ctrl.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, e := range entities {
			if err := tx.Save(&e).Error; err != nil {
				return err
			}
			cache.Delete(fmt.Sprintf("%s:Article:%d", tenantStr, e.ID))
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// MQTT Event (Resilient)
	resilience.Execute(func() (interface{}, error) {
		messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "BULK_UPDATE", "Article", entities, nil)
		return nil, nil
	})

	c.JSON(http.StatusOK, entities)
}

// BulkPatch handles partial updates for multiple entities
func (ctrl *ArticleController) BulkPatch(c *gin.Context) {
	tenant, _ := c.Get("tenantDB")
	tenantStr := fmt.Sprintf("%v", tenant)
	ctx := c.Request.Context()

	var updates []struct {
		ID      uint                   `json:"id"`
		Changes map[string]interface{} `json:"changes"`
	}
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := ctrl.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, u := range updates {
			if err := tx.Model(&models.Article{}).Where("id = ?", u.ID).Updates(u.Changes).Error; err != nil {
				return err
			}
			cache.Delete(fmt.Sprintf("%s:Article:%d", tenantStr, u.ID))
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
func (ctrl *ArticleController) Delete(c *gin.Context) {
id := c.Param("id")
tenant, _ := c.Get("tenantDB")
tenantStr := fmt.Sprintf("%v", tenant)
ctx := c.Request.Context()

var entity models.Article
if err := ctrl.DB.WithContext(ctx).First(&entity, id).Error; err != nil {
c.JSON(http.StatusNotFound, gin.H{"error": "Resource not found"})
return
}

if err := ctrl.DB.WithContext(ctx).Delete(&entity).Error; err != nil {
c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
return
}

// Cache Invalidation (Tenant Aware)
cache.Delete(fmt.Sprintf("%s:Article:%s", tenantStr, id))

// MQTT Event (Resilient)
resilience.Execute(func() (interface{}, error) {
messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "DELETE", "Article", entity, nil)
return nil, nil
})

c.JSON(http.StatusNoContent, nil)
}