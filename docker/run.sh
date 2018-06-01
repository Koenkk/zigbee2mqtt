#!/bin/sh

if [ ! -z "$ZIGBEE2MQTT_DATA" ]; then
    DATA="$ZIGBEE2MQTT_DATA"
else
    DATA="/app/data"
fi

echo "Using '$DATA' as data directory"

if [ ! -f "$DATA/configuration.yaml" ]; then
    echo "Creating configuration file..."
    cp /app/configuration.yaml "$DATA/configuration.yaml"
fi

if [ ! -z "$DEBUG" ]; then
    npm start
else
    DEBUG="$DEBUG" npm start
fi
