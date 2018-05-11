#!/bin/sh

if [ ! -f /app/data/configuration.yaml ]; then
    echo "Creating configuration file..."
    cp /app/configuration.yaml /app/data/configuration.yaml
fi

npm start
