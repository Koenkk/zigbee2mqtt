
## zigbee2mqtt.yaml

``` yaml
####################################################################
## group
####################################################################
group:
  zigbee_group:
    view: no
    control: hidden
    name: Zigbee2mqtt
    entities:
      - input_boolean.zigbee_permit_join
      - timer.zigbee_permit_join
      - sensor.zigbee2mqtt_bridge_state
      - switch.zigbee2mqtt_main_join
      - automation.enable_zigbee_joining
      - automation.disable_zigbee_joining
      - automation.disable_zigbee_joining_by_timer
      - input_select.zigbee2mqtt_log_level
      - automation.zigbee2mqtt_log_level
###########################################################
## input_select
###########################################################
#input_select.zigbee2mqtt_debug_level
input_select:
  zigbee2mqtt_log_level:
    name: Zigbee2mqtt Log Level
    options:
     - debug
     - info
     - warn
     - error
    initial: info
    icon: mdi:format-list-bulleted
#####################################################################
## input_boolean:
#####################################################################
input_boolean:
  zigbee_permit_join:
    name: Allow devices to join
    initial: off
    icon: mdi:cellphone-wireless
#####################################################################
## timer
#####################################################################
timer:
  zigbee_permit_join:
    name: Time remaining
    duration: 120
#
# 120 sec=2min
# Updated this to the number of seconds you wish
#####################################################################
## sensor
#####################################################################
sensor:
  - platform: mqtt
    name: Zigbee2mqtt Bridge state
    state_topic: "zigbee2mqtt/bridge/state"
    icon: mdi:router-wireless
####################################################################
## switch
#####################################################################
switch:
  - platform: mqtt
    name: "Zigbee2mqtt Main join"
    state_topic: "zigbee2mqtt/bridge/config/permit_join"
    command_topic: "zigbee2mqtt/bridge/config/permit_join"
    payload_on: "true"
    payload_off: "false"
#
#################################################################
## automation                                                    
#################################################################
automation:
# Change log level without restart zigbee2mqtt
#automation.zigbee2mqtt_log_level
  - alias: Zigbee2mqtt Log Level
    initial_state: 'on'
    trigger:
      - platform: state
        entity_id: input_select.zigbee2mqtt_log_level
        to: debug
      - platform: state
        entity_id: input_select.zigbee2mqtt_log_level
        to: warn
      - platform: state
        entity_id: input_select.zigbee2mqtt_log_level
        to: error
      - platform: state
        entity_id: input_select.zigbee2mqtt_log_level
        to: info
    action:
      - service: mqtt.publish
        data:
          payload_template: '{{ states(''input_select.zigbee2mqtt_log_level'') }}'
          topic: zigbee2mqtt/bridge/config/log_level
#
  - id: enable_zigbee_join
    alias: Enable Zigbee joining
    hide_entity: true
    trigger:
      platform: state
      entity_id: input_boolean.zigbee_permit_join
      to: 'on'
    action:
    - service: mqtt.publish
      data:
        topic: zigbee2mqtt/bridge/config/permit_join
        payload: 'true'
    - service: timer.start
      data:
        entity_id: timer.zigbee_permit_join
#
  - id: disable_zigbee_join
    alias: Disable Zigbee joining
    trigger:
    - entity_id: input_boolean.zigbee_permit_join
      platform: state
      to: 'off'
    action:
    - data:
        payload: 'false'
        topic: zigbee2mqtt/bridge/config/permit_join
      service: mqtt.publish
    - data:
        entity_id: timer.zigbee_permit_join
      service: timer.cancel
#
  - id: disable_zigbee_join_timer
    alias: Disable Zigbee joining by timer
    hide_entity: true
    trigger:
    - platform: event
      event_type: timer.finished
      event_data:
        entity_id: timer.zigbee_permit_join
    action:
    - service: mqtt.publish
      data:
        topic: zigbee2mqtt/bridge/config/permit_join
        payload: 'false'
    - service: input_boolean.turn_off
      data:
        entity_id: input_boolean.zigbee_permit_join
#####################################################
```
