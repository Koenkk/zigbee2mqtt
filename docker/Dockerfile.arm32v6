FROM arm32v6/alpine:3.9

# Setup cross-build
ENV QEMU_EXECVE 1
COPY docker/qemu-arm-static /usr/bin
WORKDIR /app

# Write .hash.json
ARG COMMIT
RUN [ "qemu-arm-static", "/bin/sh", "-c", "echo {\\\"hash\\\": \\\"$COMMIT\\\"} > .hash.json" ]

# Copy files & install dependencies
ADD . /app
RUN [ "qemu-arm-static", "/bin/sh", "-c", \
      "cp /app/data/configuration.yaml /app && \
       cp /app/docker/run.sh /app && chmod +x /app/run.sh && \
       apk add --update --no-cache make gcc g++ python linux-headers udev nodejs npm git && \
       npm install --unsafe-perm && \
       apk del make gcc g++ python linux-headers udev git"]

# Entrypoint
ENTRYPOINT ["./run.sh"]