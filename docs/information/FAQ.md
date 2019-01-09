# Frequently asked questions

## Can Zigbee stick X be supported?
Unless the stick supports Texas Instruments Z-Stack, no. Zigbee2mqtt is based on zigbee-shepherd, zigbee-shepherd is based on Texas Instruments Z-Stack which means that only Z-Stack based device can be supported.

## I read that zigbee2mqtt has a limit of 15 devices, is this true?
Definitely not! The default zigbee2mqtt firmware indeed supports 15 devices connected **directly** to the coordinator. However, by having routers in your network (probably all AC powered devices e.g. bulbs, you can even use another [CC2530/CC2531 as a router](../cc_sniffer_devices.md)) the network size can be extended. Various zigbee2mqtt users have reported that networks of 40+ nodes work without problems. Don't want to buy a router? No problem! In that case an [alternative firmware](https://github.com/Koenkk/Z-Stack-firmware/tree/master/coordinator/CC2531/alternatives/max_devices) can be used which supported 44 devices **directly** connected to the coordinator.