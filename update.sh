#!/bin/bash -e

echo "Stopping Zigbee2MQTT..."
sudo systemctl stop zigbee2mqtt

echo "Creating backup of configuration..."
cp -R data data-backup

echo "Updating..."
git checkout HEAD -- npm-shrinkwrap.json
git pull

echo "Installing dependencies..."
npm ci

echo "Restore configuration..."
cp -R data-backup/* data
rm -rf data-backup

echo "Starting Zigbee2MQTT..."
sudo systemctl start zigbee2mqtt

echo "Done!"
