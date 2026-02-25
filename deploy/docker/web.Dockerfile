FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
COPY apps/web/package*.json apps/web/
COPY packages/shared/package*.json packages/shared/

RUN npm install --workspaces --include-workspace-root

FROM deps AS builder
WORKDIR /app

COPY tsconfig.base.json ./
COPY apps/web apps/web
COPY packages/shared packages/shared

RUN npm run build -w @dr-events/shared && npm run build -w @dr-events/web

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
