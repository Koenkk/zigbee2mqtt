FROM node:12-alpine as base

WORKDIR /app
RUN apk add --no-cache tzdata eudev

COPY package.json .

# Dependencies
FROM base as dependencies

COPY npm-shrinkwrap.json .

RUN apk add --no-cache --virtual .buildtools make gcc g++ python linux-headers git && \
    npm ci --production && \
    apk del .buildtools

# Release
FROM base as release

COPY --from=dependencies /app/node_modules ./node_modules
COPY lib ./lib
COPY index.js docker/run.sh data/configuration.yaml ./

RUN chmod +x /app/run.sh
RUN mkdir /app/data

ARG COMMIT
RUN echo "{\"hash\": \"$COMMIT\"}" > .hash.json

ENTRYPOINT ["./run.sh"]
