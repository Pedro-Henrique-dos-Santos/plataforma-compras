# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable \
  && corepack prepare pnpm@11.7.0 --activate \
  && pnpm config set store-dir /pnpm/store

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  PRISMA_SKIP_POSTINSTALL_GENERATE=true pnpm install --frozen-lockfile

COPY apps/web apps/web
COPY packages/contracts packages/contracts

ARG VITE_API_URL=/api
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_DEMO_MODE=false

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_DEMO_MODE=$VITE_DEMO_MODE

RUN set -eu; \
  test "$VITE_DEMO_MODE" = "false"; \
  test -n "$VITE_SUPABASE_PUBLISHABLE_KEY"; \
  case "$VITE_API_URL" in /*|https://*) ;; *) echo "VITE_API_URL must be relative or use HTTPS."; exit 1 ;; esac; \
  case "$VITE_SUPABASE_URL" in https://*) ;; *) echo "VITE_SUPABASE_URL must use HTTPS."; exit 1 ;; esac; \
  pnpm --filter @compras/web build

FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html

USER 101:101

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["wget", "--quiet", "--output-document=-", "http://127.0.0.1:8080/healthz"]
