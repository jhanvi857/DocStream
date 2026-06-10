# Build stage
FROM golang:1.26-alpine AS builder
WORKDIR /app

# Copy dependency lists
COPY backend/go.mod backend/go.sum ./
RUN go mod download

# Copy source and build
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -o server cmd/server/main.go

# Run stage
FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/server .
COPY backend/.env.example .env

EXPOSE 8080
CMD ["./server"]
