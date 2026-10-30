# pnpm stage: shared by the install stages below
FROM node:22-alpine AS pnpm

RUN corepack enable && corepack prepare pnpm@12.15.0 --activate

# corepack fetches only pnpm's JavaScript package; the first pnpm command then downloads its
# native binary, with no retry. Download it here, before any project files are copied, so this
# layer stays cached across version bumps and each platform fetches the binary once, with retries.
RUN for attempt in 1 2 3 4 5; do \
      pnpm --version && exit 0; \
      echo "pnpm binary download failed (attempt $attempt of 5)"; \
      sleep $((attempt * 5)); \
    done; \
    exit 1

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Build stage
FROM pnpm AS builder

RUN pnpm install --frozen-lockfile

COPY . .

# Build the application (skip DTS for Docker)
ENV SKIP_DTS=true
RUN pnpm build

# Production dependencies
FROM pnpm AS prod-deps

RUN pnpm install --frozen-lockfile --prod

# Production stage: runs on node alone, so it needs no pnpm
FROM node:22-alpine

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# package.json is needed at runtime: its "type": "module" makes node load dist/ as ESM
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Switch to non-root user
USER nodejs

# Default to HTTP mode for Docker, bind to all interfaces so container is reachable
ENV TRANSPORT_TYPE=httpStream
ENV HOST=0.0.0.0

# Expose port for HTTP server
EXPOSE 3000

# Run the MCP server (defaults to HTTP on port 3000)
CMD ["node", "dist/index.js"]
