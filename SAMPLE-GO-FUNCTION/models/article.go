package models

import (
"time"
)

type Article struct {
ID uint `gorm:"primaryKey" json:"id"`
Title string `gorm:"uniqueIndex" json:"title" binding:"required"`
Content string `json:"content" binding:"required"`
Status ArticleStatus `json:"status" binding:"required"`
PublishedDate time.Time `json:"publishedDate" `
CreatedBy string `gorm:"column:created_by" json:"createdBy"`
CreatedDate time.Time `gorm:"column:created_date" json:"createdDate"`
LastModifiedBy string `gorm:"column:last_modified_by" json:"lastModifiedBy"`
LastModifiedDate time.Time `gorm:"column:last_modified_date" json:"lastModifiedDate"`
LastModifiedUserID string `gorm:"column:last_modified_user_id" json:"lastModifiedUserId"`
AuthorID *uint `gorm:"column:author_id;index" json:"authorId"`
Author *Author `gorm:"foreignKey:AuthorID"
json:"author,omitempty"`
}