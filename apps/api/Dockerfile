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

COPY apps/api apps/api
COPY packages packages

RUN pnpm db:generate \
  && pnpm --filter @compras/api build \
  && pnpm --filter @compras/api deploy --prod --legacy /prod/api

RUN set -eu; \
  source_client="$(find /workspace/node_modules/.pnpm -path '*/node_modules/.prisma/client' -type d -print -quit)"; \
  target_package="$(find /prod/api/node_modules/.pnpm -path '*/node_modules/@prisma/client' -type d -print -quit)"; \
  test -n "$source_client"; \
  test -n "$target_package"; \
  target_node_modules="$(dirname "$(dirname "$target_package")")"; \
  mkdir -p "$target_node_modules/.prisma"; \
  cp -R "$source_client" "$target_node_modules/.prisma/client"

FROM node:24-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install --yes --no-install-recommends \
    ca-certificates \
    fontconfig \
    fonts-dejavu-core \
    tini \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3333
ENV NODE_OPTIONS=--enable-source-maps

WORKDIR /app

COPY --from=build --chown=node:node /prod/api ./

USER node

EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3333/api/health/live').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
