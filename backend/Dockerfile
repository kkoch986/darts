# syntax=docker/dockerfile:1

# Build stage
FROM golang:1.22-alpine AS builder
WORKDIR /src

# Cache modules
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build static binary
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/darts-server

# Run stage
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata && \
    addgroup -g 65532 darts && \
    adduser -D -u 65532 -G darts darts
WORKDIR /app
RUN mkdir -p /data && chown -R darts:darts /app /data

# Default DB location; override with DARTS_DB_PATH
ENV DARTS_DB_PATH=/data/darts.db

COPY --from=builder /out/darts-server /usr/local/bin/darts-server

# No image-level VOLUME: let the orchestrator mount /data so the directory
# ownership is controlled here, not by the runtime volume's root owner.

EXPOSE 8080
USER 65532:65532

ENTRYPOINT ["/usr/local/bin/darts-server"]
