
package messaging

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"go-duck/config"
	mq "github.com/eclipse/paho.mqtt.golang"
)

var MQTTClient mq.Client

type EventMessage struct {
	Action        string      `json:"action"`
	Entity        string      `json:"entity"`
	EventTime     time.Time   `json:"event_time"`
	Payload       interface{} `json:"payload"`
	PreviousValue interface{} `json:"previous_value,omitempty"`
}

func InitMQTT(cfg *config.Config) {
	if !cfg.GoDuck.Messaging.MQTT.Enabled {
		log.Println("MQTT Messaging is disabled.")
		return
	}

	opts := mq.NewClientOptions()
	opts.AddBroker(cfg.GoDuck.Messaging.MQTT.Broker)
	opts.SetClientID(cfg.GoDuck.Messaging.MQTT.ClientID)
	
	if cfg.GoDuck.Messaging.MQTT.Username != "" {
		opts.SetUsername(cfg.GoDuck.Messaging.MQTT.Username)
		opts.SetPassword(cfg.GoDuck.Messaging.MQTT.Password)
	}

	opts.OnConnect = func(c mq.Client) {
		log.Printf("Connected to MQTT Broker: %s", cfg.GoDuck.Messaging.MQTT.Broker)
	}

	client := mq.NewClient(opts)
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		log.Printf("Failed to connect to MQTT: %v", token.Error())
		return
	}

	MQTTClient = client
}

func PublishEvent(topicPrefix string, action string, entity string, payload interface{}, prev interface{}) {
	if MQTTClient == nil || !MQTTClient.IsConnected() {
		return
	}

	msg := EventMessage{
		Action:        action,
		Entity:        entity,
		EventTime:     time.Now(),
		Payload:       payload,
		PreviousValue: prev,
	}

	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("Error marshaling MQTT message: %v", err)
		return
	}

	topic := fmt.Sprintf("%s/%s/%s", topicPrefix, entity, action)
	token := MQTTClient.Publish(topic, 0, false, data)
	token.Wait()
}
