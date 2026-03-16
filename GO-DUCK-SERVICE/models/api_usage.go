
package models

import (
	"time"
)

type APIUsage struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	UserID      string    `json:"userId" gorm:"index:idx_user_api,unique"`
	APIPath     string    `json:"apiPath" gorm:"index:idx_user_api,unique"`
	UsageCount  int64     `json:"usageCount"`
	MaxLimit    int64     `json:"maxLimit" gorm:"default:1000"`
	LastAccessed time.Time `json:"lastAccessed"`
}
