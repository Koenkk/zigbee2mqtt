const fz = require('./converters/fromZigbee');
const tz = require('./converters/toZigbee');

const LED1623G12 = {
    model: 'LED1623G12',
    vendor: 'IKEA',
    description: 'TRADFRI LED bulb E27 1000 lumen, dimmable, opal white',
    supports: 'on/off, brightness',
    fromZigbee: [fz.light_brightness, fz.ignore_onoff_change],
    toZigbee: [tz.onoff, tz.light_brightness],
};

const LED1536G5 = {
    model: 'LED1536G5',
    vendor: 'IKEA',
    description: 'TRADFRI LED bulb E12/E14 400 lumen, dimmable, white spectrum, opal white',
    supports: 'on/off, brightness, color temperature',
    fromZigbee: [fz.light_brightness, fz.light_color_colortemp, fz.ignore_onoff_change],
    toZigbee: [tz.onoff, tz.light_brightness, tz.light_colortemp],
};

const devices = {
    // Xiaomi
    'lumi.sensor_switch': {
        model: 'WXKG01LM',
        vendor: 'Xiaomi',
        description: 'MiJia wireless switch',
        supports: 'single, double, triple, quadruple, many and long click',
        fromZigbee: [fz.xiaomi_battery_3v, fz.WXKG01LM_click, fz.ignore_onoff_change, fz.ignore_basic_change],
        toZigbee: [],
    },
    'lumi.sensor_switch.aq2': {
        model: 'WXKG11LM',
        vendor: 'Xiaomi',
        description: 'Aqara wireless switch',
        supports: 'single, double, triple, quadruple click',
        fromZigbee: [fz.xiaomi_battery_3v, fz.WXKG11LM_click, fz.ignore_onoff_change, fz.ignore_basic_change],
        toZigbee: [],
    },
    'lumi.sensor_86sw1\u0000lu': {
        model: 'WXKG03LM',
        vendor: 'Xiaomi',
        description: 'Aqara single key wireless wall switch',
        supports: 'single click',
        fromZigbee: [fz.xiaomi_battery_3v, fz.WXKG03LM_click],
        toZigbee: [],
    },
    'lumi.sensor_86sw2\u0000Un': {
        model: 'WXKG02LM',
        vendor: 'Xiaomi',
        description: 'Aqara double key wireless wall switch',
        supports: 'left, right and both click',
        fromZigbee: [fz.xiaomi_battery_3v, fz.WXKG02LM_click],
        toZigbee: [],
    },
    'lumi.ctrl_neutral1': {
        model: 'QBKG04LM',
        vendor: 'Xiaomi',
        description: 'Aqara single key wired wall switch',
        supports: 'on/off',
        fromZigbee: [fz.QBKG04LM_state, fz.ignore_onoff_change],
        toZigbee: [tz.onoff],
        ep: {'': 2},
    },
    'lumi.ctrl_neutral2': {
        model: 'QBKG03LM',
        vendor: 'Xiaomi',
        description: 'Aqara double key wired wall switch',
        supports: 'l1 and l2 on/off',
        fromZigbee: [fz.QBKG03LM_state, fz.ignore_onoff_change],
        toZigbee: [tz.onoff],
        ep: {'l1': 2, 'l2': 3},
    },
    'lumi.sens': {
        model: 'WSDCGQ01LM',
        vendor: 'Xiaomi',
        description: 'MiJia temperature & humidity sensor ',
        supports: 'temperature and humidity',
        fromZigbee: [fz.xiaomi_battery_3v, fz.xiaomi_temperature, fz.xiaomi_humidity, fz.ignore_basic_change],
        toZigbee: [],
    },
    'lumi.weather': {
        model: 'WSDCGQ11LM',
        vendor: 'Xiaomi',
        description: 'Aqara temperature, humidity and pressure sensor',
        supports: 'temperature, humidity and pressure',
        fromZigbee: [
            fz.xiaomi_battery_3v, fz.xiaomi_temperature, fz.xiaomi_humidity, fz.xiaomi_pressure, fz.ignore_basic_change,
            fz.ignore_temperature_change, fz.ignore_humidity_change, fz.ignore_pressure_change,
        ],
        toZigbee: [],
    },
    'lumi.sensor_motion': {
        model: 'RTCGQ01LM',
        vendor: 'Xiaomi',
        description: 'MiJia human body movement sensor',
        supports: 'occupancy',
        fromZigbee: [fz.xiaomi_battery_3v, fz.xiaomi_occupancy, fz.ignore_basic_change],
        toZigbee: [],
    },
    'lumi.sensor_motion.aq2': {
        model: 'RTCGQ11LM',
        vendor: 'Xiaomi',
        description: 'Aqara human body movement and illuminance sensor',
        supports: 'occupancy and illuminance',
        fromZigbee: [
            fz.xiaomi_battery_3v, fz.xiaomi_occupancy, fz.xiaomi_illuminance, fz.ignore_basic_change,
            fz.ignore_illuminance_change, fz.ignore_occupancy_change,
        ],
        toZigbee: [],
    },
    'lumi.sensor_magnet': {
        model: 'MCCGQ01LM',
        vendor: 'Xiaomi',
        description: 'MiJia door & window contact sensor',
        supports: 'contact',
        fromZigbee: [fz.xiaomi_battery_3v, fz.xiaomi_contact, fz.ignore_onoff_change, fz.ignore_basic_change],
        toZigbee: [],
    },
    'lumi.sensor_magnet.aq2': {
        model: 'MCCGQ11LM',
        vendor: 'Xiaomi',
        description: 'Aqara door & window contact sensor',
        supports: 'contact',
        fromZigbee: [fz.xiaomi_battery_3v, fz.xiaomi_contact, fz.ignore_onoff_change, fz.ignore_basic_change],
        toZigbee: [],
    },
    'lumi.sensor_wleak.aq1': {
        model: 'SJCGQ11LM',
        vendor: 'Xiaomi',
        description: 'Aqara water leak sensor',
        supports: 'water leak true/false',
        fromZigbee: [
            fz.xiaomi_battery_3v, fz.SJCGQ11LM_water_leak_basic, fz.SJCGQ11LM_water_leak_iaszone,
            fz.ignore_basic_change,
        ],
        toZigbee: [],
    },
    'lumi.sensor_cube': {
        model: 'MFKZQ01LM',
        vendor: 'Xiaomi',
        description: 'Mi smart home cube',
        supports: 'shake, wakeup, fall, tap, slide, flip180, flip90, rotate_left and rotate_right',
        fromZigbee: [
            fz.xiaomi_battery_3v, fz.MFKZQ01LM_action_multistate, fz.MFKZQ01LM_action_analog,
            fz.ignore_analog_change, fz.ignore_multistate_change,
        ],
        toZigbee: [],
    },
    'lumi.plug': {
        model: 'ZNCZ02LM',
        description: 'Mi power plug ZigBee',
        supports: 'on/off, power measurement',
        vendor: 'Xiaomi',
        fromZigbee: [
            fz.xiaomi_state, fz.xiaomi_power, fz.ZNCZ02LM_state, fz.ignore_onoff_change,
            fz.ignore_basic_change, fz.ignore_analog_change,
        ],
        toZigbee: [tz.onoff],
    },
    'lumi.ctrl_86plug': {
        model: 'QBCZ11LM',
        description: 'Aqara socket Zigbee',
        supports: 'on/off, power measurement',
        vendor: 'Xiaomi',
        fromZigbee: [fz.xiaomi_state, fz.xiaomi_power, fz.ignore_onoff_change, fz.ignore_analog_change],
        toZigbee: [tz.onoff],
    },
    'lumi.sensor_smoke': {
        model: 'JTYJ-GD-01LM/BW',
        description: 'MiJia Honeywell smoke detector',
        supports: 'smoke',
        vendor: 'Xiaomi',
        fromZigbee: [fz.xiaomi_battery_3v, fz.JTYJGD01LMBW_smoke, fz.ignore_basic_change],
        toZigbee: [],
    },

    // IKEA
    'TRADFRI bulb E27 WS opal 980lm': {
        model: 'LED1545G12',
        vendor: 'IKEA',
        description: 'TRADFRI LED bulb E27 980 lumen, dimmable, white spectrum, opal white',
        supports: 'on/off, brightness, color temperature',
        fromZigbee: [fz.light_brightness, fz.light_color_colortemp, fz.ignore_onoff_change],
        toZigbee: [tz.onoff, tz.light_brightness, tz.light_colortemp],
    },
    // LED1623G12 uses 2 model IDs, see https://github.com/Koenkk/zigbee2mqtt/issues/21
    'TRADFRI bulb E27 opal 1000lm': LED1623G12,
    'TRADFRI bulb E27 W opal 1000lm': LED1623G12,
    'TRADFRI bulb GU10 WS 400lm': {
        model: 'LED1537R6',
        vendor: 'IKEA',
        description: 'TRADFRI LED bulb GU10 400 lumen, dimmable, white spectrum',
        supports: 'on/off, brightness, color temperature',
        fromZigbee: [fz.light_brightness, fz.light_color_colortemp, fz.ignore_onoff_change],
        toZigbee: [tz.onoff, tz.light_brightness, tz.light_colortemp],
    },
    'TRADFRI bulb GU10 W 400lm': {
        model: 'LED1650R5',
        vendor: 'IKEA',
        description: 'TRADFRI LED bulb GU10 400 lumen, dimmable',
        supports: 'on/off, brightness',
        fromZigbee: [fz.light_brightness, fz.ignore_onoff_change],
        toZigbee: [tz.onoff, tz.light_brightness],
    },
    // LED1536G5 has an E12 and E14 version.
    'TRADFRI bulb E14 WS opal 400lm': LED1536G5,
    'TRADFRI bulb E12 WS opal 400lm': LED1536G5,
    'TRADFRI bulb E26 opal 1000lm': {
        model: 'LED1622G12',
        vendor: 'IKEA',
        description: 'TRADFRI LED bulb E26 1000 lumen, dimmable, opal white',
        supports: 'on/off, brightness',
        fromZigbee: [fz.light_brightness, fz.ignore_onoff_change],
        toZigbee: [tz.onoff, tz.light_brightness],
    },

    // Philips
    'LLC020': {
        model: '7146060PH',
        vendor: 'Philips',
        description: 'Hue Go',
        supports: 'on/off, brightness, color temperature, color xy',
        fromZigbee: [fz.light_brightness, fz.light_color_colortemp, fz.ignore_onoff_change],
        toZigbee: [tz.onoff, tz.light_brightness, tz.light_colortemp, tz.light_color],
    },

    // Belkin
    'MZ100': {
        model: 'F7C033',
        vendor: 'Belkin',
        description: 'WeMo smart LED bulb',
        supports: 'on/off, brightness',
        fromZigbee: [fz.light_brightness, fz.ignore_onoff_change],
        toZigbee: [tz.onoff, tz.light_brightness],
    },

    // EDP
    'ZB-SmartPlug-1.0.0': {
        model: 'PLUG EDP RE:DY',
        vendor: 'EDP',
        description: 're:dy plug',
        supports: 'on/off, power measurement',
        fromZigbee: [fz.ignore_onoff_change, fz.EDP_power, fz.ignore_metering_change],
        toZigbee: [tz.onoff],
        report: [{
            'cid': 'seMetering',
            'attr': 'instantaneousDemand',
            'ep': 85,
            'minInt': 10,
            'maxInt': 60,
            'repChange': 1,
        }],
    },

    // Texax Instruments
    'lumi.router': {
        model: 'CC2530.ROUTER',
        vendor: 'Texas Instruments',
        description: '[CC2530 router](http://ptvo.info/cc2530-based-zigbee-coordinator-and-router-112/)',
        supports: 'state, description, type, rssi',
        fromZigbee: [fz.CC2530ROUTER_state, fz.CC2530ROUTER_meta],
        toZigbee: [],
    },
};

module.exports = devices;
