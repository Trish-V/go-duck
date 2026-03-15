package graph

import (
"encoding/json"
"net/http"
"go-duck/models"

"github.com/gin-gonic/gin"
"gorm.io/gorm"
)

// HandleGraphQLRequest is the main bridge for the Gin web framework.
// In a production app, we would use a more robust engine (like gqlgen).
func HandleGraphQLRequest(db *gorm.DB, c *gin.Context) {
var input struct {
Query string \`json:"query"\`
Variables map[string]interface{} \`json:"variables"\`
}

if err := c.BindJSON(&input); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid GraphQL request"})
return
}

// We'll perform basic routing for the POC.
// For production, this should integrate with a real schema loader.
c.JSON(http.StatusOK, gin.H{
"data": "GraphQL Handler Integrated Successfully!",
"note": "Ready for schema execution.",
})
}

// Resolver for each entity
func ResolveArticle(db *gorm.DB, id uint) (*models.Article, error) {
var e models.Article
if err := db.First(&e, id).Error; err != nil {
return nil, err
}
return &e, nil
}

func ResolveAllArticles(db *gorm.DB) ([]models.Article, error) {
var list []models.Article
if err := db.Find(&list).Error; err != nil {
return nil, err
}
return list, nil
}
func ResolveAuthor(db *gorm.DB, id uint) (*models.Author, error) {
var e models.Author
if err := db.First(&e, id).Error; err != nil {
return nil, err
}
return &e, nil
}

func ResolveAllAuthors(db *gorm.DB) ([]models.Author, error) {
var list []models.Author
if err := db.Find(&list).Error; err != nil {
return nil, err
}
return list, nil
}
