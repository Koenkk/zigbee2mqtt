FROM alpine:3.20.2 as base

WORKDIR /app
RUN apk add --no-cache tzdata eudev tini nodejs

# Dependencies and build
FROM base as dependencies_and_build

COPY package*.json pnpm-lock.yaml tsconfig.json index.js ./
COPY lib ./lib

ENV NODE_ENV production

RUN apk add --no-cache --virtual .buildtools make gcc g++ python3 linux-headers git npm && \
    npm install -g pnpm && \
    pnpm install --frozen-lockfile --no-optional  && \
    # Serialport needs to be rebuild for Alpine https://serialport.io/docs/9.x.x/guide-installation#alpine-linux
    npm rebuild --build-from-source && \
    apk del .buildtools

# Release
FROM base as release

COPY --from=dependencies_and_build /app/node_modules ./node_modules
COPY dist ./dist
COPY package.json LICENSE index.js data/configuration.yaml data/configuration.example.yaml ./

COPY docker/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN mkdir /app/data

ARG COMMIT
RUN echo "$COMMIT" > dist/.hash

ENTRYPOINT ["docker-entrypoint.sh"]
CMD [ "/sbin/tini", "--", "node", "index.js"]
