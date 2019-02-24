FROM alpine:3.9

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
RUN apk add --update --no-cache make gcc g++ python linux-headers udev nodejs npm git && \
    npm install --unsafe-perm && \
    apk del make gcc g++ python linux-headers udev git

# Entrypoint
ENTRYPOINT ["./run.sh"]
