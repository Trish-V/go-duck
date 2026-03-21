
package resilience

import (
	"fmt"
	"log"
	"time"

	"go-duck/config"
	"github.com/sony/gobreaker"
)

var (
	CB *gobreaker.CircuitBreaker
)

// InitResilience initializes circuit breaker settings
func InitResilience(cfg *config.Config) {
	if !cfg.GoDuck.Resilience.CircuitBreaker.Enabled {
		log.Println("Circuit Breaker is disabled.")
		return
	}

	st := gobreaker.Settings{
		Name:        "Global Breaker",
		Interval:    time.Minute,
		Timeout:     cfg.GoDuck.Resilience.CircuitBreaker.Timeout,
		MaxRequests: cfg.GoDuck.Resilience.CircuitBreaker.SuccessThreshold,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			return counts.ConsecutiveFailures >= cfg.GoDuck.Resilience.CircuitBreaker.FailureThreshold
		},
		OnStateChange: func(name string, from gobreaker.State, to gobreaker.State) {
			log.Printf("Circuit Breaker %s: State Changed from %s to %s", name, from.String(), to.String())
		},
	}

	CB = gobreaker.NewCircuitBreaker(st)
	log.Println("Circuit Breaker initialized.")
}

// Execute wraps any function call in a circuit breaker
func Execute(f func() (interface{}, error)) (interface{}, error) {
	if CB == nil {
		return f()
	}

	result, err := CB.Execute(f)
	if err != nil {
		if err == gobreaker.ErrOpenState {
			return nil, fmt.Errorf("circuit breaker is OPEN")
		}
		return nil, err
	}

	return result, nil
}
