# Zigbee network

## Device types
In Zigbee, there are three different types of devices: end device, router, and coordinator. A Zigbee network always has **one** (and no more) coordinator, and can have multiple routers and end devices. In the case of zigbee2mqtt, the coordinator is your CC2531 USB stick.

### End Device
End devices do not route traffic. They may also sleep, which makes end devices a suitable choice for battery operated devices. An end device only has one parent, either the coordinator or a router, generally the closest device when it was paired. All communications to and from the end device is via their parent. If a parent router goes offline all traffic to its children will cease until those end devices time out and attempt to find a new parent. Some models of end device, notably Xiaomi, don't attempt to find a new parent so will remain isolated until re-paired with the network.

*Examples: WXKG01LM, RTCGQ01LM, MCCGQ11LM*

### Router
Routers are responsible for routing traffic between different nodes. Routers may not sleep. As such, routers are not a suitable choice for battery operated devices. Routers are also responsible for receiving and storing messages intended for their children. In addition to this, routers are the gate keepers to the network. They are responsible for allowing new nodes to join the network.

*Examples: LED1545G12, 7146060PH, ZNCZ02LM, [CC2531 USB sniffer flashed with the  router firmware](https://github.com/Koenkk/Z-Stack-firmware/tree/master/router/CC2531/bin)*


### Coordinator
A coordinator is a special router. In addition to all of the router capabilities, the coordinator is responsible for forming the network. To do that, it must select the appropriate channel, PAN ID, and extended network address. It is also responsible for selecting the security mode of the network.

*Examples: [CC2531 USB sniffer flashed with the coordinator firmware](https://github.com/Koenkk/Z-Stack-firmware/tree/master/coordinator/CC2531/bin)*

### Finding out the type of your device
Zigbee2mqtt logs the device type of your devices on startup, e.g.:
```
2018-5-28 20:39:46 INFO 0x00158d00018255df (0x00158d00018255df): ZNCZ02LM - Xiaomi Mi power plug ZigBee (Router)
2018-5-28 20:39:46 INFO 0x00158d0001b79111 (0x00158d0001b79111): WSDCGQ01LM - Xiaomi MiJia temperature & humidity sensor (EndDevice)
```

## Network size
The [CC2531 USB sniffer coordinator firmware](https://github.com/Koenkk/Z-Stack-firmware/tree/master/coordinator/CC2531/bin) has a limit of 20 **direct** children. This means 1 coordinator + 20 end devices and 0 routers.

However by adding routers to your network you can overcome the limit of 20 devices. This means that, e.g. a network of 1 coordinator, 4 routers and 50 end devices is possible.

The number of childs that a router support differs per device! Therefore, the increased size of a network by adding a router is arbitrary.
