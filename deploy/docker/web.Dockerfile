FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
COPY apps/web/package*.json apps/web/
COPY packages/shared/package*.json packages/shared/

RUN npm install --workspaces --include-workspace-root

FROM deps AS builder
WORKDIR /app

ARG NEXT_PUBLIC_API_BASE_URL=/api
ARG NEXT_PUBLIC_KEYCLOAK_URL=https://sso.danceresource.org
ARG NEXT_PUBLIC_KEYCLOAK_REALM=YOUR_REALM
ARG NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=YOUR_CLIENT_ID
ARG NEXT_PUBLIC_KEYCLOAK_LOGIN_REDIRECT_PATH=/auth/keycloak/callback
ARG NEXT_PUBLIC_KEYCLOAK_LOGOUT_REDIRECT_PATH=/admin
ARG NEXT_PUBLIC_MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png

ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_PUBLIC_KEYCLOAK_URL=${NEXT_PUBLIC_KEYCLOAK_URL}
ENV NEXT_PUBLIC_KEYCLOAK_REALM=${NEXT_PUBLIC_KEYCLOAK_REALM}
ENV NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=${NEXT_PUBLIC_KEYCLOAK_CLIENT_ID}
ENV NEXT_PUBLIC_KEYCLOAK_LOGIN_REDIRECT_PATH=${NEXT_PUBLIC_KEYCLOAK_LOGIN_REDIRECT_PATH}
ENV NEXT_PUBLIC_KEYCLOAK_LOGOUT_REDIRECT_PATH=${NEXT_PUBLIC_KEYCLOAK_LOGOUT_REDIRECT_PATH}
ENV NEXT_PUBLIC_MAP_TILE_URL=${NEXT_PUBLIC_MAP_TILE_URL}

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
