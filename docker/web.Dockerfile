# quoteScout web: Vite build served by nginx, which also proxies /api to the API (same origin, so no CORS or cookie issues).
# Build context: repository root.  docker build -f docker/web.Dockerfile .
# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY scripts/seed/package.json scripts/seed/
RUN npm ci -w @pi/web
COPY apps/web apps/web
# Vite inlines VITE_* at build time. Demo mode shows the demo logins (with password) on the sign-in page.
ARG VITE_DEMO_MODE=true
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_DEMO_MODE=$VITE_DEMO_MODE VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build -w @pi/web

FROM nginx:1.27-alpine
# The official image renders /etc/nginx/templates/*.template with the container's environment on start.
ENV API_UPSTREAM=api:4000 CLIENT_MAX_BODY_SIZE=12m
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
