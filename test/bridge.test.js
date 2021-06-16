const data = require('./stub/data');
const logger = require('./stub/logger');
const zigbeeHerdsman = require('./stub/zigbeeHerdsman');
const MQTT = require('./stub/mqtt');
const settings = require('../lib/util/settings');
const Controller = require('../lib/controller');
const flushPromises = () => new Promise(setImmediate);
const stringify = require('json-stable-stringify-without-jsonify');

const {coordinator, bulb, unsupported, WXKG11LM, remote, ZNCZ02LM} = zigbeeHerdsman.devices;
zigbeeHerdsman.returnDevices.push(coordinator.ieeeAddr);
zigbeeHerdsman.returnDevices.push(bulb.ieeeAddr);
zigbeeHerdsman.returnDevices.push(unsupported.ieeeAddr);
zigbeeHerdsman.returnDevices.push(WXKG11LM.ieeeAddr);
zigbeeHerdsman.returnDevices.push(remote.ieeeAddr);
zigbeeHerdsman.returnDevices.push(ZNCZ02LM.ieeeAddr);

describe('Bridge', () => {
    let controller;
    let mockRestart;

    beforeEach(async () => {
        MQTT.mock.reconnecting = false;
        data.writeDefaultConfiguration();
        settings.reRead();
        settings.set(['advanced', 'legacy_api'], false);
        data.writeDefaultState();
        logger.info.mockClear();
        logger.warn.mockClear();
        logger.setTransportsEnabled(false);
        MQTT.publish.mockClear();
        const device = zigbeeHerdsman.devices.bulb;
        device.removeFromDatabase.mockClear();
        device.removeFromNetwork.mockClear();
        mockRestart = jest.fn();
        controller = new Controller(mockRestart, jest.fn());
        await controller.start();
        await flushPromises();
    });

    it('Should publish bridge info on startup', async () => {
        const version = await require('../lib/util/utils').getZigbee2mqttVersion();
        const directory = settings.get().advanced.log_directory;
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/info',
            stringify({ "restart_required": false, "commit": version.commitHash, "config": { "advanced": { "adapter_concurrent": null, "adapter_delay": null, "availability_blacklist": [], "availability_blocklist": [], "availability_passlist": [], "availability_timeout": 0, "availability_whitelist": [], "cache_state": true, "cache_state_persistent": true, "cache_state_send_on_startup": true, "channel": 11, "elapsed": false, "ext_pan_id": [221, 221, 221, 221, 221, 221, 221, 221], "homeassistant_discovery_topic": "homeassistant", "homeassistant_legacy_entity_attributes": true, "homeassistant_legacy_triggers": true, "homeassistant_status_topic": "hass/status", "last_seen": "disable", "legacy_api": false, "log_directory": directory, "log_file": "log.txt", "log_level": "info", "log_output": ["console", "file"], "log_rotation": true, "log_symlink_current": false, "log_syslog": {}, "pan_id": 6754, "report": false, "soft_reset_timeout": 0, "timestamp_format": "YYYY-MM-DD HH:mm:ss" }, "ban": [], "blocklist": [], "device_options": {}, "devices": { "0x000b57fffec6a5b2": { "friendly_name": "bulb", "retain": true }, "0x000b57fffec6a5b3": { "friendly_name": "bulb_color", "retain": false }, "0x000b57fffec6a5b4": { "friendly_name": "bulb_color_2", "retain": false }, "0x000b57fffec6a5b7": { "friendly_name": "bulb_2", "retain": false }, "0x0017880104a44559": { "friendly_name": "J1_cover" }, "0x0017880104e43559": { "friendly_name": "U202DST600ZB" }, "0x0017880104e44559": { "friendly_name": "3157100_thermostat" }, "0x0017880104e45517": { "friendly_name": "remote", "retain": true }, "0x0017880104e45518": { "friendly_name": "0x0017880104e45518" }, "0x0017880104e45520": { "friendly_name": "button", "retain": false }, "0x0017880104e45521": { "friendly_name": "button_double_key", "retain": false }, "0x0017880104e45522": { "friendly_name": "weather_sensor", "qos": 1, "retain": false }, "0x0017880104e45523": { "friendly_name": "occupancy_sensor", "retain": false }, "0x0017880104e45524": { "friendly_name": "power_plug", "retain": false }, "0x0017880104e45526": { "friendly_name": "GL-S-007ZS" }, "0x0017880104e45529": { "friendly_name": "unsupported2", "retain": false }, "0x0017880104e45530": { "friendly_name": "button_double_key_interviewing", "retain": false }, "0x0017880104e45540": { "friendly_name": "ikea_onoff" }, "0x0017880104e45541": { "friendly_name": "wall_switch", "retain": false }, "0x0017880104e45542": { "friendly_name": "wall_switch_double", "retain": false }, "0x0017880104e45543": { "friendly_name": "led_controller_1", "retain": false }, "0x0017880104e45544": { "friendly_name": "led_controller_2", "retain": false }, "0x0017880104e45545": { "friendly_name": "dimmer_wall_switch", "retain": false }, "0x0017880104e45547": { "friendly_name": "curtain", "retain": false }, "0x0017880104e45548": { "friendly_name": "fan", "retain": false }, "0x0017880104e45549": { "friendly_name": "siren", "retain": false }, "0x0017880104e45550": { "friendly_name": "thermostat", "retain": false }, "0x0017880104e45551": { "friendly_name": "smart vent", "retain": false }, "0x0017880104e45552": { "friendly_name": "j1", "retain": false }, "0x0017880104e45553": { "friendly_name": "bulb_enddevice", "retain": false }, "0x0017880104e45559": { "friendly_name": "cc2530_router", "retain": false }, "0x0017880104e45560": { "friendly_name": "livolo", "retain": false }, "0x0017880104e45724":{"friendly_name":"GLEDOPTO_2ID"}, "0x0017882104a44559": { "friendly_name": "TS0601_thermostat" }, "0x0017882194e45543": { "friendly_name": "QS-Zigbee-D02-TRIAC-2C-LN" }, "0x90fd9ffffe4b64aa": { "friendly_name": "SP600_OLD" }, "0x90fd9ffffe4b64ab": { "friendly_name": "SP600_NEW" }, "0x90fd9ffffe4b64ac": { "friendly_name": "MKS-CM-W5" }, "0x90fd9ffffe4b64ae": { "friendly_name": "tradfri_remote", "retain": false }, "0x90fd9ffffe4b64af": { "friendly_name": "roller_shutter" }, "0x90fd9ffffe4b64ax": { "friendly_name": "ZNLDP12LM" }, "0x0017880104e45561": { "friendly_name": "temperature_sensor" }, "0x0017880104e45562": { "friendly_name": "heating_actuator" } }, "experimental": { "output": "json" }, "external_converters": [], "groups": { "1": { "friendly_name": "group_1", "retain": false }, "9": { "devices": ['bulb_color_2', 'bulb_2', 'wall_switch_double/right'], "friendly_name": "ha_discovery_group"}, "11": { "devices": ["bulb_2"], "friendly_name": "group_with_tradfri", "retain": false }, "14": { "devices": ["power_plug"], "friendly_name": "switch_group", "retain": false }, "12": { "devices": ["TS0601_thermostat"], "friendly_name": "thermostat_group", "retain": false }, "15071": { "devices": ["bulb_color_2", "bulb_2"], "friendly_name": "group_tradfri_remote", "retain": false }, "2": { "friendly_name": "group_2", "retain": false }, "21":{"devices":["GLEDOPTO_2ID/cct"],"friendly_name":"gledopto_group"} }, "homeassistant": false, "map_options": { "graphviz": { "colors": { "fill": { "coordinator": "#e04e5d", "enddevice": "#fff8ce", "router": "#4ea3e0" }, "font": { "coordinator": "#ffffff", "enddevice": "#000000", "router": "#ffffff" }, "line": { "active": "#009900", "inactive": "#994444" } } } }, "mqtt": { "base_topic": "zigbee2mqtt", "include_device_information": false, "server": "mqtt://localhost", "force_disable_retain": false,  }, "ota":{"disable_automatic_update_check":false,"update_check_interval":1440},  "passlist": [], "permit_join": true, "serial": { "disable_led": false, "port": "/dev/dummy" }, "whitelist": [] }, "coordinator": { "meta": { "revision": 20190425, "version": 1 }, "type": "z-Stack" }, "log_level": "info", "network": { "channel": 15, "extended_pan_id": [0, 11, 22], "pan_id": 5674 }, "permit_join": false, "version": version.version, config_schema: settings.schema }),
          { retain: true, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should publish devices on startup', async () => {
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/devices',
            stringify([{"date_code":null,"definition":null,"endpoints":{"1":{"bindings":[],"clusters":{"input":[],"output":[]},"configured_reportings":[]}},"friendly_name":"Coordinator","ieee_address":"0x00124b00120144ae","interview_completed":false,"interviewing":false,"model_id":null,"network_address":0,"power_source":null,"software_build_id":null,"supported":false,"type":"Coordinator"},{"date_code":null,"definition":{"description":"TRADFRI LED bulb E26/E27 980 lumen, dimmable, white spectrum, opal white","exposes":[{"features":[{"access":7,"description":"On/off state of this light","name":"state","property":"state","type":"binary","value_off":"OFF","value_on":"ON","value_toggle":"TOGGLE"},{"access":7,"description":"Brightness of this light","name":"brightness","property":"brightness","type":"numeric","value_max":254,"value_min":0},{"access":7,"description":"Color temperature of this light","name":"color_temp","presets":[{"description":"Coolest temperature supported","name":"coolest","value":250},{"description":"Cool temperature (250 mireds / 4000 Kelvin)","name":"cool","value":250},{"description":"Neutral temperature (370 mireds / 2700 Kelvin)","name":"neutral","value":370},{"description":"Warm temperature (454 mireds / 2200 Kelvin)","name":"warm","value":454},{"description":"Warmest temperature supported","name":"warmest","value":454}],"property":"color_temp","type":"numeric","unit":"mired","value_max":454,"value_min":250},{"access":7,"description":"Color temperature after cold power on of this light","name":"color_temp_startup","presets":[{"description":"Coolest temperature supported","name":"coolest","value":250},{"description":"Cool temperature (250 mireds / 4000 Kelvin)","name":"cool","value":250},{"description":"Neutral temperature (370 mireds / 2700 Kelvin)","name":"neutral","value":370},{"description":"Warm temperature (454 mireds / 2200 Kelvin)","name":"warm","value":454},{"description":"Warmest temperature supported","name":"warmest","value":454},{"description":"Restore previous color_temp on cold power on","name":"previous","value":65535}],"property":"color_temp_startup","type":"numeric","unit":"mired","value_max":454,"value_min":250}],"type":"light"},{"access":2,"description":"Triggers an effect on the light (e.g. make light blink for a few seconds)","name":"effect","property":"effect","type":"enum","values":["blink","breathe","okay","channel_change","finish_effect","stop_effect"]},{"access":7,"description":"Controls the behavior when the device is powered on","name":"power_on_behavior","property":"power_on_behavior","type":"enum","values":["off","previous","on"]},{"access":1,"description":"Link quality (signal strength)","name":"linkquality","property":"linkquality","type":"numeric","unit":"lqi","value_max":255,"value_min":0}],"model":"LED1545G12","supports_ota":true,"vendor":"IKEA"},"endpoints":{"1":{"bindings":[],"clusters":{"input":["genBasic","genScenes","genOnOff","genLevelCtrl","lightingColorCtrl"],"output":["genScenes","genOta"]},"configured_reportings":[{"attribute":"onOff","cluster":"genOnOff","maximum_report_interval":10,"minimum_report_interval":1,"reportable_change":20}]}},"friendly_name":"bulb","ieee_address":"0x000b57fffec6a5b2","interview_completed":true,"interviewing":false,"model_id":"TRADFRI bulb E27 WS opal 980lm","network_address":40369,"power_source":"Mains (single phase)","software_build_id":null,"supported":true,"type":"Router"},{"date_code":null,"definition":{"description":"Hue dimmer switch","exposes":[{"access":1,"description":"Remaining battery in %","name":"battery","property":"battery","type":"numeric","unit":"%","value_max":100,"value_min":0},{"access":1,"description":"Triggered action (e.g. a button click)","name":"action","property":"action","type":"enum","values":["on-press","on-hold","on-hold-release","up-press","up-hold","up-hold-release","down-press","down-hold","down-hold-release","off-press","off-hold","off-hold-release"]},{"access":1,"description":"Link quality (signal strength)","name":"linkquality","property":"linkquality","type":"numeric","unit":"lqi","value_max":255,"value_min":0}],"model":"324131092621","supports_ota":true,"vendor":"Philips"},"endpoints":{"1":{"bindings":[{"cluster":"genLevelCtrl","target":{"endpoint":1,"ieee_address":"0x000b57fffec6a5b3","type":"endpoint"}},{"cluster":"genOnOff","target":{"endpoint":1,"ieee_address":"0x000b57fffec6a5b3","type":"endpoint"}},{"cluster":"lightingColorCtrl","target":{"endpoint":1,"ieee_address":"0x000b57fffec6a5b3","type":"endpoint"}},{"cluster":"genOnOff","target":{"id":1,"type":"group"}},{"cluster":"genLevelCtrl","target":{"id":1,"type":"group"}}],"clusters":{"input":["genBasic"],"output":["genBasic","genOnOff","genLevelCtrl","genScenes"]},"configured_reportings":[]},"2":{"bindings":[],"clusters":{"input":["genBasic"],"output":["genOta","genOnOff"]},"configured_reportings":[]}},"friendly_name":"remote","ieee_address":"0x0017880104e45517","interview_completed":true,"interviewing":false,"model_id":"RWL021","network_address":6535,"power_source":"Battery","software_build_id":null,"supported":true,"type":"EndDevice"},{"date_code":null,"definition":null,"endpoints":{"1":{"bindings":[],"clusters":{"input":["genBasic"],"output":["genBasic","genOnOff","genLevelCtrl","genScenes"]},"configured_reportings":[]}},"friendly_name":"0x0017880104e45518","ieee_address":"0x0017880104e45518","interview_completed":true,"interviewing":false,"model_id":"notSupportedModelID","network_address":6536,"power_source":"Battery","software_build_id":null,"supported":false,"type":"EndDevice"},{"date_code":null,"definition":{"description":"Aqara wireless switch","exposes":[{"access":1,"description":"Remaining battery in %","name":"battery","property":"battery","type":"numeric","unit":"%","value_max":100,"value_min":0},{"access":1,"description":"Voltage of the battery in millivolts","name":"voltage","property":"voltage","type":"numeric","unit":"mV"},{"access":1,"description":"Triggered action (e.g. a button click)","name":"action","property":"action","type":"enum","values":["single","double","triple","quadruple","hold","release"]},{"access":1,"description":"Link quality (signal strength)","name":"linkquality","property":"linkquality","type":"numeric","unit":"lqi","value_max":255,"value_min":0}],"model":"WXKG11LM","supports_ota":false,"vendor":"Xiaomi"},"endpoints":{"1":{"bindings":[],"clusters":{"input":["genBasic"],"output":["genBasic","genOnOff","genLevelCtrl","genScenes"]},"configured_reportings":[{"attribute":1337,"cluster":"genOnOff","maximum_report_interval":10,"minimum_report_interval":1,"reportable_change":20}]}},"friendly_name":"button","ieee_address":"0x0017880104e45520","interview_completed":true,"interviewing":false,"model_id":"lumi.sensor_switch.aq2","network_address":6537,"power_source":"Battery","software_build_id":null,"supported":true,"type":"EndDevice"},{"date_code":null,"definition":{"description":"Mi power plug ZigBee","exposes":[{"features":[{"access":7,"description":"On/off state of the switch","name":"state","property":"state","type":"binary","value_off":"OFF","value_on":"ON","value_toggle":"TOGGLE"}],"type":"switch"},{"access":5,"description":"Instantaneous measured power","name":"power","property":"power","type":"numeric","unit":"W"},{"access":1,"description":"Sum of consumed energy","name":"energy","property":"energy","type":"numeric","unit":"kWh"},{"access":1,"description":"Measured temperature value","name":"temperature","property":"temperature","type":"numeric","unit":"°C"},{"access":7,"description":"Enable/disable the power outage memory, this recovers the on/off mode after power failure","name":"power_outage_memory","property":"power_outage_memory","type":"binary","value_off":false,"value_on":true},{"access":1,"description":"Link quality (signal strength)","name":"linkquality","property":"linkquality","type":"numeric","unit":"lqi","value_max":255,"value_min":0}],"model":"ZNCZ02LM","supports_ota":true,"vendor":"Xiaomi"},"endpoints":{"1":{"bindings":[],"clusters":{"input":["genBasic"],"output":[]},"configured_reportings":[]}},"friendly_name":"power_plug","ieee_address":"0x0017880104e45524","interview_completed":true,"interviewing":false,"model_id":"lumi.plug","network_address":6540,"power_source":"Mains (single phase)","software_build_id":null,"supported":true,"type":"Router"}]),
            { retain: true, qos: 0 },
            expect.any(Function)
        );
    });

    it('Should log to MQTT', async () => {
        logger.setTransportsEnabled(true);
        MQTT.publish.mockClear();
        logger.info.mockClear();
        logger.info("this is a test");
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/logging',
            stringify({message: 'this is a test', level: 'info'}),
          { retain: false, qos: 0 },
          expect.any(Function)
        );
        expect(logger.info).toHaveBeenCalledTimes(1);
    });

    it('Shouldnt log to MQTT when not connected', async () => {
        logger.setTransportsEnabled(true);
        MQTT.mock.reconnecting = true;
        MQTT.publish.mockClear();
        logger.info.mockClear();
        logger.error.mockClear();
        logger.info("this is a test");
        expect(MQTT.publish).toHaveBeenCalledTimes(0);
        expect(logger.info).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledTimes(0);
    });

    it('Should publish groups on startup', async () => {
        logger.setTransportsEnabled(true);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/groups',
          stringify([{"friendly_name":"group_1","id":1,"members":[]},{"friendly_name":"group_tradfri_remote","id":15071,"members":[]},{"friendly_name":99,"id":99,"members":[]},{"friendly_name":"group_with_tradfri","id":11,"members":[]},{"friendly_name":"thermostat_group","id":12,"members":[]},{"friendly_name":"switch_group","id":14,"members":[{"endpoint":1,"ieee_address":"0x0017880104e45524"}]},{"friendly_name":"gledopto_group","id":21,"members":[]},{"friendly_name":"default_bind_group","id":901,"members":[]},{"friendly_name":"ha_discovery_group","id":9,"members":[]},{"friendly_name":"group_2","id":2,"members":[]}]),
          { retain: true, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should publish event when device joined', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceJoined({device: zigbeeHerdsman.devices.bulb});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/event',
          stringify({"type":"device_joined","data":{"friendly_name":"bulb","ieee_address":"0x000b57fffec6a5b2"}}),
          { retain: false, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should publish event when device joined', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceNetworkAddressChanged({device: zigbeeHerdsman.devices.bulb});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/devices',
          expect.any(String),
          { retain: true, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should publish event when device announces', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceAnnounce({device: zigbeeHerdsman.devices.bulb});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/event',
          stringify({"type":"device_announce","data":{"friendly_name":"bulb","ieee_address":"0x000b57fffec6a5b2"}}),
          { retain: false, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should publish event when device interview started', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceInterview({device: zigbeeHerdsman.devices.bulb, status: 'started'});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/event',
          stringify({"type":"device_interview","data":{"friendly_name":"bulb","status":"started","ieee_address":"0x000b57fffec6a5b2"}}),
          { retain: false, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should publish event and devices when device interview failed', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceInterview({device: zigbeeHerdsman.devices.bulb, status: 'failed'});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/event',
          stringify({"type":"device_interview","data":{"friendly_name":"bulb","status":"failed","ieee_address":"0x000b57fffec6a5b2"}}),
          { retain: false, qos: 0 },
          expect.any(Function)
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/devices',
          expect.any(String),
          { retain: true, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should publish event and devices when device interview successful', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceInterview({device: zigbeeHerdsman.devices.bulb, status: 'successful'});
        await zigbeeHerdsman.events.deviceInterview({device: zigbeeHerdsman.devices.unsupported, status: 'successful'});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(4);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/event',
            stringify({"data":{"definition":{"description":"TRADFRI LED bulb E26/E27 980 lumen, dimmable, white spectrum, opal white","exposes":[{"features":[{"access":7,"description":"On/off state of this light","name":"state","property":"state","type":"binary","value_off":"OFF","value_on":"ON","value_toggle":"TOGGLE"},{"access":7,"description":"Brightness of this light","name":"brightness","property":"brightness","type":"numeric","value_max":254,"value_min":0},{"access":7,"description":"Color temperature of this light","name":"color_temp","presets":[{"description":"Coolest temperature supported","name":"coolest","value":250},{"description":"Cool temperature (250 mireds / 4000 Kelvin)","name":"cool","value":250},{"description":"Neutral temperature (370 mireds / 2700 Kelvin)","name":"neutral","value":370},{"description":"Warm temperature (454 mireds / 2200 Kelvin)","name":"warm","value":454},{"description":"Warmest temperature supported","name":"warmest","value":454}],"property":"color_temp","type":"numeric","unit":"mired","value_max":454,"value_min":250},{"access":7,"description":"Color temperature after cold power on of this light","name":"color_temp_startup","presets":[{"description":"Coolest temperature supported","name":"coolest","value":250},{"description":"Cool temperature (250 mireds / 4000 Kelvin)","name":"cool","value":250},{"description":"Neutral temperature (370 mireds / 2700 Kelvin)","name":"neutral","value":370},{"description":"Warm temperature (454 mireds / 2200 Kelvin)","name":"warm","value":454},{"description":"Warmest temperature supported","name":"warmest","value":454},{"description":"Restore previous color_temp on cold power on","name":"previous","value":65535}],"property":"color_temp_startup","type":"numeric","unit":"mired","value_max":454,"value_min":250}],"type":"light"},{"access":2,"description":"Triggers an effect on the light (e.g. make light blink for a few seconds)","name":"effect","property":"effect","type":"enum","values":["blink","breathe","okay","channel_change","finish_effect","stop_effect"]},{"access":7,"description":"Controls the behavior when the device is powered on","name":"power_on_behavior","property":"power_on_behavior","type":"enum","values":["off","previous","on"]},{"access":1,"description":"Link quality (signal strength)","name":"linkquality","property":"linkquality","type":"numeric","unit":"lqi","value_max":255,"value_min":0}],"model":"LED1545G12","supports_ota":true,"vendor":"IKEA"},"friendly_name":"bulb","ieee_address":"0x000b57fffec6a5b2","status":"successful","supported":true},"type":"device_interview"}),
            { retain: false, qos: 0 },
            expect.any(Function)
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
          'zigbee2mqtt/bridge/event',
            stringify({"type":"device_interview","data":{"friendly_name":"0x0017880104e45518","status":"successful","ieee_address":"0x0017880104e45518","supported":false,"definition":null}}),
            { retain: false, qos: 0 },
            expect.any(Function)
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/devices',
            expect.any(String),
            { retain: true, qos: 0 },
            expect.any(Function)
        );
    });

    it('Should publish event and devices when device leaves', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceLeave({ieeeAddr: zigbeeHerdsman.devices.bulb.ieeeAddr});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledTimes(2);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/event',
          stringify({"type":"device_leave","data":{"ieee_address":"0x000b57fffec6a5b2","friendly_name":"bulb"}}),
          { retain: false, qos: 0 },
          expect.any(Function)
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/devices',
          expect.any(String),
          { retain: true, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should allow permit join', async () => {
        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permit_join', 'true');
        await flushPromises();
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledWith(true, undefined, undefined);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permit_join',
            stringify({"data":{"value":true},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );

        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permit_join', stringify({"value": false}));
        await flushPromises();
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledWith(false, undefined, undefined);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permit_join',
            stringify({"data":{"value":false},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );

        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permit_join', stringify({"value": "False"}));
        await flushPromises();
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledWith(false, undefined, undefined);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permit_join',
            stringify({"data":{"value":false},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );

        // Invalid payload
        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permit_join', stringify({"value_bla": false}));
        await flushPromises();
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledTimes(0);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permit_join',
            stringify({"data":{},"status":"error","error":"Invalid payload"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow permit join for certain time', async () => {
        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permit_join', stringify({"value": false, "time": 10}));
        await flushPromises();
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledWith(false, undefined, 10);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permit_join',
            stringify({"data":{"value":false,"time": 10},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should republish bridge info when permit join changes', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.permitJoinChanged({permitted: false, time: 10});
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/info', expect.any(String), { retain: true, qos: 0 }, expect.any(Function));
    });

    it('Shouldnt republish bridge info when permit join changes and hersman is stopping', async () => {
        MQTT.publish.mockClear();
        zigbeeHerdsman.isStopping.mockImplementationOnce(() => true);
        await zigbeeHerdsman.events.permitJoinChanged({permitted: false, time: 10});
        await flushPromises();
        expect(MQTT.publish).not.toHaveBeenCalledWith('zigbee2mqtt/bridge/info', expect.any(String), { retain: true, qos: 0 }, expect.any(Function));
    });

    it('Should allow permit join via device', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permit_join', stringify({value: true, device: 'bulb'}));
        await flushPromises();
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledWith(true, device, undefined);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permit_join',
            stringify({"data":{"value":true,"device":"bulb"},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );

        // Device does not exist
        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permit_join', stringify({value: true, device: 'bulb_not_existing_woeeee'}));
        await flushPromises();
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledTimes(0);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permit_join',
            stringify({"data":{},"status":"error","error":"Device 'bulb_not_existing_woeeee' does not exist"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should put transaction in response when request is done with transaction', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permit_join', stringify({"value": false, "transaction": 22}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permit_join',
            stringify({"data":{"value":false},"status":"ok", "transaction": 22}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should put error in response when request fails', async () => {
        zigbeeHerdsman.permitJoin.mockImplementationOnce(() => {throw new Error('Failed to connect to adapter')});
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/permit_join', stringify({"value": false}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/permit_join',
            stringify({"data":{},"status":"error","error": "Failed to connect to adapter"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should put error in response when format is incorrect', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/last_seen', stringify({"value_not_good": false}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/last_seen',
            stringify({"data":{},"status":"error","error": "No value given"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Coverage satisfaction', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/random', stringify({"value": false}));
        const device = zigbeeHerdsman.devices.bulb;
        await zigbeeHerdsman.events.message({data: {onOff: 1}, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10});
        await flushPromises();
    });

    it('Should allow a healthcheck', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/health_check', '');
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/health_check',
            stringify({"data":{"healthy": true},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to remove device by string', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        settings.set(['groups'], {'1': {friendly_name: 'group_1', retain: false, devices: ['0x999b57fffec6a5b9/1', '0x000b57fffec6a5b2/1', 'bulb', 'bulb/right', 'other_bulb', 'bulb_1', '0x000b57fffec6a5b2', 'bulb/room/2']}});
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/remove', 'bulb');
        await flushPromises();
        expect(controller.state[device.ieeeAddr]).toBeUndefined();
        expect(device.removeFromNetwork).toHaveBeenCalledTimes(1);
        expect(device.removeFromDatabase).not.toHaveBeenCalled();
        expect(settings.getDevice('bulb')).toBeNull();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb', '', {retain: true, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/remove',
            stringify({"data":{"id": "bulb","block":false,"force":false},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
        expect(settings.get().blocklist).toStrictEqual([]);
        expect(settings.getGroup('group_1').devices).toStrictEqual(['0x999b57fffec6a5b9/1', 'other_bulb', 'bulb_1', 'bulb/room/2']);
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
    });

    it('Should allow to remove device by object ID', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/remove', stringify({id: "bulb"}));
        await flushPromises();
        expect(device.removeFromNetwork).toHaveBeenCalledTimes(1);
        expect(device.removeFromDatabase).not.toHaveBeenCalled();
        expect(settings.getDevice('bulb')).toBeNull();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/remove',
            stringify({"data":{"id": "bulb","block":false,"force":false},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to force remove device', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/remove', stringify({id: "bulb", force: true}));
        await flushPromises();
        expect(device.removeFromDatabase).toHaveBeenCalledTimes(1);
        expect(device.removeFromNetwork).not.toHaveBeenCalled();
        expect(settings.getDevice('bulb')).toBeNull();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/remove',
            stringify({"data":{"id": "bulb","block":false,"force":true},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to block device', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/remove', stringify({id: "bulb", block: true, force: true}));
        await flushPromises();
        expect(device.removeFromDatabase).toHaveBeenCalledTimes(1);
        expect(settings.getDevice('bulb')).toBeNull();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/remove',
            stringify({"data":{"id": "bulb","block":true,"force":true},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
        expect(settings.get().blocklist).toStrictEqual(["0x000b57fffec6a5b2"]);
    });

    it('Should allow to remove group', async () => {
        const group = zigbeeHerdsman.groups.group_1;
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/remove', 'group_1');
        await flushPromises();
        expect(group.removeFromNetwork).toHaveBeenCalledTimes(1);
        expect(settings.getGroup('group_1')).toBeNull();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/remove',
            stringify({"data":{"id": "group_1", "force": false},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to force remove group', async () => {
        const group = zigbeeHerdsman.groups.group_1;
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/remove', stringify({id: "group_1", force: true}));
        await flushPromises();
        expect(group.removeFromDatabase).toHaveBeenCalledTimes(1);
        expect(settings.getGroup('group_1')).toBeNull();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/remove',
            stringify({"data":{"id": "group_1", "force": true},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should throw error on removing non-existing device', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/remove', stringify({id: "non-existing-device"}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/remove',
            stringify({"data":{},"status":"error","error":"Device 'non-existing-device' does not exist"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should throw error when remove device fails', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        MQTT.publish.mockClear();
        device.removeFromNetwork.mockImplementationOnce(() => {throw new Error('device timeout')})
        MQTT.events.message('zigbee2mqtt/bridge/request/device/remove', stringify({id: "bulb"}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/remove',
            stringify({"data":{},"status":"error","error":"Failed to remove device 'bulb' (block: false, force: false) (Error: device timeout)"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow rename device', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/rename', stringify({from: 'bulb', to: 'bulb_new_name'}));
        await flushPromises();
        expect(settings.getDevice('bulb')).toBeNull();
        expect(settings.getDevice('bulb_new_name')).toStrictEqual({"ID": "0x000b57fffec6a5b2", "friendly_name": "bulb_new_name", "friendlyName": "bulb_new_name", "retain": true});
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb', '', {retain: true, qos: 0}, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bulb_new_name', stringify({"brightness":50,"color_temp":370,"linkquality":99,"state":"ON"}), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/rename',
            stringify({"data":{"from":"bulb","to":"bulb_new_name","homeassistant_rename":false},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Shouldnt allow rename device with to now allowed name', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/rename', stringify({from: 'bulb', to: 'living_room/blinds/center'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/rename',
            stringify({"data":{},"status":"error","error":"friendly_name is not allowed to end with: '/center'"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow rename group', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/rename', stringify({from: 'group_1', to: 'group_new_name'}));
        await flushPromises();
        expect(settings.getGroup('group_1')).toBeNull();
        expect(settings.getGroup('group_new_name')).toStrictEqual({"ID": 1, "devices": [], "friendly_name": "group_new_name", "friendlyName": "group_new_name", "retain": false});
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/rename',
            stringify({"data":{"from":"group_1","to":"group_new_name","homeassistant_rename":false},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should throw error on invalid device rename payload', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/rename', stringify({from_bla: 'bulb', to: 'bulb_new_name'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/rename',
            stringify({"data":{},"status":"error","error":"Invalid payload"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should throw error on non-existing device rename', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/rename', stringify({from: 'bulb_not_existing', to: 'bulb_new_name'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/rename',
            stringify({"data":{},"status":"error","error":"Device 'bulb_not_existing' does not exist"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to rename last joined device', async () => {
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.deviceJoined({device: zigbeeHerdsman.devices.bulb});
        MQTT.events.message('zigbee2mqtt/bridge/request/device/rename', stringify({last: true, to: 'bulb_new_name'}));
        await flushPromises();
        expect(settings.getDevice('bulb')).toBeNull();
        expect(settings.getDevice('bulb_new_name')).toStrictEqual({"ID": "0x000b57fffec6a5b2", "friendly_name": "bulb_new_name", "friendlyName": "bulb_new_name", "retain": true});
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/devices', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/rename',
            stringify({"data":{"from":"bulb","to":"bulb_new_name","homeassistant_rename":false},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should throw error when renaming device through not allowed friendlyName', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/rename', stringify({from: 'bulb', to: 'bulb_new_name/1'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/rename',
            stringify({"data":{},"status":"error","error":`Friendly name cannot end with a "/DIGIT" ('bulb_new_name/1')`}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should throw error when renaming last joined device but none has joined', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/rename', stringify({last: true, to: 'bulb_new_name'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/rename',
            stringify({"data":{},"status":"error","error":"No device has joined since start"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow change device options', async () => {
        MQTT.publish.mockClear();
        expect(settings.getDevice('bulb')).toStrictEqual({"ID": "0x000b57fffec6a5b2", "friendly_name": "bulb", "friendlyName": "bulb", "retain": true});
        MQTT.events.message('zigbee2mqtt/bridge/request/device/options', stringify({options: {retain: false, transition: 1}, id: 'bulb'}));
        await flushPromises();
        expect(settings.getDevice('bulb')).toStrictEqual({"ID": "0x000b57fffec6a5b2", "friendly_name": "bulb", "friendlyName": "bulb", "retain": false, "transition": 1});
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/options',
            stringify({"data":{"from":{"retain": true},"to":{"retain": false,"transition":1}, "id":"bulb"},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to remove device option', async () => {
        MQTT.publish.mockClear();
        settings.set(['devices', '0x000b57fffec6a5b2', 'qos'], 1);
        expect(settings.getDevice('bulb')).toStrictEqual({"ID": "0x000b57fffec6a5b2", "friendly_name": "bulb", "friendlyName": "bulb", "qos": 1, "retain": true});
        MQTT.events.message('zigbee2mqtt/bridge/request/device/options', stringify({options: {qos: null}, id: 'bulb'}));
        await flushPromises();
        expect(settings.getDevice('bulb')).toStrictEqual({"ID": "0x000b57fffec6a5b2", "friendly_name": "bulb", "friendlyName": "bulb", "retain": true});
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/options',
            stringify({"data":{"from":{"retain": true, "qos": 1},"to":{"retain": true}, "id":"bulb"},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow change group options', async () => {
        MQTT.publish.mockClear();
        expect(settings.getGroup('group_1')).toStrictEqual({"ID": 1, "devices": [], "friendly_name": "group_1", "retain": false, "friendlyName": "group_1"});
        MQTT.events.message('zigbee2mqtt/bridge/request/group/options', stringify({options: {retain: true, transition: 1}, id: 'group_1'}));
        await flushPromises();
        expect(settings.getGroup('group_1')).toStrictEqual({"ID": 1, "devices": [], "friendly_name": "group_1", "retain": true, "friendlyName": "group_1", "transition": 1});
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/options',
            stringify({"data":{"from":{"retain": false},"to":{"retain": true,"transition":1}, "id":"group_1"},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should throw error on invalid device change options payload', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/options', stringify({options_: {retain: true, transition: 1}, id: 'bulb'}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/options',
            stringify({"data":{},"status":"error","error":"Invalid payload"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to add group by string', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/add', 'group_193');
        await flushPromises();
        expect(settings.getGroup('group_193')).toStrictEqual({"ID": 3, "devices": [], "friendly_name": "group_193", "friendlyName": "group_193"});
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/add',
            stringify({"data":{"friendly_name":"group_193","id": 3},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to add group with ID', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/add', stringify({friendly_name: "group_193", id: 92}));
        await flushPromises();
        expect(settings.getGroup('group_193')).toStrictEqual({"ID": 92, "devices": [], "friendly_name": "group_193", "friendlyName": "group_193"});
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/groups', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/add',
            stringify({"data":{"friendly_name":"group_193","id": 92},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Shouldnt allow to add group with empty name', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/add', stringify({friendly_name: "", id: 9}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/add',
            stringify({"data":{},"status":"error","error":"friendly_name must be at least 1 char long"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should throw error when add with invalid payload', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/group/add', stringify({friendly_name9: "group_193"}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/group/add',
            stringify({"data":{},"status":"error","error":"Invalid payload"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to enable/disable Home Assistant extension', async () => {
        // Test if disabled intially
        const device = zigbeeHerdsman.devices.WXKG11LM;
        settings.set(['devices', device.ieeeAddr, 'legacy'], false);
        const payload = {data: {onOff: 1}, cluster: 'genOnOff', device, endpoint: device.getEndpoint(1), type: 'attributeReport', linkquality: 10};
        await zigbeeHerdsman.events.message(payload);
        expect(settings.get().homeassistant).toBeFalsy();
        expect(MQTT.publish).not.toHaveBeenCalledWith('zigbee2mqtt/button/action', 'single', {retain: false, qos: 0}, expect.any(Function));

        // Disable when already disabled should go OK
        MQTT.events.message('zigbee2mqtt/bridge/request/config/homeassistant', stringify({value: false}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/homeassistant',
            stringify({"data":{"value":false},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
        expect(settings.get().homeassistant).toBeFalsy();

        // Enable
        MQTT.events.message('zigbee2mqtt/bridge/request/config/homeassistant', stringify({value: true}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/homeassistant',
            stringify({"data":{"value":true},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
        expect(settings.get().homeassistant).toBeTruthy();
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/button/action', 'single', {retain: false, qos: 0}, expect.any(Function));

        // Disable
        MQTT.events.message('zigbee2mqtt/bridge/request/config/homeassistant', stringify({value: false}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/homeassistant',
            stringify({"data":{"value":false},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
        expect(settings.get().homeassistant).toBeFalsy();
        MQTT.publish.mockClear();
        await zigbeeHerdsman.events.message(payload);
        await flushPromises();
        expect(MQTT.publish).not.toHaveBeenCalledWith('zigbee2mqtt/button/action', 'single', {retain: false, qos: 0}, expect.any(Function));
    });

    it('Should fail to set Home Assistant when invalid type', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/homeassistant', 'invalid_one');
        await flushPromises();
        expect(settings.get().homeassistant).toBeFalsy();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/homeassistant',
            stringify({"data":{},"status":"error","error":"'invalid_one' is not an allowed value, allowed: true,false"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to set last_seen', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/last_seen', 'ISO_8601');
        await flushPromises();
        expect(settings.get().advanced.last_seen).toBe('ISO_8601');
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/last_seen',
            stringify({"data":{"value":"ISO_8601"},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should fail to set last_seen when invalid type', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/last_seen', 'invalid_one');
        await flushPromises();
        expect(settings.get().advanced.last_seen).toBe('disable');
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/last_seen',
            stringify({"data":{},"status":"error","error":"'invalid_one' is not an allowed value, allowed: disable,ISO_8601,epoch,ISO_8601_local"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to set elapsed', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/elapsed', 'true');
        await flushPromises();
        expect(settings.get().advanced.elapsed).toBe(true);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/elapsed',
            stringify({"data":{"value":true},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should fail to set last_seen when invalid type', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/elapsed', 'not_valid');
        await flushPromises();
        expect(settings.get().advanced.elapsed).toBe(false);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/elapsed',
            stringify({"data":{},"status":"error","error":"'not_valid' is not an allowed value, allowed: true,false"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to set log level', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/log_level', 'debug');
        await flushPromises();
        expect(logger.getLevel()).toBe('debug');
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/info', expect.any(String), expect.any(Object), expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/log_level',
            stringify({"data":{"value":'debug'},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should fail to set log level when invalid type', async () => {
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/config/log_level', 'not_valid');
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/config/log_level',
            stringify({"data":{},"status":"error","error":"'not_valid' is not an allowed value, allowed: error,warn,info,debug"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to touchlink factory reset (succeeds)', async () => {
        MQTT.publish.mockClear();
        zigbeeHerdsman.touchlinkFactoryResetFirst.mockClear();
        zigbeeHerdsman.touchlinkFactoryResetFirst.mockReturnValueOnce(true);
        MQTT.events.message('zigbee2mqtt/bridge/request/touchlink/factory_reset', '');
        await flushPromises();
        expect(zigbeeHerdsman.touchlinkFactoryResetFirst).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/touchlink/factory_reset',
            stringify({"data":{},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to touchlink factory reset specific device', async () => {
        MQTT.publish.mockClear();
        zigbeeHerdsman.touchlinkFactoryReset.mockClear();
        zigbeeHerdsman.touchlinkFactoryReset.mockReturnValueOnce(true);
        MQTT.events.message('zigbee2mqtt/bridge/request/touchlink/factory_reset', stringify({ieee_address: '0x1239', channel: 12}));
        await flushPromises();
        expect(zigbeeHerdsman.touchlinkFactoryReset).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.touchlinkFactoryReset).toHaveBeenCalledWith('0x1239', 12);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/touchlink/factory_reset',
            stringify({"data":{"ieee_address":'0x1239',"channel":12},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to touchlink identify specific device', async () => {
        MQTT.publish.mockClear();
        zigbeeHerdsman.touchlinkIdentify.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/touchlink/identify', stringify({ieee_address: '0x1239', channel: 12}));
        await flushPromises();
        expect(zigbeeHerdsman.touchlinkIdentify).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.touchlinkIdentify).toHaveBeenCalledWith('0x1239', 12);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/touchlink/identify',
            stringify({"data":{"ieee_address":'0x1239',"channel":12},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Touchlink identify fails when payload is invalid', async () => {
        MQTT.publish.mockClear();
        zigbeeHerdsman.touchlinkIdentify.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/touchlink/identify', stringify({ieee_address: '0x1239'}));
        await flushPromises();
        expect(zigbeeHerdsman.touchlinkIdentify).toHaveBeenCalledTimes(0);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/touchlink/identify',
            stringify({"data":{},"status":"error","error":"Invalid payload"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to touchlink factory reset (fails)', async () => {
        MQTT.publish.mockClear();
        zigbeeHerdsman.touchlinkFactoryResetFirst.mockClear();
        zigbeeHerdsman.touchlinkFactoryResetFirst.mockReturnValueOnce(false);
        MQTT.events.message('zigbee2mqtt/bridge/request/touchlink/factory_reset', '');
        await flushPromises();
        expect(zigbeeHerdsman.touchlinkFactoryResetFirst).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/touchlink/factory_reset',
            stringify({"data":{},"status":"error","error":"Failed to factory reset device through Touchlink"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to touchlink scan', async () => {
        MQTT.publish.mockClear();
        zigbeeHerdsman.touchlinkScan.mockClear();
        zigbeeHerdsman.touchlinkScan.mockReturnValueOnce([{ieeeAddr: '0x123', channel: 12}, {ieeeAddr: '0x124', channel: 24}]);
        MQTT.events.message('zigbee2mqtt/bridge/request/touchlink/scan', '');
        await flushPromises();
        expect(zigbeeHerdsman.touchlinkScan).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/touchlink/scan',
            stringify({"data":{"found":[{ieee_address: '0x123', channel: 12}, {ieee_address: '0x124', channel: 24}]},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to configure reporting', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const endpoint = device.getEndpoint(1);
        endpoint.configureReporting.mockClear();
        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/configure_reporting', stringify({id: 'bulb', cluster: 'genLevelCtrl', attribute: 'currentLevel', maximum_report_interval: 10, minimum_report_interval: 1, reportable_change: 1}));
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
        expect(endpoint.bind).toHaveBeenCalledWith('genLevelCtrl', coordinator.endpoints[0]);
        expect(endpoint.configureReporting).toHaveBeenCalledTimes(1);
        expect(endpoint.configureReporting).toHaveBeenCalledWith('genLevelCtrl', [{"attribute": "currentLevel", "maximumReportInterval": 10, "minimumReportInterval": 1, "reportableChange": 1}]);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/configure_reporting',
            stringify({"data":{id: 'bulb', cluster: 'genLevelCtrl', attribute: 'currentLevel', maximum_report_interval: 10, minimum_report_interval: 1, reportable_change: 1},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/devices',
          expect.any(String),
          { retain: true, qos: 0 },
          expect.any(Function)
        );
    });

    it('Should throw error when configure reporting is called with misformed payload', async () => {
        const device = zigbeeHerdsman.devices.bulb;
        const endpoint = device.getEndpoint(1);
        endpoint.configureReporting.mockClear();
        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/device/configure_reporting', stringify({id: 'bulb', cluster: 'genLevelCtrl', attribute_lala: 'currentLevel', maximum_report_interval: 10, minimum_report_interval: 1, reportable_change: 1}));
        await flushPromises();
        expect(endpoint.configureReporting).toHaveBeenCalledTimes(0);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/configure_reporting',
            stringify({"data":{},"status":"error","error":"Invalid payload"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Should allow to restart', async () => {
        zigbeeHerdsman.permitJoin.mockClear();
        jest.useFakeTimers();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/restart', '');
        await flushPromises();
        jest.runAllTimers();
        expect(mockRestart).toHaveBeenCalledTimes(1);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/restart',
            stringify({"data":{},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
        jest.useRealTimers();
    });

    it('Change options', async () => {
        zigbeeHerdsman.permitJoin.mockClear();
        settings.apply({permit_join: false});
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/options', stringify({options: {permit_join: true}}));
        await flushPromises();
        expect(settings.get().permit_join).toBe(true);
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledTimes(1);
        expect(zigbeeHerdsman.permitJoin).toHaveBeenCalledWith(true, undefined, undefined);
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/info', expect.any(String), { retain: true, qos: 0 }, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/options',
            stringify({"data":{"restart_required":false},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Change options and apply - homeassistant', async () => {
        expect(controller.extensions.find((e) => e.constructor.name === 'HomeAssistant')).toBeUndefined();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/options', stringify({options: {homeassistant: true}}));
        await flushPromises();
        expect(controller.extensions.find((e) => e.constructor.name === 'HomeAssistant')).not.toBeUndefined();
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/info', expect.any(String), { retain: true, qos: 0 }, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/options',
            stringify({"data":{"restart_required":false},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Change options and apply - log_level', async () => {
        logger.setLevel('info');
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/options', stringify({options: {advanced: {log_level: 'debug'}}}));
        await flushPromises();
        expect(logger.getLevel()).toBe('debug');
        expect(MQTT.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/info', expect.any(String), { retain: true, qos: 0 }, expect.any(Function));
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/options',
            stringify({"data":{"restart_required":false},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Change options restart required', async () => {
        zigbeeHerdsman.permitJoin.mockClear();
        settings.apply({serial: {port: '123'}});
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/options', stringify({options: {serial: {port: '/dev/newport'}}}));
        await flushPromises();
        expect(settings.get().serial.port).toBe('/dev/newport');
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/options',
            stringify({"data":{"restart_required":true},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Change options array', async () => {
        zigbeeHerdsman.permitJoin.mockClear();
        expect(settings.get().advanced.ext_pan_id).toStrictEqual([221, 221, 221, 221, 221, 221, 221, 221])
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/options', stringify({options: {advanced: {ext_pan_id: [220, 221, 221, 221, 221, 221, 221, 221]}}}));
        await flushPromises();
        expect(settings.get().advanced.ext_pan_id).toStrictEqual([220, 221, 221, 221, 221, 221, 221, 221]);
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/options',
            stringify({"data":{"restart_required":true},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Change options with null', async () => {
        zigbeeHerdsman.permitJoin.mockClear();
        expect(settings.get().serial).toStrictEqual({"disable_led": false, "port": "/dev/dummy"})
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/options', stringify({"options":{"serial":{"disable_led":false,"port":null}}}));
        await flushPromises();
        expect(settings.get().serial).toStrictEqual({"disable_led": false, "port": null});
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/options',
            stringify({"data":{"restart_required":true},"status":"ok"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Change options invalid payload', async () => {
        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/options', 'I am invalid');
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/options',
            stringify({"data":{},"error": "Invalid payload", "status":"error"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Change options not valid against schema', async () => {
        zigbeeHerdsman.permitJoin.mockClear();
        MQTT.publish.mockClear();
        MQTT.events.message('zigbee2mqtt/bridge/request/options', stringify({options: {permit_join: 'true'}}));
        await flushPromises();
        expect(MQTT.publish).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/options',
            stringify({"data":{},"error": "permit_join should be boolean", "status":"error"}),
            {retain: false, qos: 0}, expect.any(Function)
        );
    });

    it('Icon link handling', async () => {
        const bridge = controller.extensions.find((e) => e.constructor.name === 'Bridge');
        expect(bridge).not.toBeUndefined();

        const definition = {'model': 'lumi.plug'};
        const device = zigbeeHerdsman.devices.ZNCZ02LM;
        const svg_icon = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDo';
        const icon_link =  'https://www.zigbee2mqtt.io/images/devices/ZNCZ02LM.jpg';
        definition.icon = icon_link;
        let payload = bridge.getDefinitionPayload(definition, {device: device});
        expect(payload).not.toBeUndefined()
        expect(payload['icon']).not.toBeUndefined()
        expect(payload.icon).toBe(icon_link);

        definition.icon = icon_link;
        payload = bridge.getDefinitionPayload(definition, {device: device, settings: {icon: svg_icon}});
        expect(payload).not.toBeUndefined()
        expect(payload['icon']).not.toBeUndefined()
        expect(payload.icon).toBe(svg_icon);

        definition.icon = '_${model}_';
        payload = bridge.getDefinitionPayload(definition, {device: device});
        expect(payload).not.toBeUndefined()
        expect(payload['icon']).not.toBeUndefined()
        expect(payload.icon).toBe('_lumi.plug_');

        definition.icon = '_${model}_${zigbeeModel}_';
        payload = bridge.getDefinitionPayload(definition, {device: device});
        expect(payload).not.toBeUndefined()
        expect(payload['icon']).not.toBeUndefined()
        expect(payload.icon).toBe('_lumi.plug_lumi.plug_');

        definition.icon = svg_icon;
        payload = bridge.getDefinitionPayload(definition, {device: device});
        expect(payload).not.toBeUndefined()
        expect(payload['icon']).not.toBeUndefined()
        expect(payload.icon).toBe(svg_icon);


        device.modelID = '?._Z\\NC+Z02*LM';
        definition.model = '&&&&*+';
        definition.icon = '_${model}_${zigbeeModel}_';
        payload = bridge.getDefinitionPayload(definition, {device: device});
        expect(payload).not.toBeUndefined()
        expect(payload['icon']).not.toBeUndefined()
        expect(payload.icon).toBe('_------_-._Z-NC-Z02-LM_');
    });
});
