# syntax=docker/dockerfile:1

# Serve the vanilla-JS Darts UI (frontend/static) and proxy /api to the backend.
# The static app has no build step; nginx serves the files directly.
FROM nginx:1.27-alpine

# Backend service hostname (kubernetes service or docker-compose service name).
# Override at build time with --build-arg.
ARG DARTS_BACKEND_HOST=backend
ENV DARTS_BACKEND_HOST=${DARTS_BACKEND_HOST}

# nginx substitutes ${DARTS_BACKEND_HOST} in the template at container start.
COPY nginx.conf /etc/nginx/templates/default.conf.template

# New UI assets: index.html, app.js, styles.css
COPY static/ /usr/share/nginx/html/

# Copy PWA assets for installability
COPY static/manifest.json /usr/share/nginx/html/
COPY static/sw.js /usr/share/nginx/html/

EXPOSE 80
