#!/bin/bash -e

echo "Stopping zigbee2mqtt..."
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

echo "Starting zigbee2mqtt..."
sudo systemctl start zigbee2mqtt

echo "Done!"
