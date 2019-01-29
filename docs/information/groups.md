# Groups
*Ongoing discussion can be found here: https://github.com/Koenkk/zigbee2mqtt/issues/764*

Zigbee2mqtt has support for Zigbee groups. By using Zigbee groups you can control multiple devices simultaneously with one command.

**NOTE:** to use groups, at least firmware version `20181224` is required! (available [here](https://github.com/Koenkk/Z-Stack-firmware/tree/master/coordinator))

## Configuration
Add the following to your `configuration.yaml`.

```yaml
groups:
  # ID, each group should have a different numerical ID
  '1':
    # Name which will be used to control the group
    friendly_name: group_1
```

## Commands
The group of a node can be configured using the following commands:

- `zigbee2mqtt/bridge/group/[GROUP_FRIENDLY_NAME]/add` with payload `DEVICE_FRIENDLY_NAME` will add a device to a group.
- `zigbee2mqtt/bridge/group/[GROUP_FRIENDLY_NAME]/remove` with payload `DEVICE_FRIENDLY_NAME` will remove a device from a group.
- `zigbee2mqtt/bridge/group/[GROUP_FRIENDLY_NAME]/remove_all` with payload `DEVICE_FRIENDLY_NAME` will remove a device from **all** groups.

## Controlling
Controlling a group is similar to controlling a single device. For example to turn on all devices that are part of group send a MQTT message to `zigbee2mqtt/[GROUP_FRIENDLY_NAME]/set` with payload:

```json
{
  "state": "ON",
}
```

## How do groups work?
By using the above `add` command above, a device will be added to a group. The device itself is responsible for storing to which groups it belongs. Others, e.g. the coordinator, do not have knowledge to which device a groups belongs.

When using the `set` command, e.g. to turn on all devices in a group, a broadcast request is send to **all* devices in the network. The device itself then determines if it belongs to that group and if it should execute the command.

