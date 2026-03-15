## GO-DUCK: Evolutionary Go Code Generator

### Specialist Roles
*   **Architect & Code Generator**: Handles core MVC, Multi-tenancy, and stateful GDL parsing.
*   **Security & Audit Officer**: Implements JWT, Audit logic, and Metering.
*   **API Integrator**: Manages GraphQL, PostgREST, and Swagger UI.
*   **WebSocket & Encryption Specialist**: Generates "REST-over-WS" with HMAC integrity and OIDC validation.
*   **Resilience & Performance Specialist**: Implements Distributed Redis Caching and Circuit Breakers.
*   **OpenTelemetry Integration Specialist**: Injects full-stack tracing (HTTP -> Controller -> DB) and OTel Collector K8s configs.
*   **Microservice Orchestrator**: Manages dual-protocol service discovery (Gin/REST & Kratos/gRPC) and clean repository abstractions.

### Implementation Strategy & CLI Workflow
- **GO-DUCK-CLI**: The main generation engine, a Node.js powered CLI designed for rapid microservice scaffolding.
- **Command Architecture**:
  - `create`: Orchestrates the provision of a fresh microservice with dual-protocol support (Gin & Kratos).
  - `import-gdl`: Performs **Stateful Incremental Updates**, intelligently detecting schema deltas (entities, fields, relations).
- **Template System**: High-fidelity Handlebars templates for Go code, Protobuf definitions, and Liquibase XML.
- **Persistence Intelligence**: Stores entity snapshots in `.go-duck/` to maintain 100% schema integrity during evolution.

### Implemented Features (The 200% Milestone)

#### 1. Core & Generic Layers
- **Full CRUD REST APIs**: Automatically generated with pagination and filtering.
- **Generic Search Layer**: PostgREST-like RPC endpoint (`/api/rpc/:table`).
- **Audit & Metering**: Automatic capturing of entity changes (via `@Audited` and `audit_log` tables) and per-tenant usage tracking.

#### 2. Real-Time & Performance
- **REST-over-WS**: WebSocket dispatcher with **Traced-Envelopes** (OTel supported).
- **Distributed Caching (Redis)**: Multi-tenant aware (Tenant-Prefixed) with Cache-Aside strategy.
- **Event Streaming (MQTT)**: Real-time CRUD notifications for webhooks/audit.
- **Secured Kratos gRPC APIs**: Automatically generated .proto files and secured gRPC service implementations with JWT authentication for all entities.
- **Internal Repository Layer**: Clean database abstraction layer shared by REST and gRPC services.

#### 3. Resilience & Security
- **Circuit Breakers**: Sony/Gobreaker integration for Redis/MQTT/DB calls.
- **OIDC/JWT Security**: Keycloak validation with dynamic context-aware multi-tenancy.
- **Digital Signatures**: HMAC-SHA256 verification for high-integrity WebSocket message payloads.
- **CORS & Rate Limiting**: Property-driven policies for security and burst protection.

#### 4. Observability (Full-Stack)
- **OpenTelemetry (OTel)**: Distributed tracing from Router (otelgin) to Database (otelpgx plugin).
- **Datadog Logging**: Environment-driven log streaming and monitoring.
- **Statsd Metrics**: Infrastructure performance tracing and custom metric pushing.

#### 5. Deployment & Cloud-Native
- **Dockerization**: Multi-stage `Dockerfile` for lean production images.
- **Orchestration**: `docker-compose.yml` for local development with all dependencies (Postgres, Redis, MQTT, Keycloak, OTel).
- **CI/CD**: GitHub Actions workflows for automated testing and container publishing.

#### 6. Advanced Migration & GDL Engine
- **Refined Liquibase Structure**: Organized `migrations/liquibase/changelogs/` with atomic, timestamped, and descriptive filenames.
- **Enhanced GDL Types**: Support for `Text` (Long string), `String(N)` (Custom VARCHAR), `unique` constraints, and native `JSON` / `JSONB` structures leveraging `gorm.io/datatypes`.
- **Automated FK Optimization**: Automatic index generation and smart nullability for Foreign Keys based on GDL schema.
- **JHipster-style Needle Support**: Comment-based anchors (`go-duck-needle-*`) in key files for safe, evolutionary code injection.
- **Atomic Operations**: Prevents "ghost" migration references; only updates master changelog if changes are physically written.

### Roadmap (Upcoming Features)
- **Automated Documentation**: Auto-generate gorgeous HTML Developer Guides for each microservice with sticky TOCs, code snippets, and integration tutorials.
- **Automated Testing**: Generation of comprehensive Ginkgo/Gomega test suites.
- **Scheduling**: Integrated Background Jobs and Cron task support.
- **Storage Service**: MinIO/S3 integration for file uploads.
- **Notifications**: SMTP/Twilio integration for alerts.
- **Search Engine**: Elasticsearch/OpenSearch provisioning for advanced full-text search.

### Technology Stack
- **Language**: Go
- **Web**: Gin Gonic + Gorilla WS
- **gRPC**: Kratos
- **ORM**: GORM (PostgreSQL)
- **Migrations**: Liquibase
- **Config**: Viper
- **Identity**: Keycloak (OIDC)
- **Caching**: Redis
- **Observability**: OpenTelemetry + Datadog
- **Messaging**: MQTT
- **Resilience**: Sony/Gobreaker
