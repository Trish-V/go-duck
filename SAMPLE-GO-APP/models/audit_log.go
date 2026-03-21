
package models

import (
    "time"
)

type AuditLog struct {
    ID             uint      `gorm:"primaryKey" json:"id"`
    EntityName     string    `json:"entityName"`
    EntityID       string    `json:"entityId"`
    Action         string    `json:"action"` // CREATE, UPDATE, DELETE
    PreviousValue  string    `json:"previousValue" gorm:"type:text"`
    NewValue       string    `json:"newValue" gorm:"type:text"`
    ModifiedBy     string    `json:"modifiedBy"`
    KeycloakID     string    `json:"keycloakId"`
    ModifiedAt     time.Time `json:"modifiedAt"`
    ClientIP       string    `json:"clientIp"`
}
