# Device specific configuration
The `configuration.yaml` allows to set device specific configuration. The following options are available.

### All devices
* `friendly_name`: Used in the MQTT topic of a device. By default this is the device ID (e.g. `0x00128d0001d9e1d2`).
* `retain`: Retain MQTT messages of this device.
* `qos`: QoS level for MQTT messages of this device. [What is QoS?](https://www.npmjs.com/package/mqtt#about-qos)

### Device type specific
* `occupancy_timeout`: Timeout (in seconds) after the `occupancy: false` message is sent, only available for occupany sensors. If not set, the timeout is `90` seconds. When set to `0` no `occupancy: false` is send.
* `temperature_precision`: Controls the precision of `temperature` values, e.g. `0`, `1` or `2`; default `2`.
* `humidity_precision`: Controls the precision of `humidity` values, e.g. `0`, `1` or `2`; default `2`.
* `pressure_precision`: Controls the precision of `pressure` values, e.g. `0` or `1`; default `1`.

### Example
``` yaml
devices:
  '0x00158d0001d82999':
    friendly_name: 'my_occupancy_sensor'
    retain: true
    occupancy_timeout: 20
    qos: 1
```

### Changing device type specific defaults
The default values used for the device specific configuration can be overriden via e.g.:

```yaml
device_options:
  occupancy_timeout: 30
  temperature_precision: 1
```
