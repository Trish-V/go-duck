
package models

type TenantRole struct {
	ID       uint    `gorm:"primaryKey" json:"id"`
	RoleName string  `json:"roleName" gorm:"unique;not null"`
	DBName   string  `json:"dbName" gorm:"not null"`
}
