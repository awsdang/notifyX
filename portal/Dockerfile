# NotifyX Portal Dockerfile
# Multi-stage build for optimized production image

# Build stage
FROM oven/bun:1-alpine AS builder
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source files
COPY . .

# Build arguments for environment
ARG VITE_API_URL
ARG VITE_API_KEY
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_API_KEY=${VITE_API_KEY}

# Build the app
RUN bun run build

# Production stage - use nginx for serving static files
FROM nginx:alpine AS runner

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
