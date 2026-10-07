# syntax=docker/dockerfile:1
#
# Multi-stage build: dependencies -> build -> production.
#
#   dependencies : npm ci (all deps, Prisma client generated)
#   build        : tsc -> dist; also usable as the *migrate* image
#                  (docker compose `migrate` service, k8s Job) because it
#                  keeps the Prisma CLI
#   production   : prod deps + compiled JS, non-root, no toolchain
#
# The API never mutates the schema at boot; migrations run as a separate
# one-shot step from the `build` stage.

ARG NODE_VERSION=22

# ----------------------------------------------------------------- dependencies
FROM node:${NODE_VERSION}-alpine AS dependencies

WORKDIR /app

# Prisma needs the schema + config present when the client is generated.
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN npm ci

# ----------------------------------------------------------------------- build
FROM dependencies AS build

COPY tsconfig.json ./
COPY src ./src

# `npm run build` = prisma generate && tsc
RUN npm run build

# ------------------------------------------------------------------- production
FROM node:${NODE_VERSION}-alpine AS production

ENV NODE_ENV=production

WORKDIR /app

# openssl is required by Prisma at runtime on Alpine.
RUN apk add --no-cache openssl \
  && addgroup -S -g 1001 backendos \
  && adduser -S -u 1001 -G backendos backendos

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Generated Prisma client (node_modules/.prisma/client) from the build stage.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN chown -R backendos:backendos /app

USER backendos

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health/live',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/server.js"]
