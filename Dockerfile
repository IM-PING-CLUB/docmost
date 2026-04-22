FROM node:22-slim AS base
LABEL org.opencontainers.image.source="https://github.com/docmost/docmost"

RUN npm install -g pnpm@10.4.0

FROM base AS builder

WORKDIR /app

COPY . .

ARG OEM=false
ARG OEM_HIDE_API_KEYS=false
ARG OEM_HIDE_SECURITY_SSO=false
ARG OEM_HIDE_API_MANAGEMENT=false
ARG OEM_HIDE_AUDIT_LOG=false
ARG OEM_HIDE_AI_SETTINGS=false
ARG OEM_HIDE_VERSION_UPDATE=false
ARG OEM_HIDE_LICENSE=false

ENV OEM=$OEM
ENV OEM_HIDE_API_KEYS=$OEM_HIDE_API_KEYS
ENV OEM_HIDE_SECURITY_SSO=$OEM_HIDE_SECURITY_SSO
ENV OEM_HIDE_API_MANAGEMENT=$OEM_HIDE_API_MANAGEMENT
ENV OEM_HIDE_AUDIT_LOG=$OEM_HIDE_AUDIT_LOG
ENV OEM_HIDE_AI_SETTINGS=$OEM_HIDE_AI_SETTINGS
ENV OEM_HIDE_VERSION_UPDATE=$OEM_HIDE_VERSION_UPDATE
ENV OEM_HIDE_LICENSE=$OEM_HIDE_LICENSE

RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM base AS installer

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl bash \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy apps
COPY --from=builder /app/apps/server/dist /app/apps/server/dist
COPY --from=builder /app/apps/client/dist /app/apps/client/dist
COPY --from=builder /app/apps/server/package.json /app/apps/server/package.json

# Copy packages
COPY --from=builder /app/packages/editor-ext/dist /app/packages/editor-ext/dist
COPY --from=builder /app/packages/editor-ext/package.json /app/packages/editor-ext/package.json

# Copy root package files
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/pnpm*.yaml /app/
COPY --from=builder /app/.npmrc /app/.npmrc

# Copy patches
COPY --from=builder /app/patches /app/patches

RUN chown -R node:node /app

USER node

RUN pnpm install --frozen-lockfile --prod

RUN mkdir -p /app/data/storage

VOLUME ["/app/data/storage"]

EXPOSE 3000

CMD ["pnpm", "start"]
