FROM alpine:3.18.4 as base

WORKDIR /app
RUN apk add --no-cache tzdata eudev tini nodejs

# Dependencies and build
FROM base as dependencies_and_build

COPY package*.json tsconfig.json index.js ./
COPY lib ./lib

RUN apk add --no-cache --virtual .buildtools make gcc g++ python3 linux-headers git npm && \
    npm ci --production --no-audit --no-optional --no-update-notifier && \
    # Serialport needs to be rebuild for Alpine https://serialport.io/docs/9.x.x/guide-installation#alpine-linux
    npm rebuild --build-from-source && \
    apk del .buildtools

# Release
FROM base as release

LABEL org.opencontainers.image.authors="Koen Kanters"
LABEL org.opencontainers.image.title="zigbee2mqtt"
LABEL org.opencontainers.image.description="Zigbee to MQTT bridge using Zigbee-herdsman"
LABEL org.opencontainers.image.url="https://github.com/Koenkk/zigbee2mqtt"
LABEL org.opencontainers.image.documentation="https://www.zigbee2mqtt.io/"
LABEL org.opencontainers.image.source="https://github.com/Koenkk/zigbee2mqtt"

COPY --from=dependencies_and_build /app/node_modules ./node_modules
COPY dist ./dist
COPY package.json LICENSE index.js data/configuration.yaml data/configuration.example.yaml ./

COPY docker/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN mkdir /app/data

ARG COMMIT
RUN echo "$COMMIT" > dist/.hash

ENV NODE_ENV production

ENTRYPOINT ["docker-entrypoint.sh"]
CMD [ "/sbin/tini", "--", "node", "index.js"]
