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

type CarController struct {
	DB *gorm.DB
	Config *config.Config
}

// Create handles creating a new Car
func (ctrl *CarController) Create(c *gin.Context) {
	tenant, _ := c.Get("tenantDB")
	tenantStr := fmt.Sprintf("%v", tenant)
	ctx := c.Request.Context()

	db := ctrl.DB
	if tdb, exists := c.Get("tenantDBConn"); exists {
		db = tdb.(*gorm.DB)
	}

	var entity models.Car
	if err := c.ShouldBindJSON(&entity); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := db.WithContext(ctx).Create(&entity).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Dynamic Cache Invalidation (Tenant Aware)
	cache.ClearPattern(tenantStr + ":Car*")

	// MQTT Event (Resilient)
	resilience.Execute(func() (interface{}, error) {
		messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "CREATE", "Car", entity, nil)
		return nil, nil
	})

	c.JSON(http.StatusCreated, entity)
}

// GetAll handles fetching all Cars with filtering and pagination
func (ctrl *CarController) GetAll(c *gin.Context) {
	db := ctrl.DB
	if tdb, exists := c.Get("tenantDBConn"); exists {
		db = tdb.(*gorm.DB)
	}
	var entities []models.Car
	ctx := c.Request.Context()
	query := db.WithContext(ctx)

	// 1. Pagination
	page, _ := strconv.Atoi(c.DefaultQuery("page", "0"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	query = query.Offset(page * size).Limit(size)

	// 2. Eager Loading
	eager := c.Query("eager") == "true"
	if eager {
		query = query.Preload("Owner")
	}

	// 3. Simple Filtering
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

// GetByID handles fetching a single Car by ID
func (ctrl *CarController) GetByID(c *gin.Context) {
	id := c.Param("id")
	tenant, _ := c.Get("tenantDB")
	tenantStr := fmt.Sprintf("%v", tenant)
	ctx := c.Request.Context()

	// Tenant-Aware Cache Key
	cacheKey := fmt.Sprintf("%s:Car:%s", tenantStr, id)

	var entity models.Car

	// 1. Check Distributed Cache
	if cache.Get(cacheKey, &entity) {
		c.JSON(http.StatusOK, entity)
		return
	}

	// 2. Fallback to DB
	db := ctrl.DB
	if tdb, exists := c.Get("tenantDBConn"); exists {
		db = tdb.(*gorm.DB)
	}
	query := db.WithContext(ctx)
	if c.Query("eager") == "true" {
		query = query.Preload("Owner")
	}

	if err := query.First(&entity, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Resource not found"})
		return
	}

	// 3. Update Cache
	resilience.Execute(func() (interface{}, error) {
		cache.Set(cacheKey, entity, ctrl.Config.GoDuck.Cache.Redis.TTL)
		return nil, nil
	})

	c.JSON(http.StatusOK, entity)
}

// Update handles full update of a Car
func (ctrl *CarController) Update(c *gin.Context) {
	id := c.Param("id")
	tenant, _ := c.Get("tenantDB")
	tenantStr := fmt.Sprintf("%v", tenant)
	ctx := c.Request.Context()

	db := ctrl.DB
	if tdb, exists := c.Get("tenantDBConn"); exists {
		db = tdb.(*gorm.DB)
	}

	var entity models.Car
	if err := db.WithContext(ctx).First(&entity, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Resource not found"})
		return
	}

	prev := entity
	if err := c.ShouldBindJSON(&entity); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := db.WithContext(ctx).Save(&entity).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Cache Invalidation
	cache.Delete(fmt.Sprintf("%s:Car:%s", tenantStr, id))

	// MQTT Event
	resilience.Execute(func() (interface{}, error) {
		messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "UPDATE", "Car", entity, prev)
		return nil, nil
	})

	c.JSON(http.StatusOK, entity)
}

// Patch handles partial update of a Car
func (ctrl *CarController) Patch(c *gin.Context) {
	id := c.Param("id")
	tenant, _ := c.Get("tenantDB")
	tenantStr := fmt.Sprintf("%v", tenant)
	ctx := c.Request.Context()

	db := ctrl.DB
	if tdb, exists := c.Get("tenantDBConn"); exists {
		db = tdb.(*gorm.DB)
	}

	var entity models.Car
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

	// Cache Invalidation
	cache.Delete(fmt.Sprintf("%s:Car:%s", tenantStr, id))

	// MQTT Event
	resilience.Execute(func() (interface{}, error) {
		messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "PATCH", "Car", entity, prev)
		return nil, nil
	})

	c.JSON(http.StatusOK, gin.H{"message": "Updated successfully", "data": entity})
}

// BulkCreate handles creating multiple Cars
func (ctrl *CarController) BulkCreate(c *gin.Context) {
	tenant, _ := c.Get("tenantDB")
	tenantStr := fmt.Sprintf("%v", tenant)
	ctx := c.Request.Context()

	db := ctrl.DB
	if tdb, exists := c.Get("tenantDBConn"); exists {
		db = tdb.(*gorm.DB)
	}

	var entities []models.Car
	if err := c.ShouldBindJSON(&entities); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := db.WithContext(ctx).Create(&entities).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	cache.ClearPattern(tenantStr + ":Car*")

	resilience.Execute(func() (interface{}, error) {
		messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "BULK_CREATE", "Car", entities, nil)
		return nil, nil
	})

	c.JSON(http.StatusCreated, entities)
}

