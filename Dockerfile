# Multi-stage Dockerfile for Oto Servis Management System
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy root and package manifests
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/

# Install dependencies
RUN npm install

# Copy source codes
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server
COPY packages/client ./packages/client

# Build all packages (shared -> client & server)
RUN npm run build --workspace=@oto-servis/shared
RUN npm run build --workspace=@oto-servis/client
RUN npm run build --workspace=@oto-servis/server

# Runner Stage
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV DATA_DIR=/app/data
ENV BACKUP_DIR=/app/backups

# Install sqlite runtime dependencies
RUN apk add --no-cache tzdata sqlite

COPY package.json ./
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json

COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/package.json ./packages/server/package.json
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/packages/client/dist ./packages/client/dist

# Persistent data directories
RUN mkdir -p /app/data /app/uploads /app/backups

EXPOSE 3001

CMD ["node", "packages/server/dist/index.js"]
