#!/bin/bash
function zigbee2mqtt-show-short-info {
  echo "Setup for Zigbee2MQTT bridge."
}

function zigbee2mqtt-show-long-info {
  echo "This script installs the Zigbee2MQTT bridge"
}

function zigbee2mqtt-show-copyright-info {
  echo "Original concept by Landrash <https://github.com/landrash>."
}

function zigbee2mqtt-install-package {
echo -n "Installing dependencies : "
node=$(which npm)
if [ -z "${node}" ]; then #Installing NodeJS if not already installed.
  printf "Downloading and installing NodeJS...\\n"
  curl -sL https://deb.nodesource.com/setup_10.x | bash -
  apt install -y nodejs
fi

echo "Cloning Zigbee2MQTT git repository"
git clone https://github.com/Koenkk/zigbee2mqtt.git /opt/zigbee2mqtt
chown -R pi:pi /opt/zigbee2mqtt

echo "Running install. This might take a while and can produce some expected errors"
cd /opt/zigbee2mqtt || exit
su pi -c "npm ci"

echo "Creating service file zigbee2mqtt.service"
service_path="/etc/systemd/system/zigbee2mqtt.service"

echo "[Unit]
Description=zigbee2mqtt
After=network.target

[Service]
Type=notify
ExecStart=/usr/bin/node index.js
WorkingDirectory=/opt/zigbee2mqtt
StandardOutput=inherit
StandardError=inherit
WatchdogSec=10s
Restart=always
User=pi

[Install]
WantedBy=multi-user.target" > $service_path

echo "Checking the installation..."
if [ ! -f /opt/zigbee2mqtt/data/configuration.yaml ]; then
  validation=""
else
  validation="ok"
fi

if [ ! -z "${validation}" ]; then
  echo
  echo -e "\\e[32mInstallation done..\\e[0m"
  echo -e "Update of configuration.yaml is required found at /opt/zigbee2mqtt/data/"
  echo -e "Some further configuration is required and details can be found here https://www.zigbee2mqtt.io"
  echo
  echo -e "Service can be started after configuration but running sudo systemctl start zigbee2mqtt"
  echo
else
  echo
  echo -e "\\e[31mInstallation failed..."
  echo
  return 1
fi
return 0
}

[[ "$_" == "$0" ]] && zigbee2mqtt-install-package
