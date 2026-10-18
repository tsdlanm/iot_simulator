# API + Arduino compile service.   Build:  docker build -t iot-designer-api server
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
# The AVR toolchain the compile endpoint runs, and prlimit (util-linux) for per-process limits.
RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc-avr avr-libc binutils-avr arduino-core-avr util-linux \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    COMPILE_AVR_DIR=/usr/share/arduino/hardware/arduino/avr \
    COMPILE_CACHE_DIR=/var/cache/compile
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# The cache is the only place the service writes (besides /tmp), so the rest can be mounted read-only.
RUN mkdir -p /var/cache/compile && chown node:node /var/cache/compile
VOLUME /var/cache/compile
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/index.js"]
