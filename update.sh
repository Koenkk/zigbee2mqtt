#!/bin/bash -e
cd "$(dirname "$0")"

NEED_RESTART=0

if [ -d data-backup ]; then
    echo "ERROR: Backup directory exists. May be previous restoring was failed?"
    echo "1. Save 'data-backup' and 'data' dirs to safe location to make possibility to restore config later."
    echo "2. Manually delete 'data-backup' dir and try again."
    exit 1
fi

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

echo "Creating backup of configuration..."
cp -R data data-backup

echo "Checking out changes to package-lock.json..."
git checkout package-lock.json

echo "Updating..."
git pull --no-rebase

echo "Installing dependencies..."
npm ci

echo "Building..."
npm run build

echo "Restore configuration..."
cp -R data-backup/* data
rm -rf data-backup

if [ $NEED_RESTART -eq 1 ]; then
    echo "Starting Zigbee2MQTT..."
    sudo systemctl start zigbee2mqtt
fi

echo "Done!"
