FROM node:22-alpine AS build

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/user-web/package.json ./apps/user-web/package.json
COPY apps/admin-web/package.json ./apps/admin-web/package.json

RUN pnpm install --filter @campus-foodie/user-web... --frozen-lockfile

COPY apps/user-web ./apps/user-web

ARG VITE_API_MODE=remote
ARG VITE_API_BASE_URL
ARG VITE_AMAP_KEY
ARG VITE_AMAP_SECURITY_CODE

ENV VITE_API_MODE=$VITE_API_MODE \
    VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_AMAP_KEY=$VITE_AMAP_KEY \
    VITE_AMAP_SECURITY_CODE=$VITE_AMAP_SECURITY_CODE

RUN pnpm --filter @campus-foodie/user-web build

FROM nginx:1.27-alpine

COPY apps/user-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/user-web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
