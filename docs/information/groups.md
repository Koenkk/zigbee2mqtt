# Groups
Zigbee2mqtt has support for Zigbee groups. By using Zigbee groups you can control multiple devices simultaneously.

## Configuration
Add the following to your `configuration.yaml`.

```yaml
groups:
  # ID, each group should have a different numerical ID
  '1':
    # Name which will be used to control the group
    friendly_name: group_1
```

## Adding a device to a group
Send an MQTT message to `zigbee2mqtt/bridge/groups/[GROUP_FRIENDLY_NAME]/add` with payload `DEVICE_FRIENDLY_NAME`

## Remove a device from a group
Send an MQTT message to `zigbee2mqtt/bridge/groups/[GROUP_FRIENDLY_NAME]/remove` with payload `DEVICE_FRIENDLY_NAME`

## Controlling
To control a group the following topic should be used. The payload is the same as is used for controlling devices.

```
zigbee2mqtt/group/[GROUP_FRIENDLY_NAME]/set
```

