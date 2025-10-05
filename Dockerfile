# ============================================
# Stage 1: Build
# ============================================
FROM node:22-alpine AS build

# Install system dependencies and pnpm
RUN apk add --no-cache curl tini \
  && npm install -g pnpm

WORKDIR /app

# Copy package files and install deps
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile

# Copy source code and build
COPY . .
RUN pnpm api:build

# Prune dev dependencies
RUN pnpm prune --prod

# ============================================
# Stage 2: Production
# ============================================
FROM node:22-alpine AS production

# Install curl & tini
RUN apk add --no-cache curl tini \
  && npm install -g pnpm

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

# Copy built app and production deps
COPY --from=build --chown=nodejs:nodejs /app . 

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "build/src/server.js"]
