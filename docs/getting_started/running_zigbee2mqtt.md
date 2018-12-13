# Running Zigbee2mqtt
These instructions explain how to run Zigbee2mqtt on bare-metal Linux.

Other ways to run Zigbee2mqtt are [Docker](../information/docker.md) and the [Hass.io Zigbee2mqtt add-on](https://github.com/danielwelch/hassio-zigbee2mqtt).

For the sake of simplicity this guide assumes running on a Raspberry Pi 3 with Raspbian Stretch Lite, but will work on any Linux machine.

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
# Setup Node.js repository
sudo curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -

# Install Node.js
sudo apt-get install -y nodejs git make g++ gcc

# Verify that the correct nodejs and npm (automatically installed with nodejs)
# version has been installed
node --version  # Should output v10.X
npm --version  # Should output 6.X

# Clone zigbee2mqtt repository
sudo git clone https://github.com/Koenkk/zigbee2mqtt.git /opt/zigbee2mqtt
sudo chown -R pi:pi /opt/zigbee2mqtt

# Install dependencies
cd /opt/zigbee2mqtt
npm install
```

If everything went correctly the output of `npm install` is similar to (the number of packages and seconds is probably different on your device):
```bash
node-pre-gyp info ok
added 383 packages in 111.613s
```

Note that the `npm install` produces some `warning` which can be ignored.

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
Now that we have setup everything correctly we can start zigbee2mqtt.

```bash
cd /opt/zigbee2mqtt
npm start
```

When started successfully, you will see:
```bash
2018-5-18 20:35:07 INFO Starting zigbee-shepherd
2018-5-18 20:35:09 INFO zigbee-shepherd started
2018-5-18 20:35:09 INFO Currently 0 devices are joined:
2018-5-18 20:35:09 INFO Connecting to MQTT server at mqtt://localhost
2018-5-18 20:35:09 INFO zigbee-shepherd ready
2018-5-18 20:35:09 INFO Connected to MQTT server
```

Zigbee2mqtt can be stopped by pressing `CTRL + C`.

## 5. (Optional) Running as a daemon with systemctl
To run zigbee2mqtt as daemon (in background) and start it automatically on boot we will run Zigbee2mqtt with systemctl.

```bash
# Create a systemctl configuration file for zigbee2mqtt
sudo nano /etc/systemd/system/zigbee2mqtt.service
```

Add the following to this file:
```
[Unit]
Description=zigbee2mqtt
After=network.target

[Service]
ExecStart=/usr/bin/npm start
WorkingDirectory=/opt/zigbee2mqtt
StandardOutput=inherit
StandardError=inherit
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
```

Save the file and exit.

Verify that the configuration works:
```bash
# Start zigbee2mqtt
sudo systemctl start zigbee2mqtt

# Show status
systemctl status zigbee2mqtt.service
```

Output should look like:
```bash
pi@raspberry:/opt/zigbee2mqtt $ systemctl status zigbee2mqtt.service
● zigbee2mqtt.service - zigbee2mqtt
   Loaded: loaded (/etc/systemd/system/zigbee2mqtt.service; disabled; vendor preset: enabled)
   Active: active (running) since Thu 2018-06-07 20:27:22 BST; 3s ago
 Main PID: 665 (npm)
   CGroup: /system.slice/zigbee2mqtt.service
           ├─665 npm
           ├─678 sh -c node index.js
           └─679 node index.js

Jun 07 20:27:22 raspberry systemd[1]: Started zigbee2mqtt.
Jun 07 20:27:23 raspberry npm[665]: > zigbee2mqtt@0.1.0 start /opt/zigbee2mqtt
Jun 07 20:27:23 raspberry npm[665]: > node index.js
Jun 07 20:27:24 raspberry npm[665]: 2018-6-7 20:27:24 INFO Starting zigbee-shepherd
Jun 07 20:27:25 raspberry npm[665]: 2018-6-7 20:27:25 INFO zigbee-shepherd started
```

Now that everything works, we want systemctl to start zigbee2mqtt automatically on boot, this can be done by executing:
```bash
sudo systemctl enable zigbee2mqtt.service
```

Done! 😃

Some tips that can be handy later:
```bash
# Stopping zigbee2mqtt
sudo systemctl stop zigbee2mqtt

# Starting zigbee2mqtt
sudo systemctl start zigbee2mqtt

# View the log of zigbee2mqtt
sudo journalctl -u zigbee2mqtt.service -f
```

## 6. (For later) Update Zigbee2mqtt to the latest version
To update Zigbee2mqtt to the latest version, execute:

```sh
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
```

# What's next?
[Pairing devices](pairing_devices.md)
