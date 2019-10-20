FROM node:10-alpine

# Copy files
ADD . /app
RUN cp /app/data/configuration.yaml /app
RUN cp /app/docker/run.sh /app
RUN chmod +x /app/run.sh
WORKDIR /app

# Write .hash.json
ARG COMMIT
RUN echo "{\"hash\": \"$COMMIT\"}" > .hash.json

# Install dependencies
RUN apk add --update --no-cache tzdata udev udevadm && \
    apk add --update --no-cache --virtual .buildtools make gcc g++ python linux-headers udev git && \
    npm install --unsafe-perm --production && \
    apk del .buildtools

# Entrypoint
ENTRYPOINT ["./run.sh"]
