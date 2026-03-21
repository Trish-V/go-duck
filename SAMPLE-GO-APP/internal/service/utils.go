package service

import "time"

func parseDate(s string) time.Time {
	t, _ := time.Parse("2006-01-02", s)
	return t
}

func parseInstant(s string) time.Time {
	t, _ := time.Parse(time.RFC3339, s)
	return t
}
