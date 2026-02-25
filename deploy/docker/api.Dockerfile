FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
COPY apps/api/package*.json apps/api/
COPY packages/shared/package*.json packages/shared/

RUN npm install --workspaces --include-workspace-root

FROM deps AS builder
WORKDIR /app

COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/shared packages/shared

RUN npm run build -w @dr-events/shared && npm run build -w @dr-events/api

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
