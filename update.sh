#!/bin/bash -e
cd "$(dirname "$0")"

NEED_RESTART=0

if which systemctl 2> /dev/null > /dev/null; then
    echo "Checking Zigbee2MQTT status..."
    if systemctl is-active --quiet zigbee2mqtt; then
        echo "Stopping Zigbee2MQTT..."
        sudo systemctl stop zigbee2mqtt
        NEED_RESTART=1
    fi
else
    echo "Skipped stopping Zigbee2MQTT, no systemctl found"
fi

echo "Updating..."
git pull --no-rebase

echo "Installing dependencies..."
pnpm i --frozen-lockfile

echo "Building..."
pnpm run build

if [ $NEED_RESTART -eq 1 ]; then
    echo "Starting Zigbee2MQTT..."
    sudo systemctl start zigbee2mqtt
fi

echo "Done!"
