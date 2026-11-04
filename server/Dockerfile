FROM node:20-alpine

WORKDIR /app

# Install dependencies for node-pty and native modules
# docker-cli is needed so the server can spawn scanner/execution containers
# wget is needed for the HEALTHCHECK
RUN apk add --no-cache python3 make g++ docker-cli wget openssl openssl-dev

# Copy package manifest and install dependencies
COPY package.json ./

# Install all dependencies (no lockfile in repo, so use npm install)
RUN npm install --prefer-offline

# Copy prisma schema first
COPY prisma/ ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Copy entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

# Run via entrypoint (runs migrations then starts server)
CMD ["./docker-entrypoint.sh"]
