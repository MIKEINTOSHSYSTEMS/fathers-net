# =============================================================================
# FathersNet reminders service image (WP-021)
#
# Strategy: npm workspaces monorepo — builds the whole workspace in a builder
# stage (needed for @fathersnet/* inter-package resolution), then copies ONLY
# the artifacts the reminders service needs into a slim, non-root runtime stage.
# UID/GID 1001 per implementation-plan/12 §2.3 (non-root hardening).
# =============================================================================

# --- Builder -------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first (better layer caching).
COPY package.json package-lock.json .npmrc tsconfig.base.json turbo.json ./
COPY packages/config packages/config
COPY packages/errors packages/errors
COPY packages/events packages/events
COPY packages/logger packages/logger
COPY services/reminders services/reminders

RUN npm ci

# Build workspace dependencies first, then the reminders service.
RUN npx turbo run build --filter=@fathersnet/reminders^... && npx turbo run build --filter=@fathersnet/reminders

# --- Runtime -------------------------------------------------------------
FROM node:20-alpine AS runtime

ENV NODE_ENV=production
ENV FN_PORT=3500
ENV FN_HOST=0.0.0.0

WORKDIR /app

# Create non-root user (UID 1001, GID 1001) — 12 §2.3.
RUN addgroup -g 1001 nodeapp && adduser -u 1001 -G nodeapp -D -h /app nodeapp

# Copy the workspace manifests + built outputs needed at runtime.
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/reminders/package.json ./services/reminders/package.json
COPY --from=builder /app/services/reminders/dist ./services/reminders/dist

USER nodeapp

EXPOSE 3500

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3500/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" || exit 1

CMD ["node", "services/reminders/dist/index.js"]
