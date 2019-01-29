# How to secure your Zigbee network
By default your Zigbee network isn't as secured as possible. The following settings are recommeded to apply to your configuration.

## Disabled joining
To disable joining it's important that `permit_join: false` is set in your `configuration.yaml`.

## Change Zigbee network encryption key
**Changing the key requires repairing of all devices!**

Zigbee2mqtt uses a default encryption key. Therefore it is recommended to use a different one.  To use a different encryption key add the following to you `configuration.yaml`:

**Do not use the following key.**
```
advanced:
  network_key: [7, 3, 5, 7, 9, 11, 13, 15, 0, 2, 4, 6, 8, 11, 12, 13],
```

A valid key consists of 16 hex values (each from 0x00 to 0xff), that can either be provided in decimal or in hex format. You can generate a valid key with the following command in most linux systems:
```
dd if=/dev/urandom bs=1 count=16 2>/dev/null | od -A n -t x1 | awk '{printf "["} {for(i = 1; i< NF; i++) {printf "0x%s, ", $i}} {printf "0x%s]\n", $NF}'
```
