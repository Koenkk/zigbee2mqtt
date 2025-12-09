ARG TARGETPLATFORM

FROM alpine:3.23 AS base

ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache tzdata eudev tini nodejs

# Dependencies and build
FROM base AS deps

COPY package.json pnpm-lock.yaml ./

# Make and such are needed to compile serialport for riscv64
# Install pnpm, configure a tmp-based store, then use it under a cache mount so each arch gets its own store
# NOTE: We do not install devDependencies here (the --prod argument in pnpm install) as we use an already
#       built artifact (./dist directory) from previous GitHub runner stages.  Omitting devDependencies here
#       saves storage as this node_modules/ is being copied straight to the release stage later.
RUN --mount=type=cache,id=pnpm-store,target=/tmp/pnpm-store \
    apk add --no-cache make gcc g++ python3 linux-headers npm jq && \
    npm install -g $(jq -r '.packageManager' package.json) && \
    pnpm config set store-dir /tmp/pnpm-store && \
    pnpm install --frozen-lockfile --prod --no-optional && \
    # force serialport to rebuild on current platform instead of using prebuilds
    rm -rf $(find ./node_modules/.pnpm/ -wholename "*/@serialport/bindings-cpp/prebuilds" -type d) && \
    pnpm rebuild @serialport/bindings-cpp

# Release
FROM base AS release

ARG DATE
ARG VERSION
LABEL org.opencontainers.image.authors="Koen Kanters"
LABEL org.opencontainers.image.title="Zigbee2MQTT"
LABEL org.opencontainers.image.description="Zigbee to MQTT bridge using Zigbee-herdsman"
LABEL org.opencontainers.image.url="https://github.com/Koenkk/zigbee2mqtt"
LABEL org.opencontainers.image.documentation="https://www.zigbee2mqtt.io/"
LABEL org.opencontainers.image.source="https://github.com/Koenkk/zigbee2mqtt"
LABEL org.opencontainers.image.licenses="GPL-3.0"
LABEL org.opencontainers.image.created=${DATE}
LABEL org.opencontainers.image.version=${VERSION}

COPY --from=deps /app/node_modules ./node_modules
COPY dist ./dist
COPY package.json LICENSE index.js data/configuration.example.yaml ./

COPY docker/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN mkdir /app/data

ARG COMMIT
RUN echo "$COMMIT" > dist/.hash

# Expose the default frontend port (see lib/util/settings.ts defaults.frontend.port)
EXPOSE 8080

ENTRYPOINT ["docker-entrypoint.sh"]
CMD [ "/sbin/tini", "--", "node", "index.js"]
