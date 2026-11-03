# ==============================================================================
# Production Dockerfile for DentaCare Backend (NestJS + Prisma + PostgreSQL)
# ==============================================================================

FROM node:20-alpine AS deps
WORKDIR /app

# Install build tools for native addons (bcrypt, sharp)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

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

CMD ["node", "dist/src/main.js"]

