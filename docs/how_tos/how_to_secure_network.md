# How to secure your Zigbee network

By default your Zigbee network isn't as secured as possible. The following settings are recommeded to apply to your configuration.

## Disabled joining
To disable joining it's important that `permit_join: false` is set in your `configuration.yaml`.

## Enable Zigbee network encryption key *changing requires repairing of all devices*
To enable the use of a network encryption key add the following to you `configuration.yaml` Changing the key requires repairing of all devices.
**Do not use the following key.**
```
advanced:
  network_key: [7, 3, 5, 7, 9, 11, 13, 15, 0, 2, 4, 6, 8, 11, 12, 13],
```

