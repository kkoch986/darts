# syntax=docker/dockerfile:1

# Build stage
FROM node:22-alpine AS builder
WORKDIR /src

# Cache dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Build static assets
COPY . .
RUN npm run build

# Run stage: nginx serves static SPA and proxies /api to the backend
FROM nginx:1.27-alpine

# Backend service hostname (kubernetes service or docker-compose service name).
# Override at build time with --build-arg.
ARG DARTS_BACKEND_HOST=backend
ENV DARTS_BACKEND_HOST=${DARTS_BACKEND_HOST}

# Substitute the backend host, then copy as default.conf
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=builder /src/dist /usr/share/nginx/html

EXPOSE 80
