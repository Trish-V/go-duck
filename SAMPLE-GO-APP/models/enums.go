package models

type ArticleStatus string

const (
    ArticleStatus_DRAFT ArticleStatus = "DRAFT"
    ArticleStatus_PUBLISHED ArticleStatus = "PUBLISHED"
    ArticleStatus_ARCHIVED ArticleStatus = "ARCHIVED"
)

