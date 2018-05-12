const homeassistant = require('./homeassistant').configurations;

const devices = {
    // Xiaomi
    'lumi.sensor_switch': {
        model: 'WXKG01LM',
        vendor: 'Xiaomi',
        description: 'MiJia wireless switch',
        supports: 'single, double, triple, quadruple, many and long click',
        homeassistant: [homeassistant.sensor_click]
    },
    'lumi.sensor_switch.aq2': {
        model: 'WXKG11LM',
        vendor: 'Xiaomi',
        description: 'Aqara wireless switch',
        supports: 'single, double, triple, quadruple click',
        homeassistant: [homeassistant.sensor_click]
    },
    'lumi.sensor_86sw1\u0000lu': {
        model: 'WXKG03LM',
        vendor: 'Xiaomi',
        description: 'Aqara single key wireless wall switch',
        supports: 'single click',
        homeassistant: [homeassistant.sensor_click]
    },
    'lumi.sensor_86sw2\u0000Un': {
        model: 'WXKG02LM',
        vendor: 'Xiaomi',
        description: 'Aqara double key wireless wall switch',
        supports: 'left, right and both click',
        homeassistant: [homeassistant.sensor_click]
    },
    'lumi.ctrl_neutral1': {
        model: 'QBKG04LM',
        vendor: 'Xiaomi',
        description: 'Aqara single key wired wall switch',
        supports: 'on/off',
        ep: {'': 2},
        homeassistant: [homeassistant.switch]
    },
    'lumi.ctrl_neutral2': {
        model: 'QBKG03LM',
        vendor: 'Xiaomi',
        description: 'Aqara double key wired wall switch',
        supports: 'l1 and l2 on/off',
        ep: {'l1': 2, 'l2': 3},
        homeassistant: [homeassistant.switch_l1, homeassistant.switch_l2]
    },
    'lumi.sens': {
        model: 'WSDCGQ01LM',
        vendor: 'Xiaomi',
        description: 'MiJia temperature & humidity sensor ',
        supports: 'temperature and humidity',
        homeassistant: [homeassistant.sensor_temperature, homeassistant.sensor_humidity]
    },
    'lumi.weather': {
        model: 'WSDCGQ11LM',
        vendor: 'Xiaomi',
        description: 'Aqara temperature, humidity and pressure sensor',
        supports: 'temperature, humidity and pressure',
        homeassistant: [homeassistant.sensor_temperature, homeassistant.sensor_humidity, homeassistant.sensor_pressure]
    },
    'lumi.sensor_motion': {
        model: 'RTCGQ01LM',
        vendor: 'Xiaomi',
        description: 'MiJia human body movement sensor',
        supports: 'occupancy',
        homeassistant: [homeassistant.binary_sensor_occupancy]
    },
    'lumi.sensor_motion.aq2': {
        model: 'RTCGQ11LM',
        vendor: 'Xiaomi',
        description: 'Aqara human body movement and illuminance sensor',
        supports: 'occupancy and illuminance',
        homeassistant: [homeassistant.binary_sensor_occupancy, homeassistant.sensor_illuminance]
    },
    'lumi.sensor_magnet': {
        model: 'MCCGQ01LM',
        vendor: 'Xiaomi',
        description: 'MiJia door & window contact sensor',
        supports: 'contact',
        homeassistant: [homeassistant.binary_sensor_contact]
    },
    'lumi.sensor_magnet.aq2': {
        model: 'MCCGQ11LM',
        vendor: 'Xiaomi',
        description: 'Aqara door & window contact sensor',
        supports: 'contact',
        homeassistant: [homeassistant.binary_sensor_contact]
    },
    'lumi.sensor_wleak.aq1': {
        model: 'SJCGQ11LM',
        vendor: 'Xiaomi',
        description: 'Aqara water leak sensor',
        supports: 'water leak true/false',
        homeassistant: [homeassistant.binary_sensor_water_leak]
    },
    'lumi.sensor_cube': {
        model: 'MFKZQ01LM',
        vendor: 'Xiaomi',
        description: 'Mi smart home cube',
        supports: 'shake, wakeup, fall, tap, slide, flip180, flip90, rotate_left and rotate_right',
        homeassistant: [homeassistant.sensor_action]
    },
    'lumi.plug': {
        model: 'ZNCZ02LM',
        description: 'Mi power plug ZigBee',
        supports: 'on/off, power measurement',
        vendor: 'Xiaomi',
        homeassistant: [homeassistant.switch, homeassistant.sensor_power]
    },
    'lumi.ctrl_86plug': {
        model: 'QBCZ11LM',
        description: 'Aqara socket Zigbee',
        supports: 'on/off, power measurement',
        vendor: 'Xiaomi',
        homeassistant: [homeassistant.switch, homeassistant.sensor_power]
    },

    // IKEA
    'TRADFRI bulb E27 WS opal 980lm': {
        model: 'LED1545G12',
        vendor: 'IKEA',
        description: 'TRADFRI LED bulb E27 980 lumen, dimmable, white spectrum, opal white',
        supports: 'on/off, brightness, color temperature',
        homeassistant: [homeassistant.light_brightness_colortemp]
    },
    'TRADFRI bulb E27 opal 1000lm': {
        model: 'LED1623G12',
        vendor: 'IKEA',
        description: 'TRADFRI LED bulb E27 1000 lumen, dimmable, opal white',
        supports: 'on/off, brightness',
        homeassistant: [homeassistant.light_brightness]
    },
    'TRADFRI bulb GU10 WS 400lm': {
        model: 'LED1537R6',
        vendor: 'IKEA',
        description: 'TRADFRI LED bulb GU10 400 lumen, dimmable, white spectrum',
        supports: 'on/off, brightness, color temperature',
        homeassistant: [homeassistant.light_brightness_colortemp]
    },
    'TRADFRI bulb GU10 W 400lm': {
        model: 'LED1650R5',
        vendor: 'IKEA',
        description: 'TRADFRI LED bulb GU10 400 lumen, dimmable',
        supports: 'on/off, brightness',
        homeassistant: [homeassistant.light_brightness]
    },
    'TRADFRI bulb E14 WS opal 400lm': {
        model: 'LED1536G5',
        vendor: 'IKEA',
        description: 'TRADFRI LED bulb E14 400 lumen, dimmable, white spectrum, opal white',
        supports: 'on/off, brightness, color temperature',
        homeassistant: [homeassistant.light_brightness_colortemp]
    },

    // Philips
    'LLC020': {
        model: '7146060PH',
        vendor: 'Philips',
        description: 'Hue Go',
        supports: 'on/off, brightness, color temperature, color xy',
        homeassistant: [homeassistant.light_brightness_colortemp_xy]
    },
}

module.exports = devices;
