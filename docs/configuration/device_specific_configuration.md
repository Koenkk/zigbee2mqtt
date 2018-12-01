# Device specific configuration
The `configuration.yaml` allows to set device specific configuration. The following options are available:
* `friendly_name`: Used in the MQTT topic of a device. By default this is the device ID (e.g. `0x00128d0001d9e1d2`).
* `retain`: Retain MQTT messages of this device.
* `occupancy_timeout`: Timeout (in seconds) after the `occupancy: false` message is sent, only available for occupany sensors. If not set, the timeout is `90` seconds. When set to `0` no `occupancy: false` is send.
* `qos`: QoS level for MQTT messages of this device. [What is QoS?](https://www.npmjs.com/package/mqtt#about-qos)

Example:
``` yaml
devices:
  '0x00158d0001d82999':
    friendly_name: 'my_occupancy_sensor'
    retain: true
    occupancy_timeout: 20
    qos: 1
```

Once finished, restart Zigbee2mqtt.

The bridge will log the `friendly_name` on startup, e.g.:
```
Currently 2 devices are joined:
switch_bedroom (0x00158d0001d8e1d2): WXKG01LM - Xiaomi MiJia wireless switch (EndDevice)
sensor_bedroom (0x00158d0001b79111): WSDCGQ01LM - Xiaomi MiJia temperature & humidity sensor (EndDevice)
```