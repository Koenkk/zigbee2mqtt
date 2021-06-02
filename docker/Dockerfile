FROM node:14-alpine3.12 as base

WORKDIR /app
RUN apk add --no-cache tzdata eudev tini

COPY package.json ./

# Dependencies
FROM base as dependencies

COPY npm-shrinkwrap.json ./

RUN apk add --no-cache --virtual .buildtools make gcc g++ python3 linux-headers git && \
    npm ci --production && \
    apk del .buildtools

# Release
FROM base as release

COPY --from=dependencies /app/node_modules ./node_modules
COPY lib ./lib
COPY LICENSE index.js data/configuration.yaml ./

COPY docker/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN mkdir /app/data

ARG COMMIT
RUN echo "{\"hash\": \"$COMMIT\"}" > .hash.json

ENTRYPOINT ["docker-entrypoint.sh"]
CMD [ "/sbin/tini", "--", "node", "index.js"]
