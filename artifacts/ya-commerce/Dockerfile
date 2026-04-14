# Multi-stage build for AWS App Runner - Unified Frontend + Backend
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm install

# Copy application source
COPY . .

# Set build-time environment variables for Vite (client-side)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_RAZORPAY_KEY_ID

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_RAZORPAY_KEY_ID=$VITE_RAZORPAY_KEY_ID
ENV NODE_ENV=production

# Build client (Vite) and server (TypeScript)
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy built client files
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Copy built server files
COPY --from=builder --chown=nodejs:nodejs /app/server/dist ./server/dist

# Switch to non-root user
USER nodejs

# Expose port (AWS App Runner uses PORT env variable, default 8080)
EXPOSE 8080

# Runtime environment variables (set these in AWS App Runner)
ENV PORT=8080
ENV NODE_ENV=production

# Health check for AWS App Runner
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:${PORT:-8080}/api/healthz || exit 1

# Start the unified Express server (serves both API and static files)
CMD ["node", "server/dist/index.js"]
