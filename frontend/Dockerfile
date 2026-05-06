# ─── build stage ───────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
# Static assets (login background, etc.) — Vite copies anything in public/
# to the build root so they're reachable as /<filename> at runtime.
COPY public ./public
RUN npm run build

# ─── runtime: nginx-served static ──────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
# A tiny default that just serves static — the project's main NGINX
# (see ./nginx/) terminates TLS and proxies to this container on port 80.
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  index index.html;\n  location / { try_files $uri /index.html; }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
