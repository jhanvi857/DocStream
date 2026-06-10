.PHONY: run build test docker-up docker-down migrate-up migrate-down

run:
	go run cmd/server/main.go

build:
	go build -o bin/server cmd/server/main.go

test:
	go test -v ./...

docker-up:
	docker compose -f docker/docker-compose.yml up -d

docker-down:
	docker compose -f docker/docker-compose.yml down

migrate-up:
	migrate -path migrations -database "postgres://postgres:postgres@localhost:5432/docstream?sslmode=disable" up

migrate-down:
	migrate -path migrations -database "postgres://postgres:postgres@localhost:5432/docstream?sslmode=disable" down
