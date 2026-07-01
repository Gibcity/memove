# ── Stage 0: gosu ────────────────────────────────────────────────────────────
# Rebuild gosu with a current Go toolchain so the runtime image ships no stale
# Go stdlib (Debian's apt gosu is built with an old Go that trips CVE scanners).
# The binary and its runtime behaviour are identical to the apt package.
FROM golang:1.25-alpine AS gosu-build
RUN CGO_ENABLED=0 GOBIN=/out go install github.com/tianon/gosu@latest

# ── Stage 1: shared ──────────────────────────────────────────────────────────
FROM node:24-alpine AS shared-builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --workspace=@memove/shared
COPY packages/shared/ ./packages/shared/
RUN npm run build --workspace=@memove/shared

# ── Stage 2: client ──────────────────────────────────────────────────────────
FROM node:24-alpine AS client-builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
RUN npm ci --workspace=@memove/client
COPY --from=shared-builder /app/packages/shared/dist ./packages/shared/dist
COPY apps/web/ ./apps/web/
RUN npm run build --workspace=@memove/client

# ── Stage 3: server ──────────────────────────────────────────────────────────
# --ignore-scripts skips native builds (better-sqlite3); they happen in the production stage.
FROM node:24-alpine AS server-builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN npm ci --workspace=@memove/server --ignore-scripts
COPY --from=shared-builder /app/packages/shared/dist ./packages/shared/dist
COPY apps/api/ ./apps/api/
RUN npm run build --workspace=@memove/server

# ── Stage 4: production runtime ──────────────────────────────────────────────
FROM node:24-trixie-slim
WORKDIR /app

# Workspace manifests only — source never enters this stage.
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# better-sqlite3 native addon requires build tools (purged after compile).
# kitinerary-extractor for booking-confirmation import:
#   amd64 — static binary from KDE CDN (glibc 2.17+; wget stays for healthcheck)
#   arm64 — apt package (KDE publishes no arm64 static binary)
RUN apt-get update && \
    apt-get install -y --no-install-recommends tzdata dumb-init wget ca-certificates python3 build-essential && \
    npm ci --workspace=@memove/server --omit=dev && \
    ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then \
        wget -qO /tmp/ki.tgz https://cdn.kde.org/ci-builds/pim/kitinerary/release-26.04/linux/kitinerary-extractor-x86_64-26.04.2.tgz && \
        echo "ba5cfb4a2353157c8f54cbeaea0097c5bf2c3a810e0342f63d6e524826176628 /tmp/ki.tgz" | sha256sum -c && \
        tar -xz -C /usr/local -f /tmp/ki.tgz bin/kitinerary-extractor share/locale && \
        rm /tmp/ki.tgz; \
    else \
        apt-get install -y --no-install-recommends libkitinerary-bin && \
        ln -sf "$(find /usr/lib -name kitinerary-extractor -type f | head -1)" /usr/local/bin/kitinerary-extractor; \
    fi && \
    apt-get purge -y python3 build-essential && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/* /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# gosu rebuilt with a current Go toolchain (stage 0) — used by CMD to drop to node.
COPY --from=gosu-build /out/gosu /usr/local/bin/gosu

ENV XDG_CACHE_HOME=/tmp/kf6-cache
# Prevent Qt from probing for a display in headless containers.
ENV QT_QPA_PLATFORM=offscreen
# Fixed path for both amd64 (static binary) and arm64 (symlink to apt binary).
# Override with KITINERARY_EXTRACTOR_PATH if you install it elsewhere.
ENV KITINERARY_EXTRACTOR_PATH=/usr/local/bin/kitinerary-extractor

COPY --from=server-builder /app/apps/api/dist ./apps/api/dist
# Runtime data assets read from apps/api/assets at runtime: airports.json (flight
# transport search) and atlas/*.geojson.gz (Atlas country/region map). The build
# only emits dist, so these must be copied explicitly or the features silently
# degrade to empty in the image.
COPY --from=server-builder /app/apps/api/assets ./apps/api/assets
# tsconfig-paths/register reads this at runtime to resolve MCP SDK paths.
COPY apps/api/tsconfig.json ./apps/api/
# Encryption-key rotation is run on demand via tsx (a prod dep) straight from the
# raw .ts source — it never enters dist, so it must be copied in explicitly or
# `node --import tsx scripts/migrate-encryption.ts` fails with module-not-found.
COPY apps/api/scripts/migrate-encryption.ts ./apps/api/scripts/migrate-encryption.ts
COPY --from=shared-builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=client-builder /app/apps/web/dist ./apps/api/public
COPY --from=client-builder /app/apps/web/public/fonts ./apps/api/public/fonts

RUN mkdir -p /app/data/logs /app/uploads/files /app/uploads/covers /app/uploads/avatars /app/uploads/photos && \
    ln -s /app/uploads /app/apps/api/uploads && \
    ln -s /app/data /app/apps/api/data && \
    chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=3000
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
# Preflight: if the app code is missing, a volume was almost certainly mounted
# over /app (it hides the image's node_modules + dist). Fail with actionable
# guidance instead of a cryptic "Cannot find module 'tsconfig-paths/register'".
# cd into apps/api/ so tsconfig-paths/register finds tsconfig.json and ../../node_modules resolves correctly.
CMD ["sh", "-c", "if [ ! -f /app/apps/api/dist/index.js ] || [ ! -d /app/node_modules/tsconfig-paths ]; then echo 'FATAL: memove application files are missing from the image.'; echo 'A volume is likely mounted over /app, which hides the app code.'; echo 'Mount ONLY your data and uploads dirs: -v ./data:/app/data -v ./uploads:/app/uploads'; echo 'Do NOT mount a volume at /app. See the Troubleshooting section of the README.'; exit 1; fi; chown -R node:node /app/data /app/uploads 2>/dev/null || true; cd /app/apps/api && exec gosu node node --require tsconfig-paths/register dist/index.js"]
