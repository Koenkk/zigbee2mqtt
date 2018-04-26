FROM resin/armv7hf-debian

RUN [ "cross-build-start" ]

# Install nodejs and git
RUN curl -sL https://deb.nodesource.com/setup_9.x | sudo -E bash -
RUN apt-get update && apt-get install -y git nodejs make g++ && rm -rf /var/lib/apt/lists/*

# Copy files
ADD . /app
RUN cp /app/data/configuration.yaml /app
RUN cp /app/docker/start.sh /app
RUN chmod +x /app/start.sh

WORKDIR /app
RUN npm install

# Cleanup
RUN apt-get purge g++ make && apt-get autoremove && rm -rf /var/lib/apt/lists/*

RUN [ "cross-build-end" ]

# Entrypoint
ENTRYPOINT ["./start.sh"]
