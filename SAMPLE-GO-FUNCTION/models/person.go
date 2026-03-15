package models

import (
"time"
"gorm.io/datatypes"
)

type Person struct {
ID uint `gorm:"primaryKey" json:"id"`
FirstName string `json:"firstName" binding:"required"`
LastName string `json:"lastName" `
Email string `gorm:"uniqueIndex" json:"email" `
Age int `json:"age" `
Preferences datatypes.JSON `gorm:"type:json;serializer:json" json:"preferences" `
CreatedAt time.Time `gorm:"autoCreateTime" json:"createdAt"`
UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updatedAt"`
Car []Car `gorm:"foreignKey:OwnerID" json:"car"`
}