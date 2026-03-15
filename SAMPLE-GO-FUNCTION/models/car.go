package models

import (
"time"
"gorm.io/datatypes"
)

type Car struct {
ID uint `gorm:"primaryKey" json:"id"`
Name string `gorm:"uniqueIndex" json:"name" binding:"required"`
Model string `json:"model" binding:"required"`
Year int `json:"year" `
Price float64 `json:"price" `
Color string `json:"color" `
Features datatypes.JSON `gorm:"type:jsonb;serializer:json" json:"features" `
CreatedBy string `gorm:"column:created_by" json:"createdBy"`
CreatedDate time.Time `gorm:"column:created_date" json:"createdDate"`
LastModifiedBy string `gorm:"column:last_modified_by" json:"lastModifiedBy"`
LastModifiedDate time.Time `gorm:"column:last_modified_date" json:"lastModifiedDate"`
LastModifiedUserID string `gorm:"column:last_modified_user_id" json:"lastModifiedUserId"`
OwnerID *uint `gorm:"column:owner_id;index" json:"ownerId"`
Owner *Person `gorm:"foreignKey:OwnerID"
json:"owner,omitempty"`
}