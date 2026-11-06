# ==============================================================================
# Production Dockerfile for DentaCare Backend (NestJS + Prisma + PostgreSQL)
# ==============================================================================

FROM node:20-alpine AS deps
WORKDIR /app

# Build tools for native addons (bcrypt, sharp); openssl so Prisma downloads
# the OpenSSL 3 engines that match the runner image
RUN apk add --no-cache python3 make g++ openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Same OpenSSL as deps/runner so Prisma resolves the same engine binaries
RUN apk add --no-cache openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Compile TypeScript
RUN npm run build

# Prune devDependencies
RUN npm prune --production && rm -rf /root/.npm

# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Prisma engines need OpenSSL on Alpine; wget is used by the compose healthcheck
RUN apk add --no-cache openssl

# Create unprivileged application user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts

USER nestjs

EXPOSE 4000

# Apply pending migrations, then start. Safe to run on every start (idempotent).
ENV PRISMA_HIDE_UPDATE_MESSAGE=1
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]

