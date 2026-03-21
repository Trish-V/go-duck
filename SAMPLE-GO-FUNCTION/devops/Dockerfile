
# ---- Build Stage ----
FROM golang:1.24-alpine AS builder
WORKDIR /app

# Install dependencies for protoc and Kratos
RUN apk add --no-cache protoc git make

# Install Kratos and Protoc plugins
RUN go install github.com/go-kratos/kratos/cmd/kratos/v2@latest
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
RUN go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
RUN go install github.com/go-kratos/kratos/cmd/protoc-gen-go-http/v2@latest
RUN go install github.com/go-kratos/kratos/cmd/protoc-gen-go-errors/v2@latest
RUN go install github.com/google/gnostic/cmd/protoc-gen-openapi@latest

COPY go.mod go.sum ./
RUN go mod download
COPY . .

# Generate gRPC and HTTP client/server code from Proto files
RUN kratos proto client .

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
