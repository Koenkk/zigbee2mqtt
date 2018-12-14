# MQT topics and message structure

This page describes which MQTT topics are used by Zigbee2mqtt. Note that the base topic (by default `zigbee2mqtt`) is configurable in the [Zigbee2mqtt `configuration.yaml`](../configuration/configuration.md).

## zigbee2mqtt/bridge/state
zigbee2mqtt publishes the bridge state to this topic. Possible message are:
* `"online"`: published when the bridge is running (on startup)
* `"offline"`: published right before the bridge stops

## zigbee2mqtt/bridge/log
zigbee2mqtt will output log to this endpoint. Message are always in the form of `{"type":"TYPE","message":"MESSAGE"}`. Possible message types are:
* `"pairing"`: logging when device is connecting to the network.
* `"device_connected"`: send when a new device connects to the network.
* `"device_removed"`: send when a device is removed from the network.
* `"devices"`: a list of all devices, this message can be triggered by sending a message to `zigbee2mqtt/bridge/config/devices` (payload doesn't matter).

## zigbee2mqtt/bridge/config/permit_join
Allows you to permit joining of new devices via MQTT. This is not persistent (will not be saved to `configuration.yaml`). Possible messages are:
* `"true"`: permit joining of new devices
* `"false"`: disable joining of new devices

## zigbee2mqtt/bridge/config/log_level
Allows you to switch the `log_level` during runtime. This is not persistent (will not be saved to `configuration.yaml`). Possible payloads are: `"debug"`, `"info"`, `"warn"`, `"error"`.

## zigbee2mqtt/bridge/config/remove
Allows you to remove devices from the network. Payload should be the `friendly_name`, e.g. `0x00158d0001b79111`. On successful remove a [`device_removed`](https://koenkk.github.io/zigbee2mqtt/information/mqtt_topics_and_message_structure.html#zigbee2mqttbridgelog) message is send.

## zigbee2mqtt/bridge/config/rename
Allows you to change the `friendly_name` of a device on the fly.
Format should be: `{"old": "OLD_FRIENDLY_NAME", "new": "NEW_FRIENDLY_NAME"}`.

## zigbee2mqtt/bridge/networkmap
Allows you to retrieve a map of your zigbee network. Possible payloads are `raw`, `graphviz`. Zigbee2mqtt will send the networkmap to `zigbee2mqtt/bridge/networkmap/[graphviz OR raw]`.

## zigbee2mqtt/[DEVICE_ID]
Where `[DEVICE_ID]` is E.G. `0x00158d0001b79111`. Message published to this topic are **always** in a JSON format. Each device produces a different JSON message, **some** examples:

**Xiaomi MiJia temperature & humidity sensor (WSDCGQ01LM)**
```json
{
  "temperature": 27.34,
  "humidity": 44.72
}
```

**Xiaomi MiJia wireless switch (WXKG01LM)**
```json
{
  "click": "double"
}
```

**Xiaomi MiJia human body movement sensor (RTCGQ01LM)**
```json
{
  "occupancy": true
}
```

**IKEA TRADFRI LED bulb E27 980 lumen, dimmable, white spectrum, opal white (LED1545G12)**
```json
{
  "state": "ON",
  "brightness": 215,
  "color_temp": 325
}
```

## zigbee2mqtt/[DEVICE_ID]/set
Publishing messages to this topic allows you to control your Zigbee devices via MQTT. Only accepts JSON messages. An example to control a Philips Hue Go (7146060PH).

```json
{
  "state": "ON", // Or "OFF", "TOGGLE"
  "brightness": 255,
  "color_temp": 155,
  "color": {
    // XY color
    "x": 0.123,
    "y": 0.123,

    // OR

    // RGB color
    "r": 46,
    "g": 102,
    "b": 193
  },

  // Blinks the bulbs, possible values:
  // - "select": single blink
  // - "lselect": blinking for a longer time
  // - "none": stop blinking
  "alert": "select",

  // Specifies the number of seconds the transition to this state takes (0 by default).
  "transition": 3,
}
```

`transition` specifies the number of seconds the transition to this state takes (0 by default).

Remove attributes which are not supported for your device. E.G. in case of a Xiaomi Mi power plug ZigBee (ZNCZ02LM) only send the `"state"` attribute.

## homeassistant/[DEVICE_TYPE]/[DEVICE_ID]/[OBJECT_ID]/config
Only used when `homeassistant: true` in `configuration.yaml`. Required for [Home Assistant MQTT discovery](https://www.home-assistant.io/docs/mqtt/discovery/).

## Device specific
Device specific commands are always send to the topic: `zigbee2mqtt/[DEVICE_ID]/set`. Below you will find the possible payloads.

### Xiaomi Aqara vibration sensor (DJT11LM)
Set the sensitivity of the sensor. **NOTE:** As this device is sleeping most of the time, right before sending this command press the button on the device.
```json
{
  "sensitivity": "medium" // Possible values: 'low', 'medium', 'high'
}
```

### Xiaomi MiJia gas leak detector (JTQJBF01LMBW)
Set/read the sensitivity of the sensor.
```json
{
  "sensitivity": "medium" // Possible values; to set: 'low', 'medium', 'high'; to read: 'read'
}
```

Execute selftest
```json
{
  "selftest": ""
}
```

### SmartThings arrival sensor (STS-PRS-251)
Let the device beep.
```json
{
  "beep": 5
}
```