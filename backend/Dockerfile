# ─── build stage ───────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# install deps with cached layer
COPY package.json ./
# (no lockfile in scaffold; production builds should commit one and use `npm ci`)
RUN npm install --no-audit --no-fund

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ─── runtime stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# only production deps in the final image
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
 && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
