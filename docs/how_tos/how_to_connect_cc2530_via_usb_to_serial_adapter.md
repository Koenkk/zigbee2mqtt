To make the cc2530 (i got this one https://www.aliexpress.com/item/CC2530-Zigbee-UART-Wireless-Core-Board-Development-Board-CC2530F256-Serial-Port-Wireless-Module-24MHz/32767470382.html) work in zigbee2mqtt i did the following:

Flash this firmware: https://github.com/Koenkk/Z-Stack-firmware/tree/master/coordinator/CC2530/bin. I did this via the alternativ flashing methode (pinout is described here: http://ptvo.info/how-to-select-and-flash-cc2530-144/)

Get a USB to Serial Converter like this one: https://www.aliexpress.com/item/6Pin-USB-2-0-to-TTL-UART-Module-Serial-Converter-CP2102-STC-Replace-Ft232/32364013343.html?spm=a2g0s.9042311.0.0.27424c4dTjqWI9

Connect the USB-to-Serial to the CC2530 this way:

| USB-Serial Adaper  | CC2530  | 
| :------------: |:---------------:|
| 3V3      | VCC | 
| GND      | GND        | 
| TXD | P02        |
| RXD | P03       |

Connect the USB-to-Serial to your (Raspberry-PIs)-USB-Port, setup zigbee2mqtt like described in the normal documentation

my configuration.yaml:
```yaml

homeassistant: false
permit_join: true
mqtt:
  base_topic: zigbee2mqtt
  server: 'mqtt://localhost'
  user: test
  password: password
  client_id: zigbee2mqtt_client
serial:
  port: /dev/ttyUSB0
advanced:
  channel: 11
  # Optional: Logging level, options: debug, info, warn, error
  log_level: info
  rtscts: false
  baudrate: 115200


```
