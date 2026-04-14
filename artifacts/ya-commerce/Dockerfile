# Multi-stage build for AWS App Runner / ECR deployment
# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./

# Install all dependencies including devDependencies for build
RUN npm ci

# Copy application source
COPY . .

# Set build-time environment variables (these can be overridden during build)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_RAZORPAY_KEY_ID

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_RAZORPAY_KEY_ID=$VITE_RAZORPAY_KEY_ID
ENV NODE_ENV=production

# Build the application
RUN npm run build

# Stage 2: Production
FROM node:18-alpine AS production

WORKDIR /app

# Install serve globally for serving static files
RUN npm install -g serve@14

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built files from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Switch to non-root user
USER nodejs

# Expose port (AWS App Runner uses PORT env variable, default 8080)
EXPOSE 8080

# Set default port
ENV PORT=8080
ENV NODE_ENV=production

# Health check for AWS App Runner
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:${PORT:-8080}/ || exit 1

# Start the application using serve
# serve -s enables SPA mode (redirects all requests to index.html)
CMD ["sh", "-c", "serve -s dist -l ${PORT:-8080}"]
