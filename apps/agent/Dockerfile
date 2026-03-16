# Stage 1: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/agent/ ./apps/agent/
RUN npm ci
RUN npx turbo run build --filter=@codepilot/agent

# Stage 2: Runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 codepilot && adduser --system --uid 1001 codepilot
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/agent/dist ./apps/agent/dist
COPY --from=builder /app/apps/agent/package.json ./apps/agent/package.json
COPY --from=builder /app/apps/agent/src/sandbox/templates ./apps/agent/src/sandbox/templates
COPY --from=builder /app/package.json ./package.json
USER codepilot
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -q --spider http://localhost:3000/api/health || exit 1
CMD ["node", "apps/agent/dist/index.js"]
