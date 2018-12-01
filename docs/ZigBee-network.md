## Device types
In ZigBee, there are three different types of devices: end device, router, and coordinator. A Zigbee network always has **one** (and no more) coordinator, and can have multiple routers and end devices. In the case of zigbee2mqtt, the coordinator is your CC2531 USB stick.

### End Device
End devices do not route traffic. They may also sleep, which makes end devices a suitable choice for battery operated devices.

*Examples: WXKG01LM, RTCGQ01LM, MCCGQ11LM*

### Router
Routers are responsible for routing traffic between different nodes. Routers may not sleep. As such, routers are not a suitable choice for battery operated devices. Routers are also responsible for receiving and storing messages intended for their children. In addition to this, routers are the gate keepers to the network. They are responsible for allowing new nodes to join the network.

*Examples: LED1545G12, 7146060PH, ZNCZ02LM*


### Coordinator
A coordinator is a special router. In addition to all of the router capabilities, the coordinator is responsible for forming the network. To do that, it must select the appropriate channel, PAN ID, and extended network address. It is also responsible for selecting the security mode of the network.

*Examples: CC2531 USB sniffer flashed with [zigbee2mqtt firmware](https://github.com/Koenkk/zigbee2mqtt/wiki/Getting-started#2-flashing-the-cc2531-usb-stick)*

## Network size
The CC2531 USB sniffer [zigbee2mqtt firmware](https://github.com/Koenkk/zigbee2mqtt/wiki/Getting-started#2-flashing-the-cc2531-usb-stick) has a limit of 15 **direct** children. This means 1 coordinator + 15 end devices and 0 routers.

However by adding routers to your network you can overcome the limit of 15 devices. This means that, e.g. a network of 1 coordinator, 4 routers and 50 end devices is possible.

Zigbee2mqtt logs the device type of your devices on startup, e.g.:
```
2018-5-28 20:39:46 INFO 0x00158d00018255df (0x00158d00018255df): ZNCZ02LM - Xiaomi Mi power plug ZigBee (Router)
2018-5-28 20:39:46 INFO 0x00158d0001b79111 (0x00158d0001b79111): WSDCGQ01LM - Xiaomi MiJia temperature & humidity sensor (EndDevice)
```

Dicussion: https://github.com/Koenkk/zigbee2mqtt/issues/26


