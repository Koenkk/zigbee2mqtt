Ongoing discussion here: https://github.com/Koenkk/zigbee2mqtt/issues/52

CC2350 selection and flashing guide: http://ptvo.info/how-to-select-and-flash-cc2530-144/

## Zigbee Coordinator
In ZigBee, there are three different types of devices: end device, router, and coordinator. The key difference between these is that an end device can not route traffic, routers can route traffic, and the coordinator, in addition to routing traffic, is responsible for forming the network in the first place. Every network must have one and only one coordinator.

### Supported Devices

| Device| Description | Firmware | Example | Link |
| --- | --- | --- | --- | --- |
| **CC2531** | (_Default Option in getting started wiki_). USB connected Zigbee sniffer based on CC2531 with PCB antenna and no RF frontend. A very cheap option but has limited range (~30m line of sight) | [Firmware](https://github.com/Koenkk/Z-Stack-firmware/tree/master/coordinator/CC2531/bin) | ![CC2531](https://ae01.alicdn.com/kf/HTB1Httue3vD8KJjSsplq6yIEFXaJ/Wireless-Zigbee-CC2531-Sniffer-Bare-Board-Packet-Protocol-Analyzer-Module-USB-Interface-Dongle-Capture-Packet.jpg_640x640.jpg) | [Texas Instruments](http://www.ti.com/tool/cc2531emk)<br/><br/>[Aliexpress](https://www.aliexpress.com/item/Wireless-Zigbee-CC2531-Sniffer-Packet-Protocol-Analyzer-Module-USB-Interface-Dongle-Capture-Packet/32769663830.html) | |
| **CC2530** | Serial connected Zigbee sniffer based on CC2530 with either PCB antenna OR external antenna, and no RF frontend. A very cheap option with potentially increased range with external antenna (~50-60m line of sight). More difficult to connect unless paired with serial-USB | [Firmware](https://github.com/kirovilya/files/blob/master/CC2530ZNP-Pro-Secure_LinkKeyJoin.hex) | ![CC2530](http://img.dxcdn.com/productimages/sku_429478_2.jpg) | [Aliexpress](https://www.aliexpress.com/item/CC2530-Zigbee-UART-Wireless-Core-Board-Development-Board-CC2530F256-Serial-Port-Wireless-Module-24MHz/32767470382.html) |
| **CC2530 + CC2591** | Serial connected Zigbee sniffer based on CC2530 with CC2591 RF frontend and external antenna. A more expensive option with increased range (~50-60m line of sight) and higher sensitivity. More difficult to connect unless paired with serial-USB |  [Firmware](https://github.com/kirovilya/files/blob/master/CC2530ZNP-Test_for_CC2591.hex) |![CC2530 + CC2591](http://img.dxcdn.com/productimages/sku_429601_2.jpg) | [DX](http://www.dx.com/p/webee-ti-cc2530-cc2591-zigbee-wireless-module-w-antenna-429601) |
| **CC2530 with RFX2401** | Serial connected Zigbee sniffer based on CC2530 with RFX2401 RF frontend and external antenna. A more expensive option with increased range (~50-60m line of sight) and higher sensitivity. More difficult to connect unless paired with serial-USB (such as the example shown). **Note** that for the GBAN unit shown it is necessary to connect P04, P06 and P20 to GND - see [here](https://github.com/Koenkk/zigbee2mqtt/issues/52#issuecomment-391115143)| [Firmware](https://github.com/kirovilya/files/blob/master/CC2530ZNP-Test_for_CC2591.hex) | ![CC2530 with RFX2401](https://ae01.alicdn.com/kf/HTB1zAA5QVXXXXahapXXq6xXFXXXu/RF-TO-USB-CC2530-CC2591-RF-switch-USB-transparent-serial-data-transmission-equipment.jpg_640x640.jpg) | [GBAN](http://www.gban.cn/en/product_show.asp?id=43)<br/><br/>[Aliexpress](https://www.aliexpress.com/item/RF-TO-USB-CC2530-CC2591-RF-switch-USB-transparent-serial-data-transmission-equipment/1996354384.html) |

### Unsupported Devices
* **CC2531 with any RF front end (CC2591 or RFX2401)** Not tested hence cannot be indicated as supported

## Zigbee Router

Zigbee routers can increase the size/distance of the mesh network, acting as repeaters.

| Device| Description | Firmware | Example | Link |
| --- | --- | --- | --- | --- |
| **CC2531** | USB connected Zigbee sniffer based on CC2531 with PCB antenna and no RF frontend. A very cheap option but has limited range (~30m line of sight) | [Firmware](http://ptvo.info/wp-content/uploads/2018/09/cc2531_1.2.2a.44539_firmware.zip) See [here](http://ptvo.info/cc2531-based-router-firmware-136/) for more info | ![CC2531](https://ae01.alicdn.com/kf/HTB1Httue3vD8KJjSsplq6yIEFXaJ/Wireless-Zigbee-CC2531-Sniffer-Bare-Board-Packet-Protocol-Analyzer-Module-USB-Interface-Dongle-Capture-Packet.jpg_640x640.jpg) | [Texas Instruments](http://www.ti.com/tool/cc2531emk)<br/><br/>[Aliexpress](https://www.aliexpress.com/item/Wireless-Zigbee-CC2531-Sniffer-Packet-Protocol-Analyzer-Module-USB-Interface-Dongle-Capture-Packet/32769663830.html) | |
| **CC2530** | Serial connected Zigbee sniffer based on CC2530 with either PCB antenna OR external antenna, and no RF frontend. A very cheap option with potentially increased range with external antenna (~50-60m line of sight). More difficult to connect unless paired with serial-USB | [Firmware](http://ptvo.info/wp-content/uploads/2018/09/cc2530_1.2.2a.44539_firmware.zip) See [here](http://ptvo.info/cc2530-based-zigbee-coordinator-and-router-112/) for more info | ![CC2530](http://img.dxcdn.com/productimages/sku_429478_2.jpg) | [Aliexpress](https://www.aliexpress.com/item/CC2530-Zigbee-UART-Wireless-Core-Board-Development-Board-CC2530F256-Serial-Port-Wireless-Module-24MHz/32767470382.html) |
