# API + compile service. Not yet built or run in CI; treat as a starting point.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
# The toolchain the compile endpoint shells out to, plus prlimit (util-linux) for per-process limits.
RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc-avr avr-libc binutils-avr arduino-core-avr util-linux \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
ENV NODE_ENV=production COMPILE_CACHE_DIR=/var/cache/compile
RUN mkdir -p /var/cache/compile && chown node:node /var/cache/compile
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]
