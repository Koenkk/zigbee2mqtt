# xiaomi-zb2mqtt
Xiaomi Zigbee to MQTT bridge using zigbee-shepherd.

This little script allows you to use Xiaomi Zigbee sensors and switches **without** Xiaomi's gateway. It bridges the events sent from the sensors to MQTT. You can 
integrate the cheap and nice Zigbee sensors and switches with whatever smart home infrastructure you are using.

### To run the bridge

* Install
```sh  
$ git clone https://github.com/oskarn97/xiaomi-zb2mqtt.git  
$ cd xiaomi-zb2mqtt  
/xiaomi-zb2mqtt$ npm install  
```
* Configuration: for the moment you have to edit index.js and set your serial port and mqtt broker.

* Run it
```sh  
/xiaomi-zb2mqtt$ node index.js  
```

* To see whats happening behind the scenes run it with debug enabled:
```sh  
/xiaomi-zb2mqtt$ DEBUG=* node index.js  
```
### Supports
* Buttons - Single, double, triple, quad and "more than five" click. Push and hold long click. 
* Aqara Smart Wireless Wall Switch (both Single and Double Key)
* Temperature Hudimity sensor with Temperature, Humidity and Pressure (Aqara definitely works, Classic not tested but most likely also)
* Xiaomi Smart Home Human Body Sensor (Aqara definitely works, Classic not tested but most likely also)
* Xiaomi Window Door Sensor (both Aqara and Classic)


### Notes
* You need CC2531 USB stick flashed with the firmware from this repo
* The stick needs a few seconds to work after the system has booted. Please make sure to wait about 60 seconds after boot before starting this service.

### Pairing
* Unlike the gateway, the stick does not know the exact characteristics of each Xiaomi device. That is why pairing takes up to 60 seconds to finish. It is important that during this time, the device stays awake. Otherwise, pairing fails.
Except the Wireless Wall Switches, you need to tap (not hold!) the reset button of the device every 3-4 seconds to keep it awake while paring until the confirmation appears. If you see the "cannot get Node descriptior" exception in the log, the device went to sleep and you need to try it again. Once successfully paired, the device works perfectly reliable.
