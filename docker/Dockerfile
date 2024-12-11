ARG TARGETPLATFORM

# Need to use Alpine 3.18.4 which uses Node 18 for arm/v6 and arm/v7, otherwise the build hangs.
# See https://github.com/nodejs/docker-node/issues/2077
FROM alpine:3.18.4 AS arm-alpine
FROM alpine:3.21 AS arm64-alpine
FROM alpine:3.21 AS amd64-alpine

FROM ${TARGETARCH}-alpine AS base

ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache tzdata eudev tini nodejs

# Dependencies and build
FROM base AS deps

COPY package.json pnpm-lock.yaml ./
RUN apk add make gcc g++ python3 linux-headers npm && \
    npm install -g pnpm && \
    pnpm install --frozen-lockfile --no-optional

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

ENTRYPOINT ["docker-entrypoint.sh"]
CMD [ "/sbin/tini", "--", "node", "index.js"]
