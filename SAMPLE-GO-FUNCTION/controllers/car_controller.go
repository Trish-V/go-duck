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

// CreateCar
func (ctrl *CarController) Create(c *gin.Context) {
tenant, _ := c.Get("tenantDB")
tenantStr := fmt.Sprintf("%v", tenant)
ctx := c.Request.Context()

var entity models.Car
if err := c.ShouldBindJSON(&entity); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
if err := ctrl.DB.WithContext(ctx).Create(&entity).Error; err != nil {
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

// GetAllCars (with filtering, pagination, and lazy/eager loading)
func (ctrl *CarController) GetAll(c *gin.Context) {
var entities []models.Car
ctx := c.Request.Context()
query := ctrl.DB.WithContext(ctx)

// 1. Pagination
page, _ := strconv.Atoi(c.DefaultQuery("page", "0"))
size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
query = query.Offset(page * size).Limit(size)

// 2. Eager Loading (Full Bodied) vs Lazy (IDs Only)
eager := c.Query("eager") == "true"
if eager {
query = query.Preload("Car")
query = query.Preload("Owner")
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
func (ctrl *CarController) GetByID(c *gin.Context) {
id := c.Param("id")
tenant, _ := c.Get("tenantDB")
tenantStr := fmt.Sprintf("%v", tenant)
ctx := c.Request.Context()

// Tenant-Aware Cache Key
cacheKey := fmt.Sprintf("%s:Car:%s", tenantStr, id)

var entity models.Car

// 1. Check Distributed Cache (Redis)
if cache.Get(cacheKey, &entity) {
c.JSON(http.StatusOK, entity)
return
}

// 2. Fallback to DB (With Context for Tracing)
query := ctrl.DB.WithContext(ctx)
if c.Query("eager") == "true" {
query = query.Preload("Car")
query = query.Preload("Owner")
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
func (ctrl *CarController) Update(c *gin.Context) {
id := c.Param("id")
tenant, _ := c.Get("tenantDB")
tenantStr := fmt.Sprintf("%v", tenant)
ctx := c.Request.Context()

var entity models.Car
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
cache.Delete(fmt.Sprintf("%s:Car:%s", tenantStr, id))

// MQTT Event (Resilient)
resilience.Execute(func() (interface{}, error) {
messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "UPDATE", "Car", entity, prev)
return nil, nil
})

c.JSON(http.StatusOK, entity)
}

// Patch (PATCH) - Partial Update
func (ctrl *CarController) Patch(c *gin.Context) {
id := c.Param("id")
tenant, _ := c.Get("tenantDB")
tenantStr := fmt.Sprintf("%v", tenant)
ctx := c.Request.Context()

var entity models.Car
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
cache.Delete(fmt.Sprintf("%s:Car:%s", tenantStr, id))

// MQTT Event (Resilient)
resilience.Execute(func() (interface{}, error) {
messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "PATCH", "Car", entity, prev)
return nil, nil
})

c.JSON(http.StatusOK, gin.H{"message": "Updated successfully", "data": entity})
}

// Delete
func (ctrl *CarController) Delete(c *gin.Context) {
id := c.Param("id")
tenant, _ := c.Get("tenantDB")
tenantStr := fmt.Sprintf("%v", tenant)
ctx := c.Request.Context()

var entity models.Car
if err := ctrl.DB.WithContext(ctx).First(&entity, id).Error; err != nil {
c.JSON(http.StatusNotFound, gin.H{"error": "Resource not found"})
return
}

if err := ctrl.DB.WithContext(ctx).Delete(&entity).Error; err != nil {
c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
return
}

// Cache Invalidation (Tenant Aware)
cache.Delete(fmt.Sprintf("%s:Car:%s", tenantStr, id))

// MQTT Event (Resilient)
resilience.Execute(func() (interface{}, error) {
messaging.PublishEvent(ctrl.Config.GoDuck.Messaging.MQTT.TopicPrefix, "DELETE", "Car", entity, nil)
return nil, nil
})

c.JSON(http.StatusNoContent, nil)
}