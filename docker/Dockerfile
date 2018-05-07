FROM node:8

# Copy files
ADD . /app
RUN cp /app/data/configuration.yaml /app
RUN cp /app/docker/start.sh /app
RUN chmod +x /app/start.sh

WORKDIR /app
RUN npm install

# Entrypoint
ENTRYPOINT ["./start.sh"]
