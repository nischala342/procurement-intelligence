# One-shot job: seeds (or resets) the database with the demo businesses and writes the downloadable sample files.
# Needs the full workspace (TypeScript sources via tsx, dev tooling) and the reference dataset, so it is a separate image.
# Build context: repository root.  Run via:  npm run docker:seed
# syntax=docker/dockerfile:1

FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY scripts/seed/package.json scripts/seed/
RUN npm ci -w @pi/seed -w @pi/api
COPY apps/api/src apps/api/src
COPY apps/api/tsconfig.json apps/api/
COPY scripts/seed scripts/seed
COPY datasets/Dataset_Procurement.xlsx datasets/
# The seed skips the demo businesses when NODE_ENV=production, so the job runs as development (it never serves traffic).
ENV NODE_ENV=development SAMPLES_DIR=/samples
CMD ["npm", "run", "seed", "-w", "@pi/seed"]
