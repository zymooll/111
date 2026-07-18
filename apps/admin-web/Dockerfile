FROM node:22-alpine AS build

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/user-web/package.json ./apps/user-web/package.json
COPY apps/admin-web/package.json ./apps/admin-web/package.json

RUN pnpm install --filter @campus-foodie/admin-web... --frozen-lockfile

COPY apps/admin-web ./apps/admin-web

ARG VITE_API_MODE=remote
ARG VITE_ADMIN_API_BASE_URL

ENV VITE_API_MODE=$VITE_API_MODE \
    VITE_ADMIN_API_BASE_URL=$VITE_ADMIN_API_BASE_URL

RUN pnpm --filter @campus-foodie/admin-web build

FROM nginx:1.27-alpine

COPY apps/admin-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/admin-web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
