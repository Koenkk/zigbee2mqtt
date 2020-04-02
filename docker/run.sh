#!/bin/sh

if [ ! -z "$ZIGBEE2MQTT_DATA" ]; then
    DATA="$ZIGBEE2MQTT_DATA"
else
    DATA="/app/data"
fi

echo "Using '$DATA' as data directory"

if [ ! -f "$DATA/configuration.yaml" ]; then
    echo "Creating configuration file..."
    if [ -z "${NETWORK_KEY}" ]; then
      echo " - NETWORK_KEY environment variable not set, generating one ... "
      NETWORK_KEY=$(dd if=/dev/urandom bs=1 count=16 2>/dev/null | od -A n -t u1 | awk '{printf "["} {for(i = 1; i< NF; i++) {printf "%s, ", $i}} {printf "%s]\n", $NF}')
      echo " - NETWORK_KEY is now: ${NETWORK_KEY}"
    fi
    cat /app/configuration.yaml |sed s:"NETWORK_KEY":"${NETWORK_KEY}":g > "$DATA/configuration.yaml"
fi

exec npm start
