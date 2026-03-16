
# ---- Build Stage ----
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
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
