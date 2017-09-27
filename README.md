# xiaomi-zb2mqtt
Xiaomi Zigbee to MQTT bridge using zigbee-shepherd

### To run the bridge

* Install
```sh  
$ git clone https://github.com/AndrewLinden/xiaomi-zb2mqtt.git  
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
* WXKG01LM - Single, double, triple, quad and "more than five" click. Push and hold long click. 
* WXKG02LM - Left, right and both click


### Notes
* You need to flash your CC2531 with CC2531ZNP-Pro-Secure_LinkKeyJoin.hex from here: https://github.com/mtornblad/zstack-1.2.2a.44539/tree/master/CC2531
* Zigbee shepherd's pairing process can take quite a while (more than a minute).
* When pairing WXKG01LM, after reset you need to toggle (short keypress) the reset button every couple of seconds to keep the switch from going to sleep until the pairing is complete.
