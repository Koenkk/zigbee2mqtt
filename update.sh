#!/bin/bash
# Source: https://github.com/Koenkk/zigbee2mqtt/wiki/Running-the-bridge#6-for-later-update-zigbee2mqtt-to-the-latest-version

# Stop zigbee2mqtt and go to directory
sudo systemctl stop zigbee2mqtt
cd /opt/zigbee2mqtt

# Backup configuration
cp -R data data-backup

# Update
git checkout HEAD -- npm-shrinkwrap.json
git pull
rm -rf node_modules
npm install

# Restore configuration
cp -R data-backup/* data
rm -rf data-backup

# Start zigbee2mqtt
sudo systemctl start zigbee2mqtt
