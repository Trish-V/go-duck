import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export const generateDeploymentArtifacts = async (config, outputDir) => {
    const devopsDir = path.join(outputDir, 'devops');
    const k8sDir = path.join(devopsDir, 'k8s');
    const keycloakDir = path.join(devopsDir, 'keycloak');
    const realmConfigDir = path.join(keycloakDir, 'realm-config');
    const githubDir = path.join(outputDir, '.github/workflows');

    await fs.ensureDir(devopsDir);
    await fs.ensureDir(k8sDir);
    await fs.ensureDir(keycloakDir);
    await fs.ensureDir(realmConfigDir);
    await fs.ensureDir(githubDir);

    const appName = config.name || 'go-duck-app';
    const appPort = 8080;

    // --- Copy Keycloak Realm Template ---
    const cliRootDir = path.resolve(path.dirname(import.meta.url.replace('file://', '')), '../../');
    const realmTemplatePath = path.join(cliRootDir, 'realm-export-template.json');
    if (await fs.pathExists(realmTemplatePath)) {
        await fs.copy(realmTemplatePath, path.join(realmConfigDir, 'realm-export.json'));
    }

    // --- 1. Dockerfile (Multi-stage, lean production image) ---
    const dockerfile = `
# ---- Build Stage ----
FROM golang:1.24-alpine AS builder
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
RUN mkdir -p third_party/google/api && \
    curl -sSL https://raw.githubusercontent.com/googleapis/googleapis/master/google/api/annotations.proto > third_party/google/api/annotations.proto && \
    curl -sSL https://raw.githubusercontent.com/googleapis/googleapis/master/google/api/http.proto > third_party/google/api/http.proto

COPY go.mod go.sum ./
RUN go mod download
COPY . .

# Generate gRPC and HTTP client/server code from Proto files
# We use find to generate for each found proto to be sure it is generated
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
EXPOSE ${appPort}
ENV GO_PROFILE=prod
ENTRYPOINT ["/app/server"]
`;

    // --- 2. Docker Compose (Full local dev environment) ---
    const dockerCompose = `
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
    depends_on:
      - postgres
      - redis
      - mosquitto
      - otel-collector
    networks:
      - go-duck-net

  postgres:
    image: postgres:15-alpine
    container_name: ${appName}-postgres
    environment:
      POSTGRES_USER: go_duck_user
      POSTGRES_PASSWORD: go_duck_pass
      POSTGRES_DB: ${appName}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - go-duck-net

  redis:
    image: redis:7-alpine
    container_name: ${appName}-redis
    ports:
      - "6379:6379"
    command: redis-server --save 60 1 --loglevel warning
    networks:
      - go-duck-net

  mosquitto:
    image: eclipse-mosquitto:2
    container_name: ${appName}-mqtt
    ports:
      - "1883:1883"
      - "9001:9001"
    volumes:
      - ./k8s/mosquitto.conf:/mosquitto/config/mosquitto.conf
    networks:
      - go-duck-net

  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
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
    image: jaegertracing/all-in-one:latest
    container_name: ${appName}-jaeger
    ports:
      - "16686:16686"
      - "14317:4317"
    networks:
      - go-duck-net

  keycloak:
    image: quay.io/keycloak/keycloak:23.0
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

    // --- 3. MQTT Broker Config ---
    const mosquittoConf = `
listener 1883
listener 9001
protocol websockets
allow_anonymous true
`;

    // --- 4. GitHub Actions CI/CD ---
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
          go-version: '1.22'

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
        run: go test -v ./...
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
    await fs.writeFile(path.join(devopsDir, 'docker-compose.yml'), dockerCompose);
    await fs.writeFile(path.join(k8sDir, 'mosquitto.conf'), mosquittoConf);
    await fs.writeFile(path.join(githubDir, 'ci.yml'), ciWorkflow);
    await fs.writeFile(path.join(githubDir, 'cd.yml'), cdWorkflow);

    console.log(chalk.gray('  Generated devops/Dockerfile, devops/docker-compose.yml & GitHub Actions CI/CD'));
};
