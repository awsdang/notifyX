# NotifyX API Dockerfile
# Optimized for production with Bun runtime

FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install dependencies only (for caching)
FROM base AS deps
COPY package.json bun.lock* ./
COPY prisma ./prisma/
RUN bun install --frozen-lockfile --production

# Build stage
FROM base AS builder
COPY package.json bun.lock* ./
COPY prisma ./prisma/
RUN bun install --frozen-lockfile
COPY . .
RUN bun run db:generate
RUN bun run build

# Production stage
FROM base AS runner
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 notifyx
USER notifyx

# Copy dependencies and built app
COPY --from=deps --chown=notifyx:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=notifyx:nodejs /app/dist ./dist
COPY --from=builder --chown=notifyx:nodejs /app/prisma ./prisma
COPY --from=builder --chown=notifyx:nodejs /app/package.json ./

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Run migrations and start server
CMD ["sh", "-c", "bunx prisma migrate deploy && bun run start"]
