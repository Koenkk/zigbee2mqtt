# How to secure your Zigbee network
By default your Zigbee network isn't as secured as possible. The following settings are recommeded to apply to your configuration.

## Disable joining
To disable joining it's important that `permit_join: false` is set in your `configuration.yaml`. Otherwise rogue devices are able to join allowing them to send and receive Zigbee traffic.

## Change Zigbee network encryption key
**Changing the key requires repairing of all devices!**

Zigbee2mqtt uses a known default encryption key. Therefore it is recommended to use a different one. To use a different encryption key add the following to your `configuration.yaml`:

**Do not use this exact key.**
```
advanced:
  network_key: [7, 3, 5, 7, 9, 11, 13, 15, 0, 2, 4, 6, 8, 11, 12, 13],
```

The network encryption key size is `128-bit` which is essentially 16 decimal values between `0` and `255`.

Please note that `configuration.yaml` requires you to enter the network key in **decimal** notation (16 values between 0 and 255) while in applications like Wireshark (see [How to sniff Zigbee traffic](how_to_sniff_zigbee_traffic.md)) you will have to enter this key in **hexadecimal** notation (16 values between `00` and `FF`). To transform your decimals to hexadecimals please use a [converter](https://www.binaryhexconverter.com/decimal-to-hex-converter). Example: 92 (decimal) would become 5C (hexadecimal).
