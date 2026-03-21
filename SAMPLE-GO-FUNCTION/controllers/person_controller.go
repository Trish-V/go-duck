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

type PersonController struct {
	DB *gorm.DB
	Config *config.Config
}

// Create handles creating a new Person
func (ctrl *PersonController) Create(c *gin.Context) {
	id := c.Param("id") // Not used for create usually, but keeping consistency with context
	tenant, _ := c.Get("tenantDB")
	tenantStr := fmt.Sprintf("%v", tenant)
	ctx := c.Request.Context()

	db := ctrl.DB
	if tdb, exists := c.Get("tenantDBConn"); exists {
		db = tdb.(*gorm.DB)
	}

	var entity models.Person
	if err := c.ShouldBindJSON(&entity); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := db.WithContext(ctx).Create(&entity).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Dynamic Cache Invalidation (Tenant Aware)
	cache.ClearPattern(tenantStr + ":Person*")

	// MQTT Event (Resilient)
	resilience.Execute(func() (interface{}, error) {
		messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "CREATE", "Person", entity, nil)
		return nil, nil
	})

	c.JSON(http.StatusCreated, entity)
}

// GetAll handles fetching all Persons with filtering and pagination
func (ctrl *PersonController) GetAll(c *gin.Context) {
	db := ctrl.DB
	if tdb, exists := c.Get("tenantDBConn"); exists {
		db = tdb.(*gorm.DB)
	}
	var entities []models.Person
	ctx := c.Request.Context()
	query := db.WithContext(ctx)

	// 1. Pagination
	page, _ := strconv.Atoi(c.DefaultQuery("page", "0"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	query = query.Offset(page * size).Limit(size)

	// 2. Eager Loading
	eager := c.Query("eager") == "true"
	if eager {
		query = query.Preload("Car")
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

// GetByID handles fetching a single Person by ID
func (ctrl *PersonController) GetByID(c *gin.Context) {
	id := c.Param("id")
	tenant, _ := c.Get("tenantDB")
	tenantStr := fmt.Sprintf("%v", tenant)
	ctx := c.Request.Context()

	// Tenant-Aware Cache Key
	cacheKey := fmt.Sprintf("%s:Person:%s", tenantStr, id)

	var entity models.Person

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
		query = query.Preload("Car")
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

// Update handles full update of a Person
func (ctrl *PersonController) Update(c *gin.Context) {
	id := c.Param("id")
	tenant, _ := c.Get("tenantDB")
	tenantStr := fmt.Sprintf("%v", tenant)
	ctx := c.Request.Context()

	db := ctrl.DB
	if tdb, exists := c.Get("tenantDBConn"); exists {
		db = tdb.(*gorm.DB)
	}

	var entity models.Person
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
	cache.Delete(fmt.Sprintf("%s:Person:%s", tenantStr, id))

	// MQTT Event
	resilience.Execute(func() (interface{}, error) {
		messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "UPDATE", "Person", entity, prev)
		return nil, nil
	})

	c.JSON(http.StatusOK, entity)
}

// Patch handles partial update of a Person
func (ctrl *PersonController) Patch(c *gin.Context) {
	id := c.Param("id")
	tenant, _ := c.Get("tenantDB")
	tenantStr := fmt.Sprintf("%v", tenant)
	ctx := c.Request.Context()

	db := ctrl.DB
	if tdb, exists := c.Get("tenantDBConn"); exists {
		db = tdb.(*gorm.DB)
	}

	var entity models.Person
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
	cache.Delete(fmt.Sprintf("%s:Person:%s", tenantStr, id))

	// MQTT Event
	resilience.Execute(func() (interface{}, error) {
		messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "PATCH", "Person", entity, prev)
		return nil, nil
	})

	c.JSON(http.StatusOK, gin.H{"message": "Updated successfully", "data": entity})
}

// BulkCreate handles creating multiple Persons
func (ctrl *PersonController) BulkCreate(c *gin.Context) {
	tenant, _ := c.Get("tenantDB")
	tenantStr := fmt.Sprintf("%v", tenant)
	ctx := c.Request.Context()

	db := ctrl.DB
	if tdb, exists := c.Get("tenantDBConn"); exists {
		db = tdb.(*gorm.DB)
	}

	var entities []models.Person
	if err := c.ShouldBindJSON(&entities); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := db.WithContext(ctx).Create(&entities).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	cache.ClearPattern(tenantStr + ":Person*")

	resilience.Execute(func() (interface{}, error) {
		messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "BULK_CREATE", "Person", entities, nil)
		return nil, nil
	})

	c.JSON(http.StatusCreated, entities)
}

// BulkUpdate handles updating multiple Persons
func (ctrl *PersonController) BulkUpdate(c *gin.Context) {
	tenant, _ := c.Get("tenantDB")
	tenantStr := fmt.Sprintf("%v", tenant)
	ctx := c.Request.Context()

	db := ctrl.DB
	if tdb, exists := c.Get("tenantDBConn"); exists {
		db = tdb.(*gorm.DB)
	}

	var entities []models.Person
	if err := c.ShouldBindJSON(&entities); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, e := range entities {
			if err := tx.Save(&e).Error; err != nil {
				return err
			}
			cache.Delete(fmt.Sprintf("%s:Person:%d", tenantStr, e.ID))
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	resilience.Execute(func() (interface{}, error) {
		messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "BULK_UPDATE", "Person", entities, nil)
		return nil, nil
	})

	c.JSON(http.StatusOK, entities)
}

// BulkPatch handles partial updating multiple Persons
func (ctrl *PersonController) BulkPatch(c *gin.Context) {
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
			if err := tx.Model(&models.Person{}).Where("id = ?", u.ID).Updates(u.Changes).Error; err != nil {
				return err
			}
			cache.Delete(fmt.Sprintf("%s:Person:%d", tenantStr, u.ID))
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Bulk patch completed successfully"})
}

// Delete handles deleting a Person by ID
func (ctrl *PersonController) Delete(c *gin.Context) {
	id := c.Param("id")
	tenant, _ := c.Get("tenantDB")
	tenantStr := fmt.Sprintf("%v", tenant)
	ctx := c.Request.Context()

	db := ctrl.DB
	if tdb, exists := c.Get("tenantDBConn"); exists {
		db = tdb.(*gorm.DB)
	}

	var entity models.Person
	if err := db.WithContext(ctx).First(&entity, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Resource not found"})
		return
	}

	if err := db.WithContext(ctx).Delete(&entity).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	cache.Delete(fmt.Sprintf("%s:Person:%s", tenantStr, id))

	resilience.Execute(func() (interface{}, error) {
		messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "DELETE", "Person", entity, nil)
		return nil, nil
	})

	c.JSON(http.StatusNoContent, nil)
}