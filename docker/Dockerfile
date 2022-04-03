FROM node:16-alpine3.15 as base

WORKDIR /app
RUN apk add --no-cache tzdata eudev tini

COPY package.json ./

# Dependencies and build
FROM base as dependencies_and_build

COPY npm-shrinkwrap.json tsconfig.json index.js ./
COPY lib ./lib

RUN apk add --no-cache --virtual .buildtools make gcc g++ python3 linux-headers git && \
    npm ci --production --no-audit --no-optional --no-update-notifier && \
    apk del .buildtools

# Release
FROM base as release

COPY --from=dependencies_and_build /app/node_modules ./node_modules
COPY dist ./dist
COPY LICENSE index.js data/configuration.yaml ./

COPY docker/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN mkdir /app/data

ARG COMMIT
RUN echo "$COMMIT" > dist/.hash

ENTRYPOINT ["docker-entrypoint.sh"]
CMD [ "/sbin/tini", "--", "node", "index.js"]