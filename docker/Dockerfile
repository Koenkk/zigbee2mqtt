# set base to "alpine" or "debian" to set the base os
ARG base=alpine

# The following is a multi-stage build that builds the image in 5 stages:
# release -> entrypoint-${base} -> app -> build -> base-${base}

# base-alpine and base-debian both install the same packages
FROM node:18-alpine3.16 AS base-alpine
WORKDIR /app
RUN apk add --no-cache tzdata eudev tini make gcc g++ python3 linux-headers git

FROM node:18-bullseye-slim AS base-debian
WORKDIR /app
RUN apt-get update && apt-get install -y udev build-essential python3 git

# build is base layer agnostic
FROM base-${base} AS build
COPY package*.json tsconfig.json index.js ./
COPY lib ./lib
RUN npm rebuild --build-from-source
RUN npm ci --production --no-audit --no-optional --no-update-notifier

# app is base layer agnostic
FROM base-${base} AS app

COPY --from=build /app/node_modules ./node_modules

COPY dist ./dist
COPY package.json LICENSE index.js data/configuration.yaml ./

COPY docker/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN mkdir /app/data

ARG COMMIT
RUN echo "$COMMIT" > dist/.hash

ENV NODE_ENV production

FROM app AS entrypoint-alpine
ENTRYPOINT ["docker-entrypoint.sh"]
CMD [ "/usr/bin/tini", "--", "node", "index.js"]

FROM app AS entrypoint-debian
ENTRYPOINT ["docker-entrypoint.sh"]
CMD [ "node", "index.js"]

FROM entrypoint-${base} AS release
# This is our final layer! :-)