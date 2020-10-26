FROM node:12-alpine3.12 as base

WORKDIR /app
RUN apk add --no-cache tzdata eudev

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
COPY index.js data/configuration.yaml ./

COPY docker/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN mkdir /app/data

ARG COMMIT
RUN echo "{\"hash\": \"$COMMIT\"}" > .hash.json

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "start"]
