
package ws

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"go-duck/controllers"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
	"gorm.io/gorm"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type WSMessage struct {
	Action      string          `json:"action"`
	Payload     json.RawMessage `json:"payload"`
	Signature   string          `json:"signature"`
	TraceParent string          `json:"traceparent,omitempty"` // W3C TraceParent
}

type WSResponse struct {
	Action      string      `json:"action"`
	Data        interface{} `json:"data"`
	Error       string      `json:"error,omitempty"`
	TraceParent string      `json:"traceparent,omitempty"`
}

// RESToverWSDispatcher handles the mapping from WS actions to Controller logic
type RESToverWSDispatcher struct {
	DB *gorm.DB
    SecretKey []byte
	Tracer    trace.Tracer
}

func NewDispatcher(db *gorm.DB) *RESToverWSDispatcher {
	return &RESToverWSDispatcher{
		DB: db,
        SecretKey: []byte("go-duck-super-secret-key"),
		Tracer:    otel.Tracer("ws-dispatcher"),
	}
}

func (d *RESToverWSDispatcher) HandleConnection(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WS Upgrade error: %v", err)
		return
	}
	defer conn.Close()

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var wsMsg WSMessage
		if err := json.Unmarshal(message, &wsMsg); err != nil {
			d.sendError(conn, "Invalid JSON format", wsMsg.Action, "")
			continue
		}

		// 1. Extract Parent Trace Context
		ctx := context.Background()
		if wsMsg.TraceParent != "" {
			propagator := otel.GetTextMapPropagator()
			ctx = propagator.Extract(ctx, propagation.HeaderCarrier{"traceparent": []string{wsMsg.TraceParent}})
		}

		// 2. Start WS-Action Span
		childCtx, span := d.Tracer.Start(ctx, fmt.Sprintf("WS Action: %s", wsMsg.Action))
		
        // 3. Verify Message Signature (Payload Integrity)
        if !d.verifySignature(wsMsg.Payload, wsMsg.Signature) {
            d.sendError(conn, "Invalid signature: Payload compromised", wsMsg.Action, wsMsg.TraceParent)
			span.End()
            continue
        }

		// 4. Dispatch to MVC Controllers
		d.dispatch(childCtx, conn, wsMsg)
		span.End()
	}
}

func (d *RESToverWSDispatcher) verifySignature(payload []byte, signature string) bool {
    h := hmac.New(sha256.New, d.SecretKey)
    h.Write(payload)
    expectedSignature := hex.EncodeToString(h.Sum(nil))
    return hmac.Equal([]byte(expectedSignature), []byte(signature))
}

func (d *RESToverWSDispatcher) dispatch(ctx context.Context, conn *websocket.Conn, msg WSMessage) {
	// Inject current span into response header for client to trace back
	carrier := propagation.HeaderCarrier{}
	otel.GetTextMapPropagator().Inject(ctx, carrier)
	tp := carrier.Get("traceparent")

	switch msg.Action {
	case "GET_CARS":
		var listCar []map[string]interface{}
		// Note: In a production app, we'd use gorm statement timeout and tracing hooks
		d.DB.WithContext(ctx).Table("car").Find(&listCar)
		d.sendResponse(conn, msg.Action, listCar, tp)
    case "CREATE_CAR":
        d.sendResponse(conn, msg.Action, "Car creation processing...", tp)
    
	case "GET_PERSONS":
		var listPerson []map[string]interface{}
		// Note: In a production app, we'd use gorm statement timeout and tracing hooks
		d.DB.WithContext(ctx).Table("person").Find(&listPerson)
		d.sendResponse(conn, msg.Action, listPerson, tp)
    case "CREATE_PERSON":
        d.sendResponse(conn, msg.Action, "Person creation processing...", tp)
    
	case "GET_ARTICLES":
		var listArticle []map[string]interface{}
		// Note: In a production app, we'd use gorm statement timeout and tracing hooks
		d.DB.WithContext(ctx).Table("article").Find(&listArticle)
		d.sendResponse(conn, msg.Action, listArticle, tp)
    case "CREATE_ARTICLE":
        d.sendResponse(conn, msg.Action, "Article creation processing...", tp)
    
	case "GET_AUTHORS":
		var listAuthor []map[string]interface{}
		// Note: In a production app, we'd use gorm statement timeout and tracing hooks
		d.DB.WithContext(ctx).Table("author").Find(&listAuthor)
		d.sendResponse(conn, msg.Action, listAuthor, tp)
    case "CREATE_AUTHOR":
        d.sendResponse(conn, msg.Action, "Author creation processing...", tp)
    default:
		d.sendError(conn, "Unknown action", msg.Action, tp)
	}
}

func (d *RESToverWSDispatcher) sendResponse(conn *websocket.Conn, action string, data interface{}, tp string) {
	resp := WSResponse{Action: action, Data: data, TraceParent: tp}
	conn.WriteJSON(resp)
}

func (d *RESToverWSDispatcher) sendError(conn *websocket.Conn, err string, action string, tp string) {
	resp := WSResponse{Action: action, Error: err, TraceParent: tp}
	conn.WriteJSON(resp)
}
