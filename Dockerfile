# =============================================================================
# DALC Scanner — Multi-stage Docker Build
# =============================================================================
# Air-gap capable: no runtime network access required.
# Uses tsx for ESM module resolution compatibility.
# Supports both CLI scan mode and web UI mode.
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Build
# ---------------------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files and install ALL dependencies (including devDependencies for tsc)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# ---------------------------------------------------------------------------
# Stage 2: Runtime
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime

# Security: non-root user
RUN addgroup -S dalc && adduser -S dalc -G dalc

WORKDIR /app

# Copy package files and install production dependencies only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && \
    npm cache clean --force

# Install tsx for ESM module resolution (lightweight TypeScript executor)
RUN npm install tsx@^4.19.0 && \
    npm cache clean --force

# Copy compiled output and source (tsx needs source for proper resolution)
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY tsconfig.json ./

# Default config and data mount points
RUN mkdir -p /app/config /app/output /app/data && chown -R dalc:dalc /app

USER dalc

# Air-gap: no network needed at runtime
ENV NODE_ENV=production

# Expose web UI port
EXPOSE 3000

ENTRYPOINT ["npx", "tsx", "src/cli.ts"]
CMD ["ui", "--port", "3000", "--data-dir", "/app/data"]