// BulkUpdate handles updating multiple Cars
func (ctrl *CarController) BulkUpdate(c *gin.Context) {
	tenant, _ := c.Get("tenantDB")
	tenantStr := fmt.Sprintf("%v", tenant)
	ctx := c.Request.Context()

	db := ctrl.DB
	if tdb, exists := c.Get("tenantDBConn"); exists {
		db = tdb.(*gorm.DB)
	}

	var entities []models.Car
	if err := c.ShouldBindJSON(&entities); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, e := range entities {
			if err := tx.Save(&e).Error; err != nil {
				return err
			}
			cache.Delete(fmt.Sprintf("%s:Car:%d", tenantStr, e.ID))
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	resilience.Execute(func() (interface{}, error) {
		messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "BULK_UPDATE", "Car", entities, nil)
		return nil, nil
	})

	c.JSON(http.StatusOK, entities)
}

// BulkPatch handles partial updating multiple Cars
func (ctrl *CarController) BulkPatch(c *gin.Context) {
	tenant, _ := c.Get("tenantDB")
	tenantStr := fmt.Sprintf("%v", tenant)
	ctx := c.Request.Context()

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
			if err := tx.Model(&models.Car{}).Where("id = ?", u.ID).Updates(u.Changes).Error; err != nil {
				return err
			}
			cache.Delete(fmt.Sprintf("%s:Car:%d", tenantStr, u.ID))
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Bulk patch completed successfully"})
}

// Delete handles deleting a Car by ID
func (ctrl *CarController) Delete(c *gin.Context) {
	id := c.Param("id")
	tenant, _ := c.Get("tenantDB")
	tenantStr := fmt.Sprintf("%v", tenant)
	ctx := c.Request.Context()

	db := ctrl.DB
	if tdb, exists := c.Get("tenantDBConn"); exists {
		db = tdb.(*gorm.DB)
	}

	var entity models.Car
	if err := db.WithContext(ctx).First(&entity, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Resource not found"})
		return
	}

	if err := db.WithContext(ctx).Delete(&entity).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	cache.Delete(fmt.Sprintf("%s:Car:%s", tenantStr, id))

	resilience.Execute(func() (interface{}, error) {
		messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "DELETE", "Car", entity, nil)
		return nil, nil
	})

	c.JSON(http.StatusNoContent, nil)
}