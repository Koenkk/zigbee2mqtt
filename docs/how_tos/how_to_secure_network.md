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

The network encryption key size is `128-bit` which is essentially 16 decimal values between `0` and `255` or 16 hexadecimal values between `0x00`and `0xFF`.

If you need to transform your decimals to hexadecimals (or vice versa) please use a [converter](https://www.binaryhexconverter.com/decimal-to-hex-converter). Example: 92 (decimal) would become 5C (hexadecimal).
