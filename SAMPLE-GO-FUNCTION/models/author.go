package models

import (
"time"
)

type Author struct {
ID uint `gorm:"primaryKey" json:"id"`
Name string `json:"name" binding:"required"`
CreatedAt time.Time `gorm:"autoCreateTime" json:"createdAt"`
UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updatedAt"`
Article []Article `gorm:"foreignKey:AuthorID" json:"article"`
}