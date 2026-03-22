import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export const generateDeploymentArtifacts = async (config, projectRootDir) => {
    const devopsDir = path.join(projectRootDir, 'devops');
    const k8sDir = path.join(devopsDir, 'k8s');
    const keycloakDir = path.join(devopsDir, 'keycloak');
    const githubDir = path.join(projectRootDir, '.github', 'workflows');

    await fs.ensureDir(devopsDir);
    await fs.ensureDir(k8sDir);
    await fs.ensureDir(keycloakDir);
    await fs.ensureDir(githubDir);

    const appName = config.name || 'go-duck';
    const appPort = config.server?.port || 8080;

    // --- 1. Dockerfile (Multi-stage, lean production image) ---
    const dockerfile = `
# ---- Build Stage ----
FROM golang:alpine AS builder
WORKDIR /app

# Install dependencies for protoc and Kratos
RUN apk add --no-cache protoc git make curl protobuf-dev

# Install Kratos and Protoc plugins
RUN go install github.com/go-kratos/kratos/cmd/kratos/v2@latest
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
RUN go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
RUN go install github.com/go-kratos/kratos/cmd/protoc-gen-go-http/v2@latest
RUN go install github.com/go-kratos/kratos/cmd/protoc-gen-go-errors/v2@latest
RUN go install github.com/google/gnostic/cmd/protoc-gen-openapi@latest

# Download standard google protos
RUN mkdir -p third_party/google/api && \\
    curl -sSL https://raw.githubusercontent.com/googleapis/googleapis/master/google/api/annotations.proto > third_party/google/api/annotations.proto && \\
    curl -sSL https://raw.githubusercontent.com/googleapis/googleapis/master/google/api/http.proto > third_party/google/api/http.proto

COPY go.mod go.sum ./
RUN go mod download
COPY . .

# Generate gRPC and HTTP client/server code
RUN find api -name "*.proto" -exec protoc --proto_path=. \\
        --proto_path=./api \\
        --proto_path=./third_party \\
        --proto_path=/usr/include \\
        --go_out=paths=source_relative:. \\
        --go-grpc_out=paths=source_relative:. \\
        --go-http_out=paths=source_relative:. \\
        {} +

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/server .

# ---- Final Stage ----
FROM gcr.io/distroless/static-debian12
WORKDIR /app

COPY --from=builder /app/server .
COPY --from=builder /app/application.yml .
COPY --from=builder /app/application-dev.yml .
COPY --from=builder /app/application-prod.yml .

EXPOSE 8080
ENV GO_PROFILE=prod
ENTRYPOINT ["/app/server"]
`;

    // --- 2. services.yml (Infrastructure Services Only - Hard-Pinned Versions for Docker Desktop Stability) ---
    const servicesYaml = `
services:
  postgres:
    image: postgres:15.6-alpine
    container_name: ${appName}-postgres
    environment:
      POSTGRES_USER: go_duck_user
      POSTGRES_PASSWORD: go_duck_pass
      POSTGRES_DB: go_duck_master
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - go-duck-net

  redis:
    image: redis:7.2.4-alpine
    container_name: ${appName}-redis
    ports:
      - "6379:6379"
    command: redis-server --save 60 1 --loglevel warning
    networks:
      - go-duck-net

  mosquitto:
    image: eclipse-mosquitto:2.0.18
    container_name: ${appName}-mqtt
    ports:
      - "1883:1883"
      - "9001:9001"
    volumes:
      - ./k8s/mosquitto.conf:/mosquitto/config/mosquitto.conf
    networks:
      - go-duck-net

  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.96.0
    container_name: ${appName}-otel
    command: ["--config=/etc/otel-collector-config.yaml"]
    volumes:
      - ./k8s/otel-collector.yml:/etc/otel-collector-config.yaml
    ports:
      - "4317:4317"
      - "4318:4318"
    depends_on:
      - jaeger
    networks:
      - go-duck-net

  jaeger:
    image: jaegertracing/all-in-one:1.55
    container_name: ${appName}-jaeger
    ports:
      - "16686:16686"
      - "14317:4317"
    networks:
      - go-duck-net

  keycloak:
    image: quay.io/keycloak/keycloak:23.0.7
    container_name: ${appName}-keycloak
    command: start-dev --import-realm
    environment:
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
    volumes:
      - ./keycloak/realm-config:/opt/keycloak/data/import
    ports:
      - "8180:8080"
    networks:
      - go-duck-net

volumes:
  postgres_data:

networks:
  go-duck-net:
    driver: bridge
`;

    // --- 3. app.yml (App Service Only - To run the built image) ---
    const appYaml = `
services:
  app:
    build:
      context: ..
      dockerfile: devops/Dockerfile
    image: ${appName}:latest
    container_name: ${appName}
    ports:
      - "${appPort}:${appPort}"
    environment:
      - GO_PROFILE=dev
      - GO_DUCK_DATASOURCE_HOST=postgres
      - GO_DUCK_DATASOURCE_USERNAME=go_duck_user
      - GO_DUCK_DATASOURCE_PASSWORD=go_duck_pass
      - GO_DUCK_DATASOURCE_DATABASE=go_duck_master
      - GO_DUCK_DATASOURCE_PORT=5432
      - GO_DUCK_CACHE_REDIS_HOST=redis:6379
      - GO_DUCK_MESSAGING_MQTT_BROKER=tcp://mosquitto:1883
      - GO_DUCK_TELEMETRY_OTEL_ENDPOINT=otel-collector:4317
    restart: always
    networks:
      - go-duck-net

networks:
  go-duck-net:
    external: true
    name: devops_go-duck-net
`;

    // --- 4. docker-compose.yml (The Main Entry Point - Links app + services) ---
    const dockerCompose = `
include:
  - path: services.yml

services:
  app:
    build:
      context: ..
      dockerfile: devops/Dockerfile
    container_name: ${appName}
    ports:
      - "${appPort}:${appPort}"
    environment:
      - GO_PROFILE=dev
      - GO_DUCK_DATASOURCE_HOST=postgres
      - GO_DUCK_DATASOURCE_USERNAME=go_duck_user
      - GO_DUCK_DATASOURCE_PASSWORD=go_duck_pass
      - GO_DUCK_DATASOURCE_DATABASE=go_duck_master
      - GO_DUCK_DATASOURCE_PORT=5432
      - GO_DUCK_CACHE_REDIS_HOST=redis:6379
      - GO_DUCK_MESSAGING_MQTT_BROKER=tcp://mosquitto:1883
      - GO_DUCK_TELEMETRY_OTEL_ENDPOINT=otel-collector:4317
    depends_on:
      postgres:
        condition: service_started
      redis:
        condition: service_started
      mosquitto:
        condition: service_started
      otel-collector:
        condition: service_started
    networks:
      - go-duck-net

networks:
  go-duck-net:
    external: true
    name: devops_go-duck-net
`;

    // --- 5. MQTT Broker Config ---
    const mosquittoConf = `
listener 1883
listener 9001
protocol websockets
allow_anonymous true
`;

    // --- 6. GitHub Actions CI/CD ---
    const ciWorkflow = `
name: CI - Build & Test

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Go
        uses: actions/setup-go@v5
        with:
          go-version: '1.24'

      - name: Cache Go modules
        uses: actions/cache@v3
        with:
          path: ~/go/pkg/mod
          key: \${{ runner.os }}-go-\${{ hashFiles('**/go.sum') }}

      - name: Download dependencies
        run: go mod download

      - name: Build
        run: go build -v ./...

      - name: Run Tests
        run: test -v ./...
`;

    const cdWorkflow = `
name: CD - Build & Push Docker Image

on:
  push:
    branches: [main]

jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: \${{ secrets.DOCKER_USERNAME }}
          password: \${{ secrets.DOCKER_PASSWORD }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: \${{ secrets.DOCKER_USERNAME }}/${appName}:latest,\${{ secrets.DOCKER_USERNAME }}/${appName}:\${{ github.sha }}
`;

    await fs.writeFile(path.join(devopsDir, 'Dockerfile'), dockerfile);
    await fs.writeFile(path.join(devopsDir, 'services.yml'), servicesYaml);
    await fs.writeFile(path.join(devopsDir, 'app.yml'), appYaml);
    await fs.writeFile(path.join(devopsDir, 'docker-compose.yml'), dockerCompose);
    await fs.writeFile(path.join(k8sDir, 'mosquitto.conf'), mosquittoConf);
    await fs.writeFile(path.join(githubDir, 'ci.yml'), ciWorkflow);
    await fs.writeFile(path.join(githubDir, 'cd.yml'), cdWorkflow);

    console.log(chalk.gray('  Generated devops/Dockerfile, devops/services.yml, devops/app.yml, devops/docker-compose.yml & GitHub Actions CI/CD'));
};
