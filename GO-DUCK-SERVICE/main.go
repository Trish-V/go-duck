package main

import (
"context"
"fmt"
"log"
"net/http"

"github.com/gin-gonic/gin"
"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
"gorm.io/driver/postgres"
"gorm.io/gorm"
"gorm.io/plugin/opentelemetry/tracing"
"go-duck/management"
"go-duck/middleware"
"go-duck/controllers"
"go-duck/graph"
"go-duck/ws"
"go-duck/config"
"go-duck/logger"
"go-duck/messaging"
"go-duck/cache"
"go-duck/resilience"
"go-duck/internal/telemetry"
"go-duck/internal/repository"
"go-duck/internal/server"
k_grpc "github.com/go-kratos/kratos/v2/transport/grpc"
// go-duck-needle-add-import
)

func main() {
// 1. Load Configuration
appConfig, err := config.LoadConfig()
if err != nil {
log.Fatalf("Failed to load configuration: %v", err)
}

// 2. Initialize Logging & Observability (Datadog)
logger.InitLogger(appConfig)
logger.Info("Starting %s version %s...", appConfig.GoDuck.Name, appConfig.GoDuck.Version)

// 3. Initialize OpenTelemetry Tracing
shutdown, err := telemetry.InitTelemetry(appConfig)
if err != nil {
log.Printf("Warning: Failed to initialize OpenTelemetry: %v", err)
}
defer shutdown(context.Background())

// 4. Initialize Resilience Layer (Circuit Breaker)
resilience.InitResilience(appConfig)

// 5. Initialize MQTT Messaging (for Webhooks/Audit)
messaging.InitMQTT(appConfig)

// 6. Initialize Distributed Caching (Redis)
cache.InitCache(appConfig)

// 7. Initialize master DB connection with Pool Tuning & Tracing
masterDB, err := gorm.Open(postgres.Open(appConfig.GetDSN()), &gorm.Config{})
if err != nil {
log.Fatalf("Failed to connect to master database: %v", err)
}
// go-duck-needle-add-init-server

// Inject GORM OTel Plugin
if err := masterDB.Use(tracing.NewPlugin()); err != nil {
log.Printf("Warning: Failed to inject GORM OTel plugin: %v", err)
}

sqlDB, _ := masterDB.DB()
sqlDB.SetMaxOpenConns(appConfig.GoDuck.Datasource.MaxOpenConns)
sqlDB.SetMaxIdleConns(appConfig.GoDuck.Datasource.MaxIdleConns)
sqlDB.SetConnMaxLifetime(appConfig.GoDuck.Datasource.ConnMaxLifetime)

// 8. Initialize Repository
repo := repository.NewRepository(masterDB)
// go-duck-needle-add-init-repository

// 9. Initialize & Start Kratos gRPC Server (in background)
go func() {
    grpcSrv := server.NewGRPCServer(appConfig, repo)
    logger.Info("Starting Kratos gRPC server on %s", appConfig.GoDuck.Server.GRPC.Addr)
    if err := grpcSrv.Start(context.Background()); err != nil {
        logger.Error("Failed to start Kratos gRPC server: %v", err)
    }
}()
// go-duck-needle-add-grpc-start

r := gin.Default()

// 8. Global Middleware (OTel, Rate Limit & CORS)
if appConfig.GoDuck.Telemetry.OTel.Enabled {
r.Use(otelgin.Middleware(appConfig.GoDuck.Name))
}
r.Use(middleware.RateLimitMiddleware(appConfig))
r.Use(middleware.CORSMiddleware(appConfig))

// Health Check
r.GET("/health", func(c *gin.Context) {
c.JSON(http.StatusOK, gin.H{"status": "UP"})
})

// Swagger Docs & UI
r.StaticFile("/swagger.json", "./docs/swagger.json")
r.GET("/swagger", func(c *gin.Context) {
c.Header("Content-Type", "text/html; charset=utf-8")
c.String(http.StatusOK, \`
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <title>Swagger UI</title>
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@3/swagger-ui.css">
</head>

<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@3/swagger-ui-bundle.js"> </script>
    <script>
        window.onload = function () {
            window.ui = SwaggerUIBundle({
                url: "/swagger.json",
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [SwaggerUIBundle.presets.apis],
                layout: "BaseLayout"
            });
        };
    </script>
</body>

</html>
\`)
})

// Management APIs (Run-time DB creation)
mgmt := r.Group("/management")
{
mgmt.POST("/db/create", management.CreateDatabaseAndMigrate(masterDB))
}

// 8.5 Open Application APIs (No Auth)
openApi := r.Group("/open/api")
if appConfig.GoDuck.Multitenancy.Enabled {
    openApi.Use(middleware.PublicTenantMiddleware(masterDB, appConfig))
}
{
    // Car Public Routes
    carOpenCtrl := controllers.CarController{DB: masterDB, Config: appConfig}
    openApi.GET("/cars", carOpenCtrl.GetAll)
    openApi.GET("/cars/:id", carOpenCtrl.GetByID)
    openApi.PUT("/cars/:id", carOpenCtrl.Update)
    openApi.PUT("/cars/bulk", carOpenCtrl.BulkUpdate)
    openApi.PATCH("/cars/:id", carOpenCtrl.Patch)
    openApi.PATCH("/cars/bulk", carOpenCtrl.BulkPatch)
    // Person Public Routes
    personOpenCtrl := controllers.PersonController{DB: masterDB, Config: appConfig}
    openApi.GET("/persons", personOpenCtrl.GetAll)
    openApi.GET("/persons/:id", personOpenCtrl.GetByID)
}

// 9. Secured Application APIs
api := r.Group("/api")
api.Use(middleware.JWTMiddleware())
api.Use(middleware.TenantMiddleware(masterDB, appConfig))
api.Use(middleware.AuditMiddleware(masterDB))
api.Use(middleware.MeteringMiddleware(masterDB))
{
// Observability
auditCtrl := controllers.AuditController{DB: masterDB}
api.GET("/audit", auditCtrl.GetLogs)

meteringCtrl := controllers.MeteringController{DB: masterDB}
api.POST("/metering/limit", meteringCtrl.SetLimit)
api.GET("/metering/usage", meteringCtrl.GetUsage)

// Search
searchCtrl := controllers.SearchController{DB: masterDB}
api.GET("/rpc/:table", searchCtrl.GenericSearch)

// Car Routes
carCtrl := controllers.CarController{DB: masterDB, Config: appConfig}
api.POST("/cars", carCtrl.Create)
api.POST("/cars/bulk", carCtrl.BulkCreate)
api.GET("/cars", carCtrl.GetAll)
api.GET("/cars/:id", carCtrl.GetByID)
api.PUT("/cars/:id", carCtrl.Update)
api.PUT("/cars/bulk", carCtrl.BulkUpdate)
api.PATCH("/cars/:id", carCtrl.Patch)
api.PATCH("/cars/bulk", carCtrl.BulkPatch)
api.DELETE("/cars/:id", carCtrl.Delete)
// Person Routes
personCtrl := controllers.PersonController{DB: masterDB, Config: appConfig}
api.POST("/persons", personCtrl.Create)
api.POST("/persons/bulk", personCtrl.BulkCreate)
api.GET("/persons", personCtrl.GetAll)
api.GET("/persons/:id", personCtrl.GetByID)
api.PUT("/persons/:id", personCtrl.Update)
api.PUT("/persons/bulk", personCtrl.BulkUpdate)
api.PATCH("/persons/:id", personCtrl.Patch)
api.PATCH("/persons/bulk", personCtrl.BulkPatch)
api.DELETE("/persons/:id", personCtrl.Delete)
// go-duck-needle-add-route
}

// 10. GraphQL
r.POST("/graphql", func(c *gin.Context) {
graph.HandleGraphQLRequest(masterDB, c)
})

// 11. WebSockets
wsDispatcher := ws.NewDispatcher(masterDB)
r.GET("/ws", middleware.JWTMiddleware(), wsDispatcher.HandleConnection)

port := fmt.Sprintf(":%d", appConfig.GoDuck.Server.Port)
r.Run(port)
}