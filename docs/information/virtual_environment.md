# Running Zigbee2mqtt in Virtual Environment
It is possible to run Zigbee2mqtt in a virtual environment, tested with an Raspberry Pi 3B+.

## 1. Determine location of CC2531 USB sniffer and checking user permissions
We first need to determine the location of the CC2531 USB sniffer. Connect the CC2531 USB to your Raspberry Pi. Most of the times the location of the CC2531 is `/dev/ttyACM0`. This can be verified by:

```bash
pi@raspberry:~ $ ls -l /dev/ttyACM0
crw-rw---- 1 root dialout 166, 0 May 16 19:15 /dev/ttyACM0  # <-- CC2531 on /dev/ttyACM0
```

As an alternative, the device can also be mapped by an ID. This can be handy if you have multiple serial devices connected to your Raspberry Pi. In the example below the device location is: `/dev/serial/by-id/usb-Texas_Instruments_TI_CC2531_USB_CDC___0X00124B0018ED3DDF-if00`
```bash
pi@raspberry:/ $ ls -l /dev/serial/by-id
total 0
lrwxrwxrwx. 1 root root 13 Oct 19 19:26 usb-Texas_Instruments_TI_CC2531_USB_CDC___0X00124B0018ED3DDF-if00 -> ../../ttyACM0
```

## 2. Installing
```bash
# Clone zigbee2mqtt repository
sudo git clone https://github.com/Koenkk/zigbee2mqtt.git /opt/zigbee2mqtt
sudo chown -R pi:pi /opt/zigbee2mqtt

# Enter folder
cd /opt/zigbee2mqtt

# Install python env
python3 -m venv .

# Activate environment 
source /opt/zigbee2mqtt/bin/activate

# Upgrade pip, wheel and setuptools
pip install --upgrade pip wheel setuptools

# Install node environment
pip install nodeenv

# Init node environment
nodeenv -p -n 10.15.1

# Deactovate and activate environment to be sure
deactivate
source /opt/zigbee2mqtt/bin/activate

# Install dependencies
cd /opt/zigbee2mqtt
npm install

# Deactivate environment 
deactivate

```
## 3. Configuring
Before we can start Zigbee2mqtt we need to edit the `configuration.yaml` file. This file contains the configuration which will be used by Zigbee2mqtt.

Open the configuration file:
```bash
nano /opt/zigbee2mqtt/data/configuration.yaml
```

For a basic configuration, the default settings are probably good. The only thing we need to change is the MQTT server url and authentication (if applicable). This can be done by changing the section below in your `configuration.yaml`.

```yaml
# MQTT settings
mqtt:
  # MQTT base topic for zigbee2mqtt MQTT messages
  base_topic: zigbee2mqtt
  # MQTT server URL
  server: 'mqtt://localhost'
  # MQTT server authentication, uncomment if required:
  # user: my_user
  # password: my_password
```
Save the file and exit.

## 4. Starting zigbee2mqtt
```bash
# Enter folder
cd /opt/zigbee2mqtt/
# Activate environment
source /opt/zigbee2mqtt/bin/activate
# Start
npm start

# ctrl + c to quit

# Deactivate environment
deactivate
```

## 5. (Optional) Running as a daemon with systemctl
To run zigbee2mqtt as daemon (in background) and start it automatically on boot we will run Zigbee2mqtt with systemctl.
```bash
# Create a systemctl configuration file for zigbee2mqtt
sudo nano /etc/systemd/system/zigbee2mqtt.service
```
Add the following to this file:
```bash
[Unit]
Description=zigbee2mqtt
After=network.target

[Service]
ExecStart=/bin/bash -c 'source /opt/zigbee2mqtt/bin/activate; /opt/zigbee2mqtt/bin/npm start'
WorkingDirectory=/opt/zigbee2mqtt
StandardOutput=inherit
StandardError=inherit
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
```

### Enable start at boot
```bash
# Reload systemctl
sudo systemctl daemon-reload

# Enable zigbee2mqtt to start at boot
sudo systemctl enable zigbee2mqtt 

# Start
sudo systemctl start zigbee2mqtt
```

### Other useful commands
```bash
# Stop
sudo systemctl stop zigbee2mqtt

# Restart 
sudo systemctl restart zigbee2mqtt

# Status
sudo systemctl status zigbee2mqtt

# Disable zigbee2mqtt from starting at boot
sudo systemctl disable zigbee2mqtt 
```

## 6. (For later) Update Zigbee2mqtt to the latest version
To update Zigbee2mqtt to the latest version, execute:

```sh
# Stop zigbee2mqtt and go to directory
sudo systemctl stop zigbee2mqtt
cd /opt/zigbee2mqtt

# Activate environment 
source /opt/zigbee2mqtt/bin/activate

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

# Deactivate environment

# Start zigbee2mqtt
sudo systemctl start zigbee2mqtt
```

# What's next?
[Pairing devices](../getting_started/pairing_devices.md)