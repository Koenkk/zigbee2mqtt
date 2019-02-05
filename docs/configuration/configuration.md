# Configuration
The following configuration options are available in `data/configuration.yaml`.

The values shown are the default ones.

```yaml
# Required: Home Assistant integration (MQTT discovery)
homeassistant: false

# Required: allow new devices to join.
# WARNING: Disable this after all devices have been paired!
permit_join: true

# Required: MQTT settings
mqtt:
  # Required: MQTT base topic for zigbee2mqtt MQTT messages
  base_topic: zigbee2mqtt
  # Required: MQTT server URL
  server: 'mqtt://localhost:1883'
  # Optional: MQTT server authentication user
  user: my_user
  # Optional: MQTT server authentication password
  password: my_password
  # Optional: MQTT client ID
  client_id: 'MY_CLIENT_ID'
  # Disable self-signed SSL certificates
  reject_unauthorized: true
  # Optional: Include device information to mqtt messages (default: false)
  include_device_information: true

# Required: serial settings
serial:
  # Required: location of CC2531 USB sniffer
  port: /dev/tty.usbmodem1411
  # Optional: disable LED of CC2531 USB sniffer
  disable_led: false

# Optional: advanced settings
advanced:
  # Optional: ZigBee pan ID
  pan_id: 0x1a62
  # Optional: ZigBee channel
  channel: 11
  # Optional: state caching
  # https://github.com/Koenkk/zigbee2mqtt/commit/9396bde1f3b022e0f634487d1a37d2a5127c8cb3#diff-f68567477d803b49930337bf7fe1556bR16
  cache_state: true
  # Optional: Logging level, options: debug, info, warn, error
  log_level: info
  # Optional: Location of log directory
  log_directory: data/log/%TIMESTAMP%
  # Optional: Baudrate for serial port
  baudrate: 115200
  # Optional: RTS / CTS Hardware Flow Control for serial port
  rtscts: true
  # Optional: soft reset ZNP after timeout (in seconds); 0 is disabled
  soft_reset_timeout: 0
  # Optional: network encryption key, changing requires repairing of all devices.
  network_key: [1, 3, 5, 7, 9, 11, 13, 15, 0, 2, 4, 6, 8, 10, 12, 13],
  # Optional: Add a last_seen attribute to MQTT messages, contains date/time of last Zigbee message
  # possible values are: disable (default), ISO_8601, epoch
  last_seen: 'disable'
  # Optional: Add an elapsed attribute to MQTT messages, contains milliseconds since the previous msg
  elapsed: false
  # Availability timeout in seconds, disabled by default (0).
  # When enabled, devices will be checked if they are still online.
  # Only AC powered routers are checked for availability.
  availability_timeout: 0
```
