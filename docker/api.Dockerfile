# quoteScout API: compiled TypeScript, production dependencies only, non-root.
# Build context: repository root (npm workspaces).  docker build -f docker/api.Dockerfile .
# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY scripts/seed/package.json scripts/seed/
RUN npm ci -w @pi/api
COPY apps/api apps/api
RUN npm run build -w @pi/api

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY scripts/seed/package.json scripts/seed/
RUN npm ci --omit=dev -w @pi/api && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=6 \
  CMD wget -qO- http://127.0.0.1:4000/api/v1/health >/dev/null || exit 1
CMD ["node", "apps/api/dist/server.js"]
