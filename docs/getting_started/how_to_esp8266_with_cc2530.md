
# CC2530 with esp8266

# Wiring:
```
ESP8266   --> CC2530
3v3       --> VCC
GND       --> GND
TX        --> P02
RX        --> P03
GND       --> P20
GND       --> P04
GND       --> P05
```
# Esp8266 flashing
Press the Flashmode button when connection to the computer

Downlad the lastest https://github.com/letscontrolit/ESPEasy/releases
Extract the ESPMega zip file, and open ‘FlashESP8266.exe’
Select the right COM port and select the right Firmware (ESP_Easy_mega-XXXXXXXX_normal_ESP8266_4096.bin)

When it is ready close the flashing tool
The ESP8266 will now emit a wifi signal, connect with it with the following password: ‘configesp’ (more information at https://www.letscontrolit.com/wiki/index.php/ESPEasy#Introduction)
After connection a screen opens in which you can let the ESP8266 connect to your WIFI, if succesfull its new IP address will be shown.
Go to this IP address in your browser and click on devices
or Go to http://192.168.4.1/setup
Click on "Devices" Edit of the first task and select ‘Communication - Serial Server’ from the dropdown list
Fill in the form as following:
```
a.    Name: ZIGBEE2MQTT
b.    Enabled: checked
c.    TCP Port: a number between 1000 and 9999 "1775"
d.    Baud Rate: 115200
e.    Data bits: 8
f.    Parity: No Parity
g.    Stop bits: 1
h.    Reset target after boot: - none –
i.    RX receive timeout: 0
j.    Event processing: Generic
```
Press Submit

Then its complete the device will get devicename ESP-Easy-0 check your router for the IP or you will get directed after the setup of the Wifi the first time you connected to the device.

You can also try to use ser2net on Linux then use that port.
https://www.letscontrolit.com/wiki/index.php/Ser2Net
Mount with socat
  

# Install socat
```bash
sudo apt-get install socat
```

# Setup of socat virtualport on zigbee2mqtt server side
Make dir
```bash
sudo mkdir /opt/zigbee2mqtt/vusb/
```
Give Pi user owner rights to /dev/vusb
```bash
sudo chown -R pi:pi /opt/zigbee2mqtt/vusb/
```
# Comfirm connection works 
Change first IP and PORT
```bash
socat -d -d pty,raw,echo=0,link=/opt/zigbee2mqtt/vusb/zigbee_cc2530 tcp-connect:IP:PORT
```
or
```bash
socat -d -d pty,raw,b115200,echo=0,link=/opt/zigbee2mqtt/vusb/zigbee_cc2530 tcp:127.0.0.1:1775
```
# Create a systemctl configuration file for socat-vusb
 I’m also running it pi because its on the group "dialout" otherwise you will have a permission issue on the device.
 ```bash
sudo nano /etc/systemd/system/socat-vusb.service
 ```
Add the following to this file:

Change first IP and PORT

```bash
[Unit]
Description=socat-vusb
After=network-online.target

[Service]
User=pi
ExecStart=/usr/bin/socat -d -d pty,raw,echo=0,link=/opt/zigbee2mqtt/vusb/zigbee_cc2530 tcp:IP:PORT,reuseaddr
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.targett
```
Save the file and exit.
 
Update systemd
```bash
sudo systemctl --system daemon-reload
 ```
Verify that the configuration works:
```bash
sudo systemctl start socat-vusb.service
 ```
Show status
```bash
systemctl status socat-vusb.service
 ```
# Restart and check Log
```bash
sudo systemctl restart socat-vusb.service && sudo journalctl -f -u socat-vusb.service
```
 Now that everything works, we want systemctl to start socat-vusb automatically on boot, this can be done by executing:
 ```bash
sudo systemctl enable socat-vusb.service
 ```
# Some tips that can be handy later:
 
Stopping socat-vusb
```bash
sudo systemctl stop socat-vusb
 ```
 Starting socat-vusb
```bash
sudo systemctl start socat-vusb
 ```
 
# View the log of socat-vusb
```bash
sudo journalctl -u socat-vusb.service -f

Output should look like:
```bash
pi@hassbian:~ $ systemctl status socat-vusb.service
● socat-vusb.service - socat-vusb
   Loaded: loaded (/etc/systemd/system/socat-vusb.service; enabled; vendor preset: enabled)
   Active: active (running) since Fri 2019-02-01 15:35:24 UTC; 4min 11s ago
 Main PID: 1406 (socat)
   CGroup: /system.slice/socat-vusb.service
           └─1406 /usr/bin/socat -d -d pty,raw,b115200,echo=0,link=/opt/zigbee2mqtt/vusb/zigbee_cc2530 tcp:127.0.0.1:1775,reuseaddr

Feb 01 15:35:24 hassbian systemd[1]: Started socat-vusb.
Feb 01 15:35:24 hassbian socat[1406]: 2019/02/01 15:35:24 socat[1406] N PTY is /dev/pts/3
Feb 01 15:35:24 hassbian socat[1406]: 2019/02/01 15:35:24 socat[1406] N opening connection to AF=2 127.0.0.1:1775
Feb 01 15:35:24 hassbian socat[1406]: 2019/02/01 15:35:24 socat[1406] N successfully connected from local address AF=2 127.0.0.1:47512
Feb 01 15:35:24 hassbian socat[1406]: 2019/02/01 15:35:24 socat[1406] N starting data transfer loop with FDs [5,5] and [7,7]
```
# Adding virtual device to zigbee2mqtt config
```bash
sudo nano  /opt/zigbee2mqtt/data/configuration.yaml
 ```
 ```yaml
serial:
  port: /opt/zigbee2mqtt/vusb/zigbee_cc2530
advanced:
  rtscts: false
  ```
 # Restart zigbee2mqtt and confirm it works.
```bash
sudo systemctl restart zigbee2mqtt.service && sudo journalctl -f -u zigbee2mqtt.service
```
