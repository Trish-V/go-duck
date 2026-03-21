import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export const generateWebSocketCode = async (config, entities, outputDir) => {
	const wsDir = path.join(outputDir, 'ws');
	await fs.ensureDir(wsDir);

	const wsHandler = `
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
	Action      string          \`json:"action"\`
	Payload     json.RawMessage \`json:"payload"\`
	Signature   string          \`json:"signature"\`
	TraceParent string          \`json:"traceparent,omitempty"\` // W3C TraceParent
}

type WSResponse struct {
	Action      string      \`json:"action"\`
	Data        interface{} \`json:"data"\`
	Error       string      \`json:"error,omitempty"\`
	TraceParent string      \`json:"traceparent,omitempty"\`
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
`;

	const wsContent = wsHandler.replace(/{{app_name}}/g, config.name);
	let finalContent = wsContent;
	let entitiesBlock = "";
	for (const entity of entities) {
		entitiesBlock += `
	case "GET_${entity.name.toUpperCase()}S":
		var list${entity.name} []map[string]interface{}
		// Note: In a production app, we'd use gorm statement timeout and tracing hooks
		d.DB.WithContext(ctx).Table("${entity.name.toLowerCase()}").Find(&list${entity.name})
		d.sendResponse(conn, msg.Action, list${entity.name}, tp)
    case "CREATE_${entity.name.toUpperCase()}":
        d.sendResponse(conn, msg.Action, "${entity.name} creation processing...", tp)
    `;
	}

	finalContent = finalContent.replace("{{#each entities}}", "").replace("{{/each}}", "");
	const startTag = "switch msg.Action {";
	const endTag = "default:";
	const parts = finalContent.split(startTag);
	const endParts = parts[1].split(endTag);
	finalContent = parts[0] + startTag + entitiesBlock + endTag + endParts[1];

	await fs.writeFile(path.join(wsDir, 'handler.go'), finalContent);
	console.log(chalk.gray('  Generated REST-over-WS Dispatcher with Traced-Envelope'));
};
