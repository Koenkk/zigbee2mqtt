# MQTT topics and message structure

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
* `"device_banned"`: send when a device is banned from the network.
* `"devices"`: a list of all devices, this message can be triggered by sending a message to `zigbee2mqtt/bridge/config/devices` (payload doesn't matter).

## zigbee2mqtt/bridge/config/permit_join
Allows you to permit joining of new devices via MQTT. This is not persistent (will not be saved to `configuration.yaml`). Possible messages are:
* `"true"`: permit joining of new devices
* `"false"`: disable joining of new devices

## zigbee2mqtt/bridge/config/log_level
Allows you to switch the `log_level` during runtime. This is not persistent (will not be saved to `configuration.yaml`). Possible payloads are: `"debug"`, `"info"`, `"warn"`, `"error"`.

## zigbee2mqtt/bridge/config/remove
Allows you to remove devices from the network. Payload should be the `friendly_name`, e.g. `0x00158d0001b79111`. On successful remove a [`device_removed`](https://koenkk.github.io/zigbee2mqtt/information/mqtt_topics_and_message_structure.html#zigbee2mqttbridgelog) message is send.

## zigbee2mqtt/bridge/config/ban
Allows you to ban devices from the network. Payload should be the `friendly_name`, e.g. `0x00158d0001b79111`. On successful ban a [`device_banned`](https://koenkk.github.io/zigbee2mqtt/information/mqtt_topics_and_message_structure.html#zigbee2mqttbridgelog) message is send.

## zigbee2mqtt/bridge/config/rename
Allows you to change the `friendly_name` of a device on the fly.
Format should be: `{"old": "OLD_FRIENDLY_NAME", "new": "NEW_FRIENDLY_NAME"}`.

## zigbee2mqtt/bridge/networkmap
Allows you to retrieve a map of your zigbee network. Possible payloads are `raw`, `graphviz`. Zigbee2mqtt will send the networkmap to `zigbee2mqtt/bridge/networkmap/[graphviz OR raw]`.

## zigbee2mqtt/bridge/group/[friendly_name]/(add|remove|remove_all)
See [Groups](groups.md)

## zigbee2mqtt/bridge/(bind|unbind)/[friendly_name]
See [Binding](binding.md)

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

**Xiaomi Aqara curtain motor (ZNCLDJ11LM)**
```
{
  "position": 60,       // Value between 0 and 100, (0 - closed / 100 - open)
  "running": true,      // Curtain is moving
}
```

## zigbee2mqtt/[DEVICE_ID]/set
Publishing messages to this topic allows you to control your Zigbee devices via MQTT. Only accepts JSON messages. An example to control a Philips Hue Go (7146060PH).

```
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
    "b": 193,

    // OR

    // HEX color
    "hex": "#547CFF",

    // OR

    // Hue and/or saturation color
    "hue": 360,
    "saturation": 100
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

### Philips Hue power-on behavior
Sets the Philips Hue power-on behavior which was introduced with the November/December '18 firmware update.
```
{
  "hue_power_on_behavior": "on",          //default, on, off, recover, default = on
  "hue_power_on_brightness": 125,         //default, same values as brightness, default = 255
  "hue_power_on_color_temperature": 280,  //default, same values as color_temp, default = 366
}
```
Attribute Value | Description
----------------|-----------------------------------------------
default | reset to factory default value
on | lamps on after power loss with configured brightness, color-temperature, color (to-do)
off | lamps off after power loss
recover | last running state after power loss

### Philips Hue motion detector (SML001)
Sets the sensors timeout between last motion detected
and sensor reports occupance false
```
{
    // Value >= 0,
    // 0 - 10: 10sec (min possible timeout)
    //   > 10: timeout in sec
    // (must be written to (default) endpoint 2)
    "occupancy_timeout": 0,
}
```

### Xiaomi Aqara vibration sensor (DJT11LM)
Set the sensitivity of the sensor. **NOTE:** As this device is sleeping most of the time, right before sending this command press the button on the device.
```
{
  "sensitivity": "medium"     // Possible values: 'low', 'medium', 'high'
}
```

### Xiaomi MiJia gas leak detector (JTQJBF01LMBW)
Set/read the sensitivity of the sensor.
```
{
  "sensitivity": "medium"     // Possible values; to set: 'low', 'medium', 'high'; to read: 'read'
}
```

Execute selftest
```json
{
  "selftest": ""
}
```

### Xiaomi Aqara curtain motor (ZNCLDJ11LM)
Set the state of the curtain.
```
{
  "state": "open"       // Possible values to set: 'open', 'close', 'stop'
}
```

Set the position of the curtain.
```
{
  "position": 50      // Possible values to set: 0 - 100 (0 - closed / 100 - open)
}
```

### SmartThings arrival sensor (STS-PRS-251)
Let the device beep.
```json
{
  "beep": 5
}
```

### eCozy Smart heating thermostat (1TST-EU), Bitron Wireless wall thermostat with relay (AV2010/32)
Get local temperature in degrees Celsius (in the range 0x954d to 0x7fff, i.e. -273.15°C to 327.67 ºC)
```json
{
  "local_temperature": ""
}
```

Get or set offset added to/subtracted from the actual displayed room temperature to NUMBER, in steps of 0.1°C
```
{
  "local_temperature_calibration": "NUMBER"       // Possible values: –2.5 to +2.5; leave empty to read
}
```

Set temperature display mode
```
{
  "temperature_display_mode": ""      // Possible values: 0 to set °C or 1 so set °F
}
```

Get room occupancy. Specifies whether the heated/cooled space is occupied or not. If 1, the space is occupied, else it is unoccupied.
```json
{
  "thermostat_occupancy": ""
}
```

Get or set occupied heating setpoint to NUMBER in degrees Celsius.
```
{
  "occupied_heating_setpoint": "NUMBER"       // Possible values: MinHeatSetpointLimit to  MaxHeatSetpointLimit, i.e. 7 to 30 by default; leave empty to read
}
```

Get or set unoccupied heating setpoint to NUMBER in degrees Celsius
```
{
  "unoccupied_heating_setpoint": "NUMBER"       // Possible values: MinHeatSetpointLimit to MaxHeatSetpointLimit, i.e. 7 to 30 by default; leave empty to read
}
```

Increase or decrease heating setpoint by NUMBER degrees in °C.
```
{
  "setpoint_raise_lower": {
    "mode": "0x00",       // Possible values: see table below
    "amount": "NUMBER"    // Possible values: signed 8-bit integer that specifies the amount the setpoint(s) are to be increased (or decreased) by, in steps of 0.1°C
  }
}
```
Attribute Value | Description
----------------|-----------------------------------------------
0x00            | Heat (adjust Heat Setpoint)
0x01            | Cool (adjust Cool Setpoint)
0x02            | Both (adjust Heat Setpoint and Cool Setpoint)

Get or set whether the local temperature, outdoor temperature and occupancy are being sensed by internal sensors or remote networked sensors
```
{
  "remote_sensing": "NUMBER"      // Possible values: see table below; leave empty to read
}
```
Bit Number | Description
-----------|-----------------------------------------
0          | 0 – local temperature sensed internally <br> 1 – local temperature sensed remotely
1          | 0 – outdoor temperature sensed internally <br> 1 – outdoor temperature sensed remotely
2          | 0 – occupancy sensed internally <br> 1 – occupancy sensed remotely

Get or set control sequence of operation
```
{
  "control_sequence_of_operation": "VALUE"       // Possible values: see table below; leave empty to read
}
```
Values                                    | Possible Values of SystemMode
------------------------------------------|-------------------------------------
`cooling only`                            | Heat and Emergency are not possible
`cooling with reheat`                     | Heat and Emergency are not possible
`heating only`                            | Cool and precooling are not possible
`heating with reheat`                     | Cool and precooling are not possible
`cooling and heating 4-pipes`             | All modes are possible
`cooling and heating 4-pipes with reheat` | All modes are possible

Get or set system mode
```
{
  "system_mode": "VALUE"       // Possible values: see table below; leave empty to read
}
```
| Values
|------------------
| `off`
| `auto`
| `cool`
| `heat`
| `emergency heating`
| `precooling`
| `fan only`
| `dry`
| `sleep`

Get running state
```
{
  "running_state": ""       // leave empty when reading
}
```
Possible values:
| Values
|------------------
| `off`
| `cool`
| `heat`

Get or set weekly schedule
```
{
  "weekly_schedule": {
    "TemperatureSetpointHold": "0x00",                // 0x00 setpoint hold off or 0x01 on
    "TemperatureSetpointHoldDuration": "0xffff",      // 0xffff to 0x05a0
    "ThermostatProgrammingOperationMode": "00xxxxxx"  //see table below
  }                                                   // leave empty to read
}
```
Attribute Value | Description
----------------|---------------------------------------------------------------------------
0               | 0 – Simple/setpoint mode. This mode means the thermostat setpoint is altered only by manual up/down changes at the thermostat or remotely, not by internal schedule programming. <br> 1 – Schedule programming mode. This enables or disables any programmed weekly schedule configurations. <br> Note: It does not clear or delete previous weekly schedule programming configurations.
1               | 0 - Auto/recovery mode set to OFF <br> 1 – Auto/recovery mode set to ON
2               | 0 – Economy/EnergyStar mode set to OFF <br> 1 – Economy/EnergyStar mode set to ON

Clear weekly schedule
```json
{
  "clear_weekly_schedule": ""
}
```
<!--
Coming soon:
Get weekly schedule response
tz.thermostat_weekly_schedule_rsp
Get relay status log
tz.thermostat_relay_status_log
Get relay status log response
tz.thermostat_relay_status_log_rsp
-->
