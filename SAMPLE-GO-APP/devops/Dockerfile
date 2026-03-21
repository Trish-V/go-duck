
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
RUN mkdir -p third_party/google/api &&     curl -sSL https://raw.githubusercontent.com/googleapis/googleapis/master/google/api/annotations.proto > third_party/google/api/annotations.proto &&     curl -sSL https://raw.githubusercontent.com/googleapis/googleapis/master/google/api/http.proto > third_party/google/api/http.proto

COPY go.mod go.sum ./
RUN go mod download
COPY . .

# Generate gRPC and HTTP client/server code
RUN find api -name "*.proto" -exec protoc --proto_path=.         --proto_path=./api         --proto_path=./third_party         --proto_path=/usr/include         --go_out=paths=source_relative:.         --go-grpc_out=paths=source_relative:.         --go-http_out=paths=source_relative:.         {} +

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
